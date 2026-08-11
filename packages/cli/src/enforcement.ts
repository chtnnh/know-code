/**
 * Shared enforcement kernel — gate open, trailer policy, pending-commit check.
 * All shipping commands (check/commit/amend/range/pipeline) should route here.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { readConfig } from "./config.js";
import {
  isGatedTreeCurrent,
  isIndexAlignedWithHead,
  isSignedGateEffective,
  isSignedGateOpen,
  readGateSafe,
  resolveEffectiveQuizState,
  type EffectiveQuizState,
} from "./gate.js";
import { git, hasUnstagedTrackedChanges } from "./git.js";
import { headMatchesRangeSeal } from "./range-seal-bind.js";
import type { Config, GateReceipt, Level } from "./types.js";
import { headHasTrailer, trailerHashFromMessage } from "./trailers.js";

export { hasUnstagedTrackedChanges } from "./git.js";

export {
  resolveEffectiveQuizState,
  isSignedGateEffective,
  type EffectiveQuizState,
} from "./gate.js";

/** HEAD tree still matches the tree sealed at pass (blocks stale-trailer amends). */
export function headTreeMatchesGate(
  repoRoot: string,
  gate: GateReceipt | null,
): boolean {
  if (!gate?.gatedTreeOid) return false;
  const headTree = git(["rev-parse", "HEAD^{tree}"], repoRoot, {
    allowFail: true,
  });
  return Boolean(headTree) && headTree === gate.gatedTreeOid;
}

/**
 * Index tree still matches pass-time gatedTreeOid and there are no unstaged
 * tracked edits. Remaining staged files that are part of the gated tree are
 * allowed (sliced pathspec commits mid-batch).
 */
export function isTreeStableSincePass(
  repoRoot: string,
  gate: GateReceipt | null,
): boolean {
  if (!gate?.gatedTreeOid) return false;
  if (!isGatedTreeCurrent(repoRoot, gate.gatedTreeOid)) return false;
  return !hasUnstagedTrackedChanges(repoRoot);
}

/**
 * Gate is open for shipping: signed gate matches tip hash, or commitDrift
 * with tree still stable since pass.
 *
 * Breaking (0.3.0): gates without gatedTreeOid never open — re-run pass.
 */
export function isGateOpenForShipping(
  repoRoot: string,
  receipt: GateReceipt | null,
  state: EffectiveQuizState,
  requiredLevel?: Level,
): boolean {
  const config = readConfig(repoRoot);
  const level = requiredLevel ?? config.level;
  if (!receipt?.gatedTreeOid) return false;
  if (!isSignedGateEffective(repoRoot, receipt, state, level)) return false;
  // Index hash ignores unstaged edits — close until staged or discarded.
  if (hasUnstagedTrackedChanges(repoRoot)) return false;
  // Index tree must still match the tree sealed at pass.
  if (!isGatedTreeCurrent(repoRoot, receipt.gatedTreeOid)) return false;
  if (state.commitDrift && !isTreeStableSincePass(repoRoot, receipt)) {
    return false;
  }
  // Post range-seal commits (even tree-preserving) must not reuse the pass gate.
  if (!headMatchesRangeSeal(repoRoot)) return false;
  return true;
}

/** HEAD has tip trailer, or passHash trailer while commitDrift is active. */
export function headTrailerSatisfiesCheck(
  repoRoot: string,
  state: EffectiveQuizState,
): boolean {
  const { ctx, effectiveHash, commitDrift } = state;
  if (headHasTrailer(repoRoot, ctx.headRef, ctx.diffHash)) return true;
  if (commitDrift && headHasTrailer(repoRoot, ctx.headRef, effectiveHash)) {
    return true;
  }
  return false;
}

/** Trailer hash to stamp on the next commit/amend. */
export function trailerHashForCommit(state: EffectiveQuizState): string {
  return state.commitDrift ? state.effectiveHash : state.ctx.diffHash;
}

function commitEditMsgPath(repoRoot: string): string | null {
  const rel = git(["rev-parse", "--git-path", "COMMIT_EDITMSG"], repoRoot, {
    allowFail: true,
  });
  if (!rel) return null;
  return isAbsolute(rel) ? rel : join(repoRoot, rel);
}

