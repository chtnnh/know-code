import { readConfig } from "../config.js";
import { isSignedGateOpen, readGate } from "../gate.js";
import { resolveQuizContext } from "../hash.js";
import { tryOverrideBypass } from "../override.js";
import { findGitRoot } from "../paths.js";

export function cmdCheck(): never {
  const repoRoot = findGitRoot();

  if (process.env.KNOW_CODE_OVERRIDE === "1") {
    const bypass = tryOverrideBypass(repoRoot);
    if (bypass.allowed) {
      console.error(
        "know-code: KNOW_CODE_OVERRIDE=1 — check passed via human override (logged).",
      );
      process.exit(0);
    }
    console.error(bypass.reason || "know-code: OVERRIDE denied.");
    process.exit(2);
  }

  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const receipt = readGate(repoRoot);

  if (isSignedGateOpen(repoRoot, receipt, ctx.diffHash, config.level)) {
    console.error(
      `know-code: gate open (${receipt!.level}, ${ctx.scope}) for ${ctx.diffHash.slice(0, 12)}…`,
    );
    process.exit(0);
  }

  const reason = !receipt
    ? "no sealed quiz receipt"
    : receipt.diffHash !== ctx.diffHash
      ? "diff changed since last quiz"
      : config.requireAttest && !receipt.sig
        ? "gate.json missing human seal (forged or pre-attest)"
        : `receipt level "${receipt.level}" is below required "${config.level}" or seal invalid`;

  console.error(`know-code: commit/push blocked — ${reason}.`);
  console.error(
    `know-code: current hash ${ctx.diffHash} (scope: ${ctx.scope}, level: ${config.level}).`,
  );
  console.error(
    "know-code: flow: range begin → taught → questions → ask → grade → pass → range seal",
  );
  console.error(
    "know-code: emergency (human TTY): know-code override && KNOW_CODE_OVERRIDE=1 …",
  );
  process.exit(2);
}
