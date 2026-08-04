import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readConfig } from "./config.js";
import { git } from "./git.js";
import { resolveQuizContext } from "./hash.js";
import { assertSigned } from "./seal.js";
import { headHasTrailer } from "./verify-helpers.js";
import { gatePath, knowCodeDir } from "./paths.js";
import type { Config, GateReceipt, Level, QuizContext } from "./types.js";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function readGate(repoRoot: string): GateReceipt | null {
  const path = gatePath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as GateReceipt;
    if (data.version !== 1 || !data.diffHash || !data.level) return null;
    return data;
  } catch {
    throw new Error(
      "know-code: corrupt .know-code/gate.json — delete and re-run know-code pass.",
    );
  }
}

export function writeGate(repoRoot: string, receipt: GateReceipt): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(gatePath(repoRoot), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function isGateValid(
  receipt: GateReceipt | null,
  diffHash: string,
  requiredLevel: Level,
): boolean {
  if (!receipt) return false;
  if (receipt.diffHash !== diffHash) return false;
  const order: Record<Level, number> = { lite: 1, standard: 2, deep: 3 };
  return order[receipt.level] >= order[requiredLevel];
}

/** Hash/level match plus valid human Ed25519 seal. */
export function isSignedGateOpen(
  repoRoot: string,
  receipt: GateReceipt | null,
  diffHash: string,
  requiredLevel: Level,
): boolean {
  if (!isGateValid(receipt, diffHash, requiredLevel) || !receipt) return false;
  const config = readConfig(repoRoot);
  if (!config.requireAttest) return true;
  try {
    assertSigned(
      repoRoot,
      "gate.json",
      receipt as unknown as Record<string, unknown> & {
        sig?: string;
        keyId?: string;
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** Index tree (HEAD + staged) at pass or check time. */
export function materializedTreeOid(repoRoot: string): string {
  return git(["write-tree"], repoRoot, { allowFail: true }) || EMPTY_TREE;
}

/** True when materialized tree still matches the tree sealed at pass. */
export function isGatedTreeCurrent(
  repoRoot: string,
  gatedTreeOid: string,
): boolean {
  return materializedTreeOid(repoRoot) === gatedTreeOid;
}

export interface EffectiveQuizState {
  ctx: QuizContext;
  effectiveHash: string;
  /** Hash changed (e.g. post-commit range) but tree content unchanged. */
  commitDrift: boolean;
}

/** True when index matches HEAD (no staged changes beyond tip). */
export function isIndexAlignedWithHead(repoRoot: string): boolean {
  const headTree = git(["rev-parse", "HEAD^{tree}"], repoRoot, {
    allowFail: true,
  });
  return Boolean(headTree) && materializedTreeOid(repoRoot) === headTree;
}

/**
 * Pre-0.2.0 gates lack gatedTreeOid. Allow commit drift when HEAD trailer matches,
 * seal is valid, and nothing new is staged (index tree == HEAD tree).
 */
function isLegacyCommitDrift(
  repoRoot: string,
  gate: GateReceipt,
  ctx: QuizContext,
  config: Config,
): boolean {
  if (gate.gatedTreeOid || gate.diffHash === ctx.diffHash) return false;
  if (!isSignedGateOpen(repoRoot, gate, gate.diffHash, config.level)) {
    return false;
  }
  if (!headHasTrailer(repoRoot, ctx.headRef, gate.diffHash)) return false;
  return isIndexAlignedWithHead(repoRoot);
}

/**
 * Quiz hash for pipeline/gate checks. After pass+commit with unchanged tree,
 * artifacts bound to gate.diffHash stay valid even when ctx.diffHash moved.
 */
export function resolveEffectiveQuizState(
  repoRoot: string,
  config?: Config,
): EffectiveQuizState {
  const cfg = config ?? readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, cfg);
  const gate = readGate(repoRoot);

  if (
    gate &&
    gate.diffHash !== ctx.diffHash &&
    isSignedGateOpen(repoRoot, gate, gate.diffHash, cfg.level)
  ) {
    if (
      gate.gatedTreeOid &&
      isGatedTreeCurrent(repoRoot, gate.gatedTreeOid)
    ) {
      return { ctx, effectiveHash: gate.diffHash, commitDrift: true };
    }
    if (isLegacyCommitDrift(repoRoot, gate, ctx, cfg)) {
      return { ctx, effectiveHash: gate.diffHash, commitDrift: true };
    }
  }

  return { ctx, effectiveHash: ctx.diffHash, commitDrift: false };
}

/** Gate open for current or commit-drifted (tree-stable) hash. */
export function isSignedGateEffective(
  repoRoot: string,
  receipt: GateReceipt | null,
  state: EffectiveQuizState,
  requiredLevel: Level,
): boolean {
  return isSignedGateOpen(
    repoRoot,
    receipt,
    state.effectiveHash,
    requiredLevel,
  );
}
