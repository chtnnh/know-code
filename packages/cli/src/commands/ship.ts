import { readConfig } from "../config.js";
import { evaluatePipeline } from "../pipeline.js";
import { findGitRoot } from "../paths.js";
import { readRangeSession } from "../range.js";
import { runCheck } from "./check.js";
import { cmdVerify } from "./verify.js";

export function cmdShip(opts: { dryRun?: boolean }): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const pipeline = evaluatePipeline(repoRoot);

  console.log("know-code ship checklist");
  console.log("");

  if (pipeline.blockers.length) {
    console.log("1. Pipeline blockers:");
    for (const b of pipeline.blockers) {
      console.log(`   - ${b.step}: ${b.message}`);
      if (b.command) console.log(`     → ${b.command}`);
    }
    if (pipeline.nextStep) {
      console.log("");
      console.log(`Next: ${pipeline.nextStep}`);
    }
    process.exit(1);
  }

  console.log("1. Pipeline: ready");

  const check = runCheck(repoRoot);
  if (!check.allowed) {
    console.error(`2. check: blocked — ${check.reason}`);
    if (check.next) console.error(`   → ${check.next}`);
    process.exit(2);
  }
  console.log("2. check: passed");

  if (config.requireTrailer) {
    if (opts.dryRun) {
      console.log("3. verify: (dry-run) would run know-code verify");
    } else {
      console.log("3. Running know-code verify…");
      try {
        cmdVerify({ requireAll: false, requireRangeTrailers: false });
      } catch {
        process.exit(1);
      }
    }
  } else {
    console.log("3. verify: skipped (requireTrailer: false)");
  }

  const session = readRangeSession(repoRoot);
  console.log("");
  console.log("Ready to ship:");
  console.log("  git push");
  console.log("  gh pr create   # if using PR workflow");
  if (session) {
    console.log("");
    console.log("After push: know-code range seal");
  }
}
