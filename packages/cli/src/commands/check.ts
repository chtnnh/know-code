import { readConfig } from "../config.js";
import {
  headTreeMatchesGate,
  isGateOpenForShipping,
  resolveEffectiveQuizState,
  trailerSatisfiesCheck,
} from "../enforcement.js";
import { readGateSafe } from "../gate.js";
import { CANONICAL_FLOW } from "../grading.js";
import { formatCheckDeny } from "../pipeline.js";
import { tryOverrideBypass } from "../override.js";
import { findGitRoot } from "../paths.js";
import { workingTreeClean } from "../git.js";
import { isSealedRewriteRangeOpen, readRangeSeal } from "../range.js";
import { headHasTrailer } from "../trailers.js";

export interface CheckResult {
  allowed: boolean;
  reason?: string;
  next?: string;
  viaOverride?: boolean;
}

export interface RunCheckOptions {
  /** Pre-push: ignore COMMIT_EDITMSG; only HEAD trailers satisfy requireTrailer. */
  push?: boolean;
}

/** Index/HEAD clean enough that rewrite-open only ships the sealed tip. */
function indexAlignedWithHead(repoRoot: string): boolean {
  return workingTreeClean(repoRoot);
}

/**
 * After range seal --rewrite, HEAD trailers carry the seal hash — not the tip
 * hash or drift passHash that headTrailerSatisfiesCheck knows. Accept it only
 * at the exact sealed tip with a grounded seal (isSealedRewriteRangeOpen
 * verifies signed gate, stable tree, and HEAD === sealedHeadOid), and only in
 * push mode: the seal authorizes shipping the sealed tip, never a new pending
 * commit riding HEAD's seal trailer through pre-commit.
 */
function sealedTipTrailerSatisfies(repoRoot: string): boolean {
  if (!isSealedRewriteRangeOpen(repoRoot)) return false;
  const seal = readRangeSeal(repoRoot);
  if (!seal?.diffHash) return false;
  if (headHasTrailer(repoRoot, "HEAD", seal.diffHash)) return true;
  return Boolean(
    seal.gatePassHash && headHasTrailer(repoRoot, "HEAD", seal.gatePassHash),
  );
}

export function runCheck(
  repoRoot: string,
  opts: RunCheckOptions = {},
): CheckResult {
  if (process.env.KNOW_CODE_OVERRIDE === "1") {
    const bypass = tryOverrideBypass(repoRoot, { consume: true });
    if (bypass.allowed) {
      return { allowed: true, viaOverride: true };
    }
    return {
      allowed: false,
      reason: bypass.reason || "OVERRIDE denied",
      next: "know-code override",
    };
  }

  const config = readConfig(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, config);
  const { ctx } = state;
  const receipt = readGateSafe(repoRoot);
  const allowPending = !opts.push;

  if (opts.push && receipt && !headTreeMatchesGate(repoRoot, receipt)) {
    return {
      allowed: false,
      reason:
        "HEAD tree changed since pass — amended commits or extra work on tip?",
      next: "know-code status",
    };
  }

  if (isGateOpenForShipping(repoRoot, receipt, state, config.level)) {
    if (
      config.requireTrailer &&
      !trailerSatisfiesCheck(repoRoot, state, { allowPending }) &&
      !(opts.push && sealedTipTrailerSatisfies(repoRoot))
    ) {
      return {
        allowed: false,
        reason: "requireTrailer: HEAD missing Know-Code-Verified trailer",
        next: "know-code commit -m \"…\"",
      };
    }
    return { allowed: true };
  }

  // Sealed rewrite may open push of the sealed tip only — not new staged work.
  if (isSealedRewriteRangeOpen(repoRoot) && indexAlignedWithHead(repoRoot)) {
    if (
      config.requireTrailer &&
      !trailerSatisfiesCheck(repoRoot, state, { allowPending }) &&
      !(opts.push && sealedTipTrailerSatisfies(repoRoot))
    ) {
      return {
        allowed: false,
        reason: "requireTrailer: sealed tip missing Know-Code-Verified trailer",
        next: "know-code range seal --rewrite",
      };
    }
    return { allowed: true };
  }

  const { reason, next } = formatCheckDeny(repoRoot, config, ctx, receipt);
  return { allowed: false, reason, next };
}

export function cmdCheck(opts: RunCheckOptions = {}): never {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, config);
  const { ctx, effectiveHash, commitDrift } = state;
  const result = runCheck(repoRoot, opts);

  if (result.allowed) {
    if (result.viaOverride) {
      console.error(
        "know-code: KNOW_CODE_OVERRIDE=1 — check passed via human override (logged).",
      );
    } else if (isSealedRewriteRangeOpen(repoRoot)) {
      const seal = readRangeSeal(repoRoot)!;
      console.error(
        `know-code: gate open (sealed rewrite range) for ${seal.diffHash.slice(0, 12)}…`,
      );
    } else {
      const receipt = readGateSafe(repoRoot);
      if (commitDrift) {
        console.error(
          `know-code: gate open (${receipt!.level}, ${ctx.scope}) — tree unchanged since pass (${effectiveHash.slice(0, 12)}…)`,
        );
      } else {
        console.error(
          `know-code: gate open (${receipt!.level}, ${ctx.scope}) for ${ctx.diffHash.slice(0, 12)}…`,
        );
      }
    }
    process.exit(0);
  }

  console.error(`know-code: commit/push blocked — ${result.reason}.`);
  console.error(
    `know-code: current hash ${ctx.diffHash} (scope: ${ctx.scope}, level: ${config.level}).`,
  );
  if (result.next) {
    console.error(`know-code: next: ${result.next}`);
  }
  console.error(`know-code: flow: ${CANONICAL_FLOW}`);
  console.error(
    "know-code: emergency (human TTY): know-code override && KNOW_CODE_OVERRIDE=1 …",
  );
  process.exit(2);
}
