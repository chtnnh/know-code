import { readConfig } from "../config.js";
import { evaluatePipeline } from "../pipeline.js";
import { findGitRoot } from "../paths.js";
import { readRangeSession } from "../range.js";
import { runCheck } from "./check.js";
import { runDoctor } from "./doctor.js";
import { cmdVerify } from "./verify.js";

export async function cmdShip(opts: { dryRun?: boolean }): Promise<void> {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);

  console.log("know-code ship checklist");
  console.log("");

  const doctor = await runDoctor(repoRoot, { strict: true });
  const doctorFail = doctor.filter((c) => !c.ok);
  if (doctorFail.length) {
    console.log("0. doctor --strict:");
    for (const c of doctorFail) {
      console.log(`   - ${c.name}: ${c.message}`);
      if (c.fix) console.log(`     → ${c.fix}`);
    }
    process.exit(1);
  }
  console.log("0. doctor --strict: ok");

  const pipeline = evaluatePipeline(repoRoot);

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

  // Push-mode: HEAD trailers only (matches pre-push / agent ship checks).
  const check = runCheck(repoRoot, { push: true });
  if (!check.allowed) {
    console.error(`2. check --push: blocked — ${check.reason}`);
    if (check.next) console.error(`   → ${check.next}`);
    process.exit(2);
  }
  console.log("2. check --push: passed");

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
  if (session) {
    console.log("  know-code range seal   # before push");
  }
  console.log("  git push");
  console.log("  gh pr create   # if using PR workflow");
}
