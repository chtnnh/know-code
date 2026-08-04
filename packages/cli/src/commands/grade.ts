import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";
import { readConfig, resolveLevel } from "../config.js";
import {
  PASS_SCORE,
  assertAnswersForHash,
  writeGrade,
  type GradeReceipt,
} from "../attest.js";
import {
  assertGradeProposalForHash,
  proposalDigest,
  type GradeProposal,
} from "../grading.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot, quizPath } from "../paths.js";
import { sealPayload } from "../seal.js";
import { isLevel, type Level } from "../types.js";
import type { QuizSpec } from "./ask.js";

const FLOW_HINT =
  "taught → questions → ask → grade propose → grade --review → pass → commit → range seal";

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function sealGrade(
  repoRoot: string,
  unsigned: Omit<GradeReceipt, "keyId" | "sig">,
  passphrase?: string,
): Promise<GradeReceipt> {
  const sealed = (await sealPayload(
    repoRoot,
    unsigned as unknown as Record<string, unknown>,
    { passphrase },
  )) as unknown as GradeReceipt;
  writeGrade(repoRoot, sealed);
  return sealed;
}

function buildGradeReceipt(
  ctx: ReturnType<typeof resolveQuizContext>,
  answersDigest: string,
  score: number,
  level: Level,
  proposal?: GradeProposal,
  humanAdjusted?: boolean,
): Omit<GradeReceipt, "keyId" | "sig"> {
  const passed = score >= PASS_SCORE;
  const receipt: Omit<GradeReceipt, "keyId" | "sig"> = {
    version: 1,
    diffHash: ctx.diffHash,
    score,
    passed,
    gradedAt: new Date().toISOString(),
    level,
    answersDigest,
    finalScore: score,
  };
  if (proposal) {
    receipt.proposalDigest = proposalDigest(proposal);
    receipt.humanAdjusted = humanAdjusted ?? false;
  }
  return receipt;
}

export function cmdGradePropose(opts: { json?: boolean }): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);

  let answers;
  try {
    answers = assertAnswersForHash(repoRoot, ctx.diffHash);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  let quiz: QuizSpec | null = null;
  const qPath = quizPath(repoRoot);
  if (existsSync(qPath)) {
    quiz = JSON.parse(readFileSync(qPath, "utf8")) as QuizSpec;
  }

  const context = {
    diffHash: ctx.diffHash,
    answersDigest: answers.answersDigest,
    level: resolveLevel(repoRoot, answers.level),
    scope: ctx.scope,
    passScore: PASS_SCORE,
    answers: answers.answers,
    questions: quiz?.questions ?? [],
    rubric:
      "Score each answer 0–1 against quiz intent and diff. Overall = average unless weighted.",
    proposalSchema: {
      version: 1,
      diffHash: ctx.diffHash,
      answersDigest: answers.answersDigest,
      proposedScore: 0.85,
      passed: true,
      perQuestion: (quiz?.questions ?? []).map((q) => ({
        id: q.id,
        score: 0.85,
        feedback: "…",
      })),
      rubricVersion: "1",
      gradedBy: "agent",
      gradedAt: new Date().toISOString(),
    },
  };

  if (opts.json) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  console.log("know-code grade propose");
  console.log(`  diffHash:       ${ctx.diffHash}`);
  console.log(`  answersDigest:  ${answers.answersDigest}`);
  console.log(`  pass bar:       ${PASS_SCORE}`);
  console.log("");
  console.log("Agent: write .know-code/grade-proposal.json using this context.");
  console.log("Run with --json for machine-readable rubric context.");
}

