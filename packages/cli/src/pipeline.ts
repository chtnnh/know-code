import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  readAnswers,
  readGrade,
  readTaught,
  PASS_SCORE,
} from "./attest.js";
import { readConfig } from "./config.js";
import {
  hasUnstagedTrackedChanges,
  isGateOpenForShipping,
  resolveEffectiveQuizState,
} from "./enforcement.js";
import {
  isGatedTreeCurrent,
  isSignedGateEffective,
  readGateSafe,
} from "./gate.js";
import { readGradeProposal } from "./grading.js";
import { headMatchesRangeSeal } from "./range-seal-bind.js";
import { knowCodeDir } from "./paths.js";
import { readAttestMeta } from "./seal.js";
import { readRangeSession } from "./range.js";
import type { Config, QuizContext } from "./types.js";

export interface PipelineBlocker {
  step: string;
  message: string;
  command?: string;
}

export interface PipelineStatus {
  allowed: boolean;
  nextStep: string | null;
  blockers: PipelineBlocker[];
}

function quizExists(repoRoot: string): boolean {
  return existsSync(join(knowCodeDir(repoRoot), "quiz.json"));
}

function pushCorrupt(
  blockers: PipelineBlocker[],
  err: unknown,
  fallback: string,
): void {
  blockers.push({
    step: "corrupt",
    message: err instanceof Error ? err.message : fallback,
    command: "know-code reset",
  });
}

export function evaluatePipeline(repoRoot: string): PipelineStatus {
  const config = readConfig(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, config);
  const { ctx, effectiveHash: hash, commitDrift } = state;
  const blockers: PipelineBlocker[] = [];

  const meta = readAttestMeta(repoRoot);
  if (config.requireAttest && !meta) {
    blockers.push({
      step: "attest",
      message: "Attest key not initialized",
      command: "know-code attest-init",
    });
  }

  const session = readRangeSession(repoRoot);
  if (
    config.rangeMode === "range" &&
    !session &&
    ctx.scope !== "range"
  ) {
    blockers.push({
      step: "range",
      message: "Range mode requires active range session",
      command: "know-code range begin",
    });
  }

  let taught = null;
  try {
    taught = readTaught(repoRoot);
  } catch (err) {
    pushCorrupt(blockers, err, "corrupt taught.json");
  }
  if (taught === null && !blockers.some((b) => b.step === "corrupt")) {
    blockers.push({
      step: "taught",
      message: "Teaching not sealed for current hash",
      command: "know-code taught",
    });
  } else if (taught && taught.diffHash !== hash) {
    blockers.push({
      step: "taught",
      message: `taught.json stale (hash ${taught.diffHash.slice(0, 12)}…)`,
      command: "know-code taught",
    });
  }

  if (!quizExists(repoRoot)) {
    blockers.push({
      step: "quiz",
      message: "quiz.json missing",
      command: "know-code questions && write .know-code/quiz.json",
    });
  }

  let answers = null;
  try {
    answers = readAnswers(repoRoot);
  } catch (err) {
    pushCorrupt(blockers, err, "corrupt answers.json");
  }
  if (answers === null && !blockers.some((b) => b.message.includes("answers"))) {
    if (!blockers.some((b) => b.step === "corrupt")) {
      blockers.push({
        step: "answers",
        message: "Browser quiz not completed",
        command: "know-code ask",
      });
    }
  } else if (answers && answers.diffHash !== hash) {
    blockers.push({
      step: "answers",
      message: "answers.json stale for current hash",
      command: "know-code ask",
    });
  }

  if (config.requireGradeProposal !== false) {
    let proposal = null;
    try {
      proposal = readGradeProposal(repoRoot);
    } catch (err) {
      pushCorrupt(blockers, err, "corrupt grade-proposal.json");
    }
    const digest = answers?.answersDigest;
    if (
      proposal === null ||
      proposal.diffHash !== hash ||
      (digest && proposal.answersDigest !== digest)
    ) {
      if (!blockers.some((b) => b.message.includes("grade-proposal"))) {
        blockers.push({
          step: "grade-proposal",
          message: proposal
            ? "grade-proposal.json stale or mismatched"
            : "Agent grading proposal missing",
          command: "Agent: write .know-code/grade-proposal.json after ask",
        });
      }
    }
  }

  let grade = null;
  try {
    grade = readGrade(repoRoot);
  } catch (err) {
    pushCorrupt(blockers, err, "corrupt grade.json");
  }
  if (grade === null) {
    if (!blockers.some((b) => b.message.includes("grade.json"))) {
      blockers.push({
        step: "grade",
        message: "Grade not sealed",
        command: "know-code grade --review",
      });
    }
  } else if (grade.diffHash !== hash) {
    blockers.push({
      step: "grade",
      message: "grade.json stale for current hash",
      command: "know-code grade --review",
    });
  } else if (!grade.passed || grade.score < PASS_SCORE) {
    blockers.push({
      step: "grade",
      message: `Grade below pass bar (${PASS_SCORE})`,
      command: "know-code grade --review",
    });
  }

  const gate = readGateSafe(repoRoot);
  const gatePath = join(knowCodeDir(repoRoot), "gate.json");
  if (existsSync(gatePath) && !gate) {
    pushCorrupt(
      blockers,
      new Error("corrupt .know-code/gate.json"),
      "corrupt gate.json",
    );
  }

  const hasCorrupt = blockers.some((b) => b.step === "corrupt");
  const allowed =
    !hasCorrupt && isGateOpenForShipping(repoRoot, gate, state, config.level);

  if (!allowed && !hasCorrupt) {
    if (!gate || (gate.diffHash !== hash && !commitDrift)) {
      blockers.push({
        step: "pass",
        message: gate
          ? "Gate stale — diff may have changed (staged new work?)"
          : "Gate not open",
        command: "know-code pass",
      });
    } else if (hasUnstagedTrackedChanges(repoRoot)) {
      blockers.push({
        step: "pass",
        message:
          "Unstaged tracked edits close the gate (git add or stash)",
        command: "git add -A",
      });
    } else if (
      gate.gatedTreeOid &&
      !isGatedTreeCurrent(repoRoot, gate.gatedTreeOid)
    ) {
      blockers.push({
        step: "pass",
        message:
          "Staged tree differs from gated tree (re-run taught → quiz → pass)",
        command: "know-code taught",
      });
    } else if (!headMatchesRangeSeal(repoRoot)) {
      blockers.push({
        step: "pass",
        message:
          "HEAD moved after range seal — start a new range or re-run pass",
        command: "know-code range begin",
      });
    } else if (!isSignedGateEffective(repoRoot, gate, state, config.level)) {
      blockers.push({
        step: "pass",
        message: "Gate seal invalid or level too low",
        command: "know-code pass",
      });
    } else {
      blockers.push({
        step: "pass",
        message: "Gate closed (see know-code status --json)",
        command: "know-code status",
      });
    }
  }

  const nextStep = blockers[0]?.command ?? null;

  return { allowed, nextStep, blockers };
}

