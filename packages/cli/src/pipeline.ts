import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  readAnswers,
  readGrade,
  readTaught,
  PASS_SCORE,
} from "./attest.js";
import { readConfig } from "./config.js";
import { isSignedGateOpen, readGate } from "./gate.js";
import { resolveQuizContext } from "./hash.js";
import { readGradeProposal } from "./grading.js";
import { knowCodeDir } from "./paths.js";
import { readAttestMeta } from "./seal.js";
import { readRangeSession } from "./range.js";
import type { Config } from "./types.js";

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

export function evaluatePipeline(repoRoot: string): PipelineStatus {
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const hash = ctx.diffHash;
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

  const taught = readTaught(repoRoot);
  if (!taught || taught.diffHash !== hash) {
    blockers.push({
      step: "taught",
      message: taught
        ? `taught.json stale (hash ${taught.diffHash.slice(0, 12)}…)`
        : "Teaching not sealed for current hash",
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

  const answers = readAnswers(repoRoot);
  if (!answers || answers.diffHash !== hash) {
    blockers.push({
      step: "answers",
      message: answers
        ? "answers.json stale for current hash"
        : "Browser quiz not completed",
      command: "know-code ask",
    });
  }

  if (config.requireGradeProposal !== false) {
    const proposal = readGradeProposal(repoRoot);
    const digest = answers?.answersDigest;
    if (
      !proposal ||
      proposal.diffHash !== hash ||
      (digest && proposal.answersDigest !== digest)
    ) {
      blockers.push({
        step: "grade-proposal",
        message: proposal
          ? "grade-proposal.json stale or mismatched"
          : "Agent grading proposal missing",
        command: "Agent: write .know-code/grade-proposal.json after ask",
      });
    }
  }

  const grade = readGrade(repoRoot);
  if (!grade || grade.diffHash !== hash) {
    blockers.push({
      step: "grade",
      message: grade
        ? "grade.json stale for current hash"
        : "Grade not sealed",
      command: "know-code grade --review",
    });
  } else if (!grade.passed || grade.score < PASS_SCORE) {
    blockers.push({
      step: "grade",
      message: `Grade below pass bar (${PASS_SCORE})`,
      command: "know-code grade --review",
    });
  }

  const gate = readGate(repoRoot);
  const allowed = isSignedGateOpen(repoRoot, gate, hash, config.level);

  if (!allowed) {
    if (!gate || gate.diffHash !== hash) {
      blockers.push({
        step: "pass",
        message: gate
          ? "Gate stale — diff may have changed (staged new work?)"
          : "Gate not open",
        command: "know-code pass",
      });
    } else {
      blockers.push({
        step: "pass",
        message: "Gate seal invalid or level too low",
        command: "know-code pass",
      });
    }
  }

  const nextStep = blockers[0]?.command ?? null;

  return { allowed, nextStep, blockers };
}

export function formatCheckDeny(
  repoRoot: string,
  config: Config,
  ctx: ReturnType<typeof resolveQuizContext>,
  receipt: ReturnType<typeof readGate>,
): { reason: string; next: string } {
  const pipeline = evaluatePipeline(repoRoot);

  if (pipeline.blockers.length) {
    const b = pipeline.blockers[0];
    let reason = b.message;
    if (b.step === "pass" && receipt && receipt.diffHash !== ctx.diffHash) {
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
  if (receipt.diffHash !== ctx.diffHash) {
    return {
      reason:
        "diff changed since last quiz — staged new work or amended commits?",
      next: "know-code status",
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
