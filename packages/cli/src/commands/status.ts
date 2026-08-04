import { readAnswers, readGrade, readTaught } from "../attest.js";
import { readConfig } from "../config.js";
import { isSignedGateOpen, readGate } from "../gate.js";
import { readGradeProposal } from "../grading.js";
import { resolveQuizContext } from "../hash.js";
import { evaluatePipeline } from "../pipeline.js";
import { readRangeSession } from "../range.js";
import { diffStat, logOneline, mergeBase } from "../git.js";
import { hasValidOverrideAllow } from "../override.js";
import { findGitRoot } from "../paths.js";
import { readAttestMeta, verifyPayload } from "../seal.js";

export function cmdStatus(opts: { json?: boolean; next?: boolean } = {}): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const session = readRangeSession(repoRoot);
  const receipt = readGate(repoRoot);
  const allowed = isSignedGateOpen(
    repoRoot,
    receipt,
    ctx.diffHash,
    config.level,
  );
  const from = mergeBase(repoRoot, ctx.baseRef, ctx.headRef);
  const stat = diffStat(repoRoot, from, ctx.headRef);
  const log = logOneline(repoRoot, from, ctx.headRef);
  const taught = readTaught(repoRoot);
  const answers = readAnswers(repoRoot);
  const grade = readGrade(repoRoot);
  const meta = readAttestMeta(repoRoot);
  const pub = meta?.pubKey;
  const taughtOk =
    !!taught &&
    taught.diffHash === ctx.diffHash &&
    !!pub &&
    verifyPayload(pub, taught as unknown as Record<string, unknown> & { sig?: string; keyId?: string });
  const gradeOk =
    !!grade &&
    grade.diffHash === ctx.diffHash &&
    !!pub &&
    verifyPayload(pub, grade as unknown as Record<string, unknown> & { sig?: string; keyId?: string });

  const proposal = readGradeProposal(repoRoot);
  const pipeline = evaluatePipeline(repoRoot);

  const payload = {
    allowed,
    nextStep: pipeline.nextStep,
    blockers: pipeline.blockers,
    level: config.level,
    baseBranch: config.baseBranch,
    attestKeyId: meta?.keyId || null,
    attestReady: !!meta,
    diffHash: ctx.diffHash,
    scope: ctx.scope,
    commitCount: ctx.commitCount,
    rangeActive: !!session,
    baseRef: ctx.baseRef,
    headRef: ctx.headRef,
    commitRange: ctx.commitRange,
    receipt,
    taught: taught?.diffHash === ctx.diffHash ? taught : null,
    taughtSealed: taughtOk,
    answers: answers?.diffHash === ctx.diffHash,
    grade: grade?.diffHash === ctx.diffHash ? grade : null,
    gradeSealed: gradeOk,
    gradeProposal: proposal?.diffHash === ctx.diffHash ? true : false,
    overrideEnv: process.env.KNOW_CODE_OVERRIDE === "1",
    overrideAllow: hasValidOverrideAllow(repoRoot),
    diffStat: stat,
    commits: log.split("\n").filter(Boolean),
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`know-code status`);
  console.log(`  commit/push allowed: ${allowed ? "yes" : "no"}`);
  if (pipeline.nextStep) {
    console.log(`  next:         ${pipeline.nextStep}`);
  }
  if (opts.next !== false && pipeline.blockers.length) {
    console.log(`  blockers:`);
    for (const b of pipeline.blockers) {
      console.log(`    - ${b.step}: ${b.message}`);
    }
  }
  console.log(`  level:        ${config.level}`);
  console.log(
    `  attest:       ${meta?.keyId ? `keyId=${meta.keyId}` : "not initialized (attest-init)"}`,
  );
  console.log(`  hash:         ${ctx.diffHash}`);
  console.log(`  scope:        ${ctx.scope}`);
  console.log(`  range:        ${ctx.commitRange}`);
  console.log(`  base:         ${ctx.baseRef}`);
  if (receipt) {
    console.log(
      `  receipt:      ${receipt.level} @ ${receipt.passedAt} (${receipt.diffHash.slice(0, 12)}…) sealed=${allowed ? "yes" : "no"}`,
    );
  } else {
    console.log(`  receipt:      (none)`);
  }
  console.log(
    `  taught:       ${
      taught?.diffHash === ctx.diffHash
        ? `${taught.skipped ? "skipped" : "yes"} sealed=${taughtOk ? "yes" : "no"}`
        : "no"
    }`,
  );
  console.log(
    `  answers:      ${answers?.diffHash === ctx.diffHash ? "yes" : "no"}`,
  );
  console.log(
    `  grade:        ${
      grade?.diffHash === ctx.diffHash
        ? `${grade.score} (${grade.passed ? "pass" : "fail"}) sealed=${gradeOk ? "yes" : "no"}`
        : "no"
    }`,
  );
  console.log(
    `  grade-proposal: ${proposal?.diffHash === ctx.diffHash ? "yes" : "no"}`,
  );
  if (process.env.KNOW_CODE_OVERRIDE === "1" || hasValidOverrideAllow(repoRoot)) {
    console.log(
      `  override:     env=${process.env.KNOW_CODE_OVERRIDE === "1"} allow=${hasValidOverrideAllow(repoRoot)}`,
    );
  }
  if (stat) {
    console.log(`  diff:`);
    for (const line of stat.split("\n")) {
      console.log(`    ${line}`);
    }
  }
}
