import { readAnswers, readGrade, readTaught } from "../attest.js";
import { readConfig } from "../config.js";
import { runCheck } from "./check.js";
import { resolveEffectiveQuizState } from "../enforcement.js";
import { readGateSafe } from "../gate.js";
import { readGradeProposal } from "../grading.js";
import { evaluatePipeline } from "../pipeline.js";
import { readRangeSession } from "../range.js";
import {
  diffStat,
  hasUnstagedTrackedChanges,
  logOneline,
  mergeBase,
} from "../git.js";
import { hasValidOverrideAllow } from "../override.js";
import { findGitRoot } from "../paths.js";
import { readAttestMeta, verifyPayload } from "../seal.js";

function shortHash(h: string | undefined | null): string {
  return h && h.length >= 12 ? `${h.slice(0, 12)}…` : h || "(none)";
}

function staleCause(
  artifactHash: string | undefined,
  currentHash: string,
  unstaged: boolean,
): string {
  if (!artifactHash) return "missing";
  if (artifactHash === currentHash) return "ok";
  if (unstaged) {
    return `stale ${shortHash(artifactHash)} vs ${shortHash(currentHash)} (unstaged edits present — git add or stash)`;
  }
  return `stale ${shortHash(artifactHash)} vs ${shortHash(currentHash)} (staging/range changed since artifact)`;
}

function safeRead<T>(fn: () => T | null): {
  value: T | null;
  corrupt: boolean;
} {
  try {
    return { value: fn(), corrupt: false };
  } catch {
    return { value: null, corrupt: true };
  }
}

export function cmdStatus(opts: { json?: boolean; next?: boolean } = {}): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const { ctx, effectiveHash, commitDrift } = resolveEffectiveQuizState(
    repoRoot,
    config,
  );
  const session = readRangeSession(repoRoot);
  const receipt = readGateSafe(repoRoot);
  const allowed = runCheck(repoRoot).allowed;
  const from = mergeBase(repoRoot, ctx.baseRef, ctx.headRef);
  const stat = diffStat(repoRoot, from, ctx.headRef);
  const log = logOneline(repoRoot, from, ctx.headRef);
  const taughtR = safeRead(() => readTaught(repoRoot));
  const answersR = safeRead(() => readAnswers(repoRoot));
  const gradeR = safeRead(() => readGrade(repoRoot));
  const proposalR = safeRead(() => readGradeProposal(repoRoot));
  const taught = taughtR.value;
  const answers = answersR.value;
  const grade = gradeR.value;
  const proposal = proposalR.value;
  const meta = readAttestMeta(repoRoot);
  const pub = meta?.pubKey;
  const taughtOk =
    !!taught &&
    taught.diffHash === effectiveHash &&
    !!pub &&
    verifyPayload(pub, taught as unknown as Record<string, unknown> & { sig?: string; keyId?: string });
  const gradeOk =
    !!grade &&
    grade.diffHash === effectiveHash &&
    !!pub &&
    verifyPayload(pub, grade as unknown as Record<string, unknown> & { sig?: string; keyId?: string });

  const pipeline = evaluatePipeline(repoRoot);
  const unstaged = hasUnstagedTrackedChanges(repoRoot);
  const taughtStaleDetail = taughtR.corrupt
    ? "corrupt"
    : staleCause(taught?.diffHash, effectiveHash, unstaged);
  const answersStaleDetail = answersR.corrupt
    ? "corrupt"
    : staleCause(answers?.diffHash, effectiveHash, unstaged);
  const gradeStaleDetail = gradeR.corrupt
    ? "corrupt"
    : staleCause(grade?.diffHash, effectiveHash, unstaged);
  const proposalStaleDetail = proposalR.corrupt
    ? "corrupt"
    : staleCause(proposal?.diffHash, effectiveHash, unstaged);

  const payload = {
    allowed,
    nextStep: pipeline.nextStep,
    blockers: pipeline.blockers,
    level: config.level,
    baseBranch: config.baseBranch,
    attestKeyId: meta?.keyId || null,
    attestReady: !!meta,
    diffHash: ctx.diffHash,
    effectiveHash: commitDrift ? effectiveHash : undefined,
    commitDrift,
    unstagedTrackedEdits: unstaged,
    scope: ctx.scope,
    commitCount: ctx.commitCount,
    rangeActive: !!session,
    baseRef: ctx.baseRef,
    headRef: ctx.headRef,
    commitRange: ctx.commitRange,
    receipt,
    taught: taughtR.corrupt
      ? "corrupt"
      : taught?.diffHash === effectiveHash
        ? taught
        : null,
    taughtSealed: taughtOk,
    taughtDetail: taughtStaleDetail,
    answers: answersR.corrupt
      ? "corrupt"
      : answers?.diffHash === effectiveHash,
    answersDetail: answersStaleDetail,
    grade: gradeR.corrupt
      ? "corrupt"
      : grade?.diffHash === effectiveHash
        ? grade
        : null,
    gradeSealed: gradeOk,
    gradeDetail: gradeStaleDetail,
    gradeProposal: proposalR.corrupt
      ? "corrupt"
      : proposal?.diffHash === effectiveHash
        ? true
        : false,
    gradeProposalDetail: proposalStaleDetail,
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
  if (commitDrift) {
    console.log(
      `  gate hash:    ${effectiveHash} (tree unchanged since pass)`,
    );
  }
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
      taughtR.corrupt
        ? "corrupt"
        : taught?.diffHash === effectiveHash
          ? `${taught.skipped ? "skipped" : "yes"} sealed=${taughtOk ? "yes" : "no"}`
          : taughtStaleDetail
    }`,
  );
  console.log(
    `  answers:      ${
      answersR.corrupt
        ? "corrupt"
        : answers?.diffHash === effectiveHash
          ? "yes"
          : answersStaleDetail
    }`,
  );
  console.log(
    `  grade:        ${
      gradeR.corrupt
        ? "corrupt"
        : grade?.diffHash === effectiveHash
          ? `${grade.score} (${grade.passed ? "pass" : "fail"}) sealed=${gradeOk ? "yes" : "no"}`
          : gradeStaleDetail
    }`,
  );
  console.log(
    `  grade-proposal: ${
      proposalR.corrupt
        ? "corrupt"
        : proposal?.diffHash === effectiveHash
          ? "yes"
          : proposalStaleDetail
    }`,
  );
  if (unstaged) {
    console.log(
      `  unstaged:     yes — close the gate; git add or stash (know-code hash --explain)`,
    );
  }
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
