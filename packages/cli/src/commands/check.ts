import { readConfig } from "../config.js";
import { isGateValid, readGate } from "../gate.js";
import { computeDiffContext } from "../hash.js";
import { findGitRoot } from "../paths.js";

export function cmdCheck(): never {
  if (process.env.KNOW_CODE_OVERRIDE === "1") {
    console.error(
      "know-code: KNOW_CODE_OVERRIDE=1 — check passed via override.",
    );
    process.exit(0);
  }

  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = computeDiffContext(repoRoot, config);
  const receipt = readGate(repoRoot);

  if (isGateValid(receipt, ctx.diffHash, config.level)) {
    console.error(
      `know-code: gate open (${receipt!.level}) for ${ctx.diffHash.slice(0, 12)}…`,
    );
    process.exit(0);
  }

  const reason = !receipt
    ? "no quiz receipt"
    : receipt.diffHash !== ctx.diffHash
      ? "diff changed since last quiz"
      : `receipt level "${receipt.level}" is below required "${config.level}"`;

  console.error(`know-code: push blocked — ${reason}.`);
  console.error(
    `know-code: current hash ${ctx.diffHash} (level: ${config.level}).`,
  );
  console.error(
    "know-code: run the know-code skill (or `/know-code`) and pass the quiz, then retry.",
  );
  console.error(
    "know-code: emergency bypass: KNOW_CODE_OVERRIDE=1 git push",
  );
  process.exit(2);
}
