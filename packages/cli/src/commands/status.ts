import { readConfig } from "../config.js";
import { isGateValid, readGate } from "../gate.js";
import { computeDiffContext } from "../hash.js";
import { diffStat, logOneline, mergeBase } from "../git.js";
import { findGitRoot } from "../paths.js";

export function cmdStatus(json = false): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = computeDiffContext(repoRoot, config);
  const receipt = readGate(repoRoot);
  const allowed = isGateValid(receipt, ctx.diffHash, config.level);
  const from = mergeBase(repoRoot, ctx.baseRef, ctx.headRef);
  const stat = diffStat(repoRoot, from, ctx.headRef);
  const log = logOneline(repoRoot, from, ctx.headRef);

  const payload = {
    allowed,
    level: config.level,
    baseBranch: config.baseBranch,
    diffHash: ctx.diffHash,
    baseRef: ctx.baseRef,
    headRef: ctx.headRef,
    commitRange: ctx.commitRange,
    receipt,
    override: process.env.KNOW_CODE_OVERRIDE === "1",
    diffStat: stat,
    commits: log.split("\n").filter(Boolean),
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`know-code status`);
  console.log(`  commit/push allowed: ${allowed ? "yes" : "no"}`);
  console.log(`  level:        ${config.level}`);
  console.log(`  hash:         ${ctx.diffHash}`);
  console.log(`  range:        ${ctx.commitRange}`);
  console.log(`  base:         ${ctx.baseRef}`);
  if (receipt) {
    console.log(
      `  receipt:      ${receipt.level} @ ${receipt.passedAt} (${receipt.diffHash.slice(0, 12)}…)`,
    );
  } else {
    console.log(`  receipt:      (none)`);
  }
  if (stat) {
    console.log(`  diff:`);
    for (const line of stat.split("\n")) {
      console.log(`    ${line}`);
    }
  }
}