async function cmdGradeReview(opts: {
  accept?: boolean;
  hash?: string;
  level?: string;
  passphrase?: string;
}): Promise<void> {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const hash = opts.hash || ctx.diffHash;

  if (hash !== ctx.diffHash) {
    console.error(
      `know-code: grade hash does not match current diff.\n` +
        `  provided: ${hash}\n` +
        `  current:  ${ctx.diffHash}`,
    );
    process.exit(1);
  }

  let answers;
  try {
    answers = assertAnswersForHash(repoRoot, ctx.diffHash);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  let proposal: GradeProposal;
  try {
    proposal = assertGradeProposalForHash(
      repoRoot,
      ctx.diffHash,
      answers.answersDigest!,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  let quiz: QuizSpec | null = null;
  const qPath = quizPath(repoRoot);
  if (existsSync(qPath)) {
    quiz = JSON.parse(readFileSync(qPath, "utf8")) as QuizSpec;
  }

  let level: Level;
  if (opts.level) {
    if (!isLevel(opts.level)) {
      console.error(`know-code: invalid level "${opts.level}"`);
      process.exit(1);
    }
    level = opts.level;
  } else {
    level = resolveLevel(repoRoot, proposal.level);
  }

  console.error("");
  console.error("know-code grade review");
  console.error(`  hash:     ${ctx.diffHash}`);
  console.error(`  scope:    ${ctx.scope}`);
  console.error(`  level:    ${level}`);
  console.error(`  pass bar: ${PASS_SCORE}`);
  console.error("");

  for (const pq of proposal.perQuestion) {
    const q = quiz?.questions.find((x) => x.id === pq.id);
    const ans = answers.answers.find((a) => a.id === pq.id);
    console.error(`── ${pq.id} (score ${pq.score})`);
    if (q) {
      const excerpt =
        q.prompt.length > 120 ? `${q.prompt.slice(0, 120)}…` : q.prompt;
      console.error(`  Q: ${excerpt}`);
    }
    if (ans) {
      const aExcerpt =
        ans.answer.length > 200 ? `${ans.answer.slice(0, 200)}…` : ans.answer;
      console.error(`  A: ${aExcerpt}`);
    }
    console.error(`  Feedback: ${pq.feedback}`);
    console.error("");
  }

  let finalScore = proposal.proposedScore;
  let humanAdjusted = false;

  if (!opts.accept) {
    const adjust = await promptLine(
      `Accept proposed score ${proposal.proposedScore}? [Y/n/adjust]: `,
    );
    if (adjust.toLowerCase() === "n") {
      console.error("know-code: grade review cancelled.");
      process.exit(1);
    }
    if (adjust.toLowerCase() === "adjust" || adjust.toLowerCase() === "a") {
      const raw = await promptLine("Enter final score (0–1): ");
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        console.error("know-code: score must be 0–1");
        process.exit(1);
      }
      finalScore = parsed;
      humanAdjusted = parsed !== proposal.proposedScore;
    }
  }

  const unsigned = buildGradeReceipt(
    ctx,
    answers.answersDigest!,
    finalScore,
    level,
    proposal,
    humanAdjusted,
  );

  try {
    await sealGrade(repoRoot, unsigned, opts.passphrase);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (finalScore >= PASS_SCORE) {
    console.log(
      `know-code: grade sealed score=${finalScore} (≥${PASS_SCORE}) — run know-code pass`,
    );
  } else {
    console.error(
      `know-code: grade sealed score=${finalScore} (<${PASS_SCORE}) — re-teach / re-quiz`,
    );
    process.exit(2);
  }
}

export async function cmdGrade(opts: {
  subcommand?: string;
  score?: string;
  hash?: string;
  level?: string;
  passphrase?: string;
  review?: boolean;
  accept?: boolean;
  json?: boolean;
}): Promise<void> {
  if (opts.subcommand === "propose") {
    cmdGradePropose({ json: opts.json });
    return;
  }

  if (opts.review === true || opts.accept === true) {
    await cmdGradeReview({
      accept: opts.accept,
      hash: opts.hash,
      level: opts.level,
      passphrase: opts.passphrase,
    });
    return;
  }

  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);

  if (opts.score !== undefined) {
    if (!config.allowSelfScore) {
      console.error(
        "know-code: grade --score is disabled (honor-system).\n" +
          "  Agent must write grade-proposal.json; human runs: know-code grade --review\n" +
          "  Emergency: set allowSelfScore: true in config or know-code config set allowSelfScore true",
      );
      process.exit(1);
    }
    await cmdGradeSelfScore(opts);
    return;
  }

  console.error("know-code: grade requires --review or --accept (or grade propose).\n");
  console.error(`  Flow: ${FLOW_HINT}`);
  process.exit(1);
}

async function cmdGradeSelfScore(opts: {
  score?: string;
  hash?: string;
  level?: string;
  passphrase?: string;
}): Promise<void> {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const hash = opts.hash || ctx.diffHash;

  if (hash !== ctx.diffHash) {
    console.error(
      `know-code: grade hash does not match current diff.\n` +
        `  provided: ${hash}\n` +
        `  current:  ${ctx.diffHash}`,
    );
    process.exit(1);
  }

  if (opts.score === undefined) {
    console.error("know-code: grade --score requires a value");
    process.exit(1);
  }

  const score = Number(opts.score);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    console.error("know-code: --score must be a number between 0 and 1");
    process.exit(1);
  }

  let answers;
  try {
    answers = assertAnswersForHash(repoRoot, ctx.diffHash);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  let level: Level;
  if (opts.level) {
    if (!isLevel(opts.level)) {
      console.error(`know-code: invalid level "${opts.level}"`);
      process.exit(1);
    }
    level = opts.level;
  } else {
    level = resolveLevel(repoRoot, undefined);
  }

  const unsigned = buildGradeReceipt(
    ctx,
    answers.answersDigest!,
    score,
    level,
  );

  try {
    await sealGrade(repoRoot, unsigned, opts.passphrase);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (score >= PASS_SCORE) {
    console.log(
      `know-code: grade sealed (self-score) score=${score} — human may run know-code pass`,
    );
  } else {
    console.error(
      `know-code: grade sealed score=${score} (<${PASS_SCORE}) — re-teach / re-quiz`,
    );
    process.exit(2);
  }
}