export function formatCheckDeny(
  repoRoot: string,
  config: Config,
  ctx: QuizContext,
  receipt: ReturnType<typeof readGateSafe>,
): { reason: string; next: string } {
  const pipeline = evaluatePipeline(repoRoot);
  const { commitDrift } = resolveEffectiveQuizState(repoRoot, config);

  if (pipeline.blockers.length) {
    const b = pipeline.blockers[0];
    let reason = b.message;
    if (
      b.step === "pass" &&
      receipt &&
      receipt.diffHash !== ctx.diffHash &&
      !commitDrift
    ) {
      reason =
        "Diff hash changed — you may have staged new changes or amended commits. Run `know-code status`.";
    }
    return {
      reason,
      next: b.command || "know-code status",
    };
  }

  if (!receipt) {
    return {
      reason: "no sealed quiz receipt",
      next: "know-code pass",
    };
  }
  if (receipt.diffHash !== ctx.diffHash && !commitDrift) {
    return {
      reason:
        "diff changed since last quiz — staged new work or amended commits?",
      next: "know-code status",
    };
  }
  if (!receipt.gatedTreeOid) {
    return {
      reason:
        "gate.json missing gatedTreeOid (legacy) — re-run know-code pass after upgrading to ≥0.3.0",
      next: "know-code pass",
    };
  }
  if (config.requireAttest && !receipt.sig) {
    return {
      reason: "gate.json missing human seal",
      next: "know-code pass",
    };
  }
  return {
    reason: `receipt level "${receipt.level}" below required "${config.level}" or seal invalid`,
    next: "know-code pass",
  };
}
