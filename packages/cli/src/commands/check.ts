import { readConfig } from "../config.js";
import { isSignedGateOpen, readGate } from "../gate.js";
import { resolveQuizContext } from "../hash.js";
import { CANONICAL_FLOW } from "../grading.js";
import { formatCheckDeny } from "../pipeline.js";
import { tryOverrideBypass } from "../override.js";
import { findGitRoot } from "../paths.js";
import { isSealedRewriteRangeOpen, readRangeSeal } from "../range.js";
import { headHasTrailer } from "../verify-helpers.js";

export interface CheckResult {
  allowed: boolean;
  reason?: string;
  next?: string;
  viaOverride?: boolean;
}

export function runCheck(repoRoot: string): CheckResult {
  if (process.env.KNOW_CODE_OVERRIDE === "1") {
    const bypass = tryOverrideBypass(repoRoot);
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
  const ctx = resolveQuizContext(repoRoot, config);
  const receipt = readGate(repoRoot);

  if (isSignedGateOpen(repoRoot, receipt, ctx.diffHash, config.level)) {
    if (config.requireTrailer && !headHasTrailer(repoRoot, ctx.headRef, ctx.diffHash)) {
      return {
        allowed: false,
        reason: "requireTrailer: HEAD missing Know-Code-Verified trailer",
        next: "know-code commit -m \"…\"",
      };
    }
    return { allowed: true };
  }

  if (isSealedRewriteRangeOpen(repoRoot)) {
    return { allowed: true };
  }

  const { reason, next } = formatCheckDeny(repoRoot, config, ctx, receipt);
  return { allowed: false, reason, next };
}

export function cmdCheck(): never {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const result = runCheck(repoRoot);

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
      const receipt = readGate(repoRoot);
      console.error(
        `know-code: gate open (${receipt!.level}, ${ctx.scope}) for ${ctx.diffHash.slice(0, 12)}…`,
      );
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
