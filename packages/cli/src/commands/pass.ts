import { readConfig, resolveLevel } from "../config.js";
import { writeGate } from "../gate.js";
import { computeDiffContext } from "../hash.js";
import { findGitRoot } from "../paths.js";
import { isLevel, type GateReceipt } from "../types.js";

export function cmdPass(opts: {
  level?: string;
  hash?: string;
}): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = computeDiffContext(repoRoot, config);
  const level = resolveLevel(repoRoot, opts.level);

  if (opts.hash && opts.hash !== ctx.diffHash) {
    console.error(
      `know-code: provided hash does not match current diff.\n` +
        `  provided: ${opts.hash}\n` +
        `  current:  ${ctx.diffHash}\n` +
        `Re-run the quiz against the current diff.`,
    );
    process.exit(1);
  }

  if (opts.level && !isLevel(opts.level)) {
    console.error(`know-code: invalid level "${opts.level}"`);
    process.exit(1);
  }

  const receipt: GateReceipt = {
    version: 1,
    diffHash: ctx.diffHash,
    level,
    passedAt: new Date().toISOString(),
    commitRange: ctx.commitRange,
    baseRef: ctx.baseRef,
    headRef: ctx.headRef,
  };

  writeGate(repoRoot, receipt);
  console.log(`know-code: gate passed (${level})`);
  console.log(`know-code: hash ${ctx.diffHash}`);
  console.log(
    "know-code: optional commit trailer: Know-Code-Verified: " + ctx.diffHash,
  );
  console.log("know-code: safe to retry git commit / git push / gh pr create");
}