function readCommitEditMsg(repoRoot: string): string | null {
  const path = commitEditMsgPath(repoRoot);
  if (!path || !existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function normalizeMsg(msg: string): string {
  return msg.replace(/\s+$/u, "");
}

/**
 * True when COMMIT_EDITMSG exists and differs from HEAD — a new commit/amend
 * is in flight. Stale EDITMSG equal to HEAD is treated as not pending.
 */
export function isPendingCommitDistinctFromHead(repoRoot: string): boolean {
  const pending = readCommitEditMsg(repoRoot);
  if (pending === null) return false;
  const headMsg = git(["log", "-1", "--format=%B"], repoRoot, {
    allowFail: true,
  });
  if (!headMsg) return true;
  return normalizeMsg(pending) !== normalizeMsg(headMsg);
}

/**
 * Pre-commit: git itself writes COMMIT_EDITMSG only *after* the pre-commit
 * hook, so `know-code commit` pre-writes the final message before spawning
 * git. Accept requireTrailer when the pending message already carries tipHash
 * (or passHash under drift). Agents cannot forge a bypass without putting a
 * grounded trailer — which is complying with requireTrailer. Gate open still
 * requires human seals.
 */
export function pendingCommitMessageHasGroundedTrailer(
  repoRoot: string,
  state: EffectiveQuizState,
): boolean {
  const msg = readCommitEditMsg(repoRoot);
  if (msg === null) return false;
  const hash = trailerHashFromMessage(msg);
  if (!hash) return false;
  if (hash === state.ctx.diffHash) return true;
  if (state.commitDrift && hash === state.effectiveHash) return true;
  return false;
}

export interface TrailerCheckOptions {
  /**
   * When true (pre-commit), a grounded pending COMMIT_EDITMSG may satisfy
   * requireTrailer. When false (pre-push), only HEAD trailers count — a
   * forged/stale EDITMSG must not authorize push of a trailerless tip.
   */
  allowPending?: boolean;
}

/**
 * requireTrailer policy:
 * - Pre-commit (allowPending): EDITMSG ≠ HEAD → pending must be grounded;
 *   HEAD alone must not authorize a trailerless next commit.
 * - Pre-push (!allowPending): only HEAD trailers count.
 */
export function trailerSatisfiesCheck(
  repoRoot: string,
  state: EffectiveQuizState,
  opts: TrailerCheckOptions = {},
): boolean {
  const allowPending = opts.allowPending !== false;
  if (!allowPending) {
    return headTrailerSatisfiesCheck(repoRoot, state);
  }
  // Index ≠ HEAD: either a pending commit is in flight, or a sliced batch still
  // has remaining gated staged files. Pending EDITMSG must be grounded; otherwise
  // accept tipHash or passHash-under-drift on HEAD (sliced pathspec commits).
  if (!isIndexAlignedWithHead(repoRoot)) {
    if (isPendingCommitDistinctFromHead(repoRoot)) {
      return pendingCommitMessageHasGroundedTrailer(repoRoot, state);
    }
    return headTrailerSatisfiesCheck(repoRoot, state);
  }
  if (isPendingCommitDistinctFromHead(repoRoot)) {
    return pendingCommitMessageHasGroundedTrailer(repoRoot, state);
  }
  return (
    headTrailerSatisfiesCheck(repoRoot, state) ||
    pendingCommitMessageHasGroundedTrailer(repoRoot, state)
  );
}

/**
 * Grounded commit-drift verify candidate: passHash only when local gate is
 * valid, tree stable, and HEAD trailer already carries passHash.
 */
export function commitDriftVerifyHash(
  repoRoot: string,
  config?: Config,
): string | null {
  const cfg = config ?? readConfig(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, cfg);
  if (!state.commitDrift) return null;
  const gate = readGateSafe(repoRoot);
  if (!isGateOpenForShipping(repoRoot, gate, state, cfg.level)) return null;
  if (!isTreeStableSincePass(repoRoot, gate)) return null;
  if (!headHasTrailer(repoRoot, state.ctx.headRef, state.effectiveHash)) {
    return null;
  }
  if (!isSignedGateOpen(repoRoot, gate, state.effectiveHash, cfg.level)) {
    return null;
  }
  return state.effectiveHash;
}
