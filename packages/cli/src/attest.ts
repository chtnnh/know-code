import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  answersPath,
  gradePath,
  knowCodeDir,
  taughtPath,
} from "./paths.js";
import { readConfig } from "./config.js";
import { assertSigned } from "./seal.js";
import type { Level } from "./types.js";

export const PASS_SCORE = 0.8;

function maybeAssertSigned(
  repoRoot: string,
  label: string,
  payload: Record<string, unknown> & { sig?: string; keyId?: string },
): void {
  if (!readConfig(repoRoot).requireAttest) return;
  assertSigned(repoRoot, label, payload);
}

export interface AnswersFile {
  diffHash: string;
  level?: string;
  answers: Array<{ id: string; answer: string }>;
  submittedAt?: string;
  /** sha256 of canonical answers — bound into grade/gate seals. */
  answersDigest?: string;
}

export interface GradeReceipt {
  version: 1;
  diffHash: string;
  score: number;
  passed: boolean;
  gradedAt: string;
  level?: Level;
  answersDigest: string;
  proposalDigest?: string;
  humanAdjusted?: boolean;
  finalScore?: number;
  keyId?: string;
  sig?: string;
}

export interface TaughtReceipt {
  version: 1;
  diffHash: string;
  taughtAt: string;
  /** Human explicitly skipped teaching for this hash. */
  skipped: boolean;
  keyId?: string;
  sig?: string;
}

export function answersDigest(answers: AnswersFile): string {
  const canonical = {
    diffHash: answers.diffHash,
    answers: [...answers.answers]
      .map((a) => ({ id: a.id, answer: String(a.answer || "") }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function readAnswers(repoRoot: string): AnswersFile | null {
  const path = answersPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AnswersFile;
  } catch {
    throw new Error(
      "know-code: corrupt .know-code/answers.json — delete and re-run know-code ask.",
    );
  }
}

export function writeAnswers(repoRoot: string, answers: AnswersFile): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  const digest = answersDigest(answers);
  const out: AnswersFile = { ...answers, answersDigest: digest };
  writeFileSync(answersPath(repoRoot), `${JSON.stringify(out, null, 2)}\n`);
}

export function readGrade(repoRoot: string): GradeReceipt | null {
  const path = gradePath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as GradeReceipt;
    if (data.version !== 1 || typeof data.score !== "number") return null;
    return data;
  } catch {
    throw new Error(
      "know-code: corrupt .know-code/grade.json — delete and re-run know-code grade --review.",
    );
  }
}

export function writeGrade(repoRoot: string, receipt: GradeReceipt): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(gradePath(repoRoot), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function readTaught(repoRoot: string): TaughtReceipt | null {
  const path = taughtPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as TaughtReceipt;
    if (data.version !== 1 || !data.diffHash) return null;
    return data;
  } catch {
    throw new Error(
      "know-code: corrupt .know-code/taught.json — delete and re-run know-code taught.",
    );
  }
}

export function writeTaught(repoRoot: string, receipt: TaughtReceipt): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(taughtPath(repoRoot), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function assertAnswersForHash(
  repoRoot: string,
  diffHash: string,
): AnswersFile {
  const answers = readAnswers(repoRoot);
  if (!answers) {
    throw new Error(
      "know-code: missing .know-code/answers.json — run know-code ask (browser quiz) first.",
    );
  }
  if (answers.diffHash !== diffHash) {
    throw new Error(
      `know-code: answers.json hash mismatch.\n` +
        `  answers: ${answers.diffHash}\n` +
        `  current: ${diffHash}\n` +
        `Re-run the browser quiz against the current index.`,
    );
  }
  if (!Array.isArray(answers.answers) || !answers.answers.length) {
    throw new Error("know-code: answers.json has no answers.");
  }
  for (const a of answers.answers) {
    if (!String(a.answer || "").trim()) {
      throw new Error(`know-code: empty answer for ${a.id || "?"}.`);
    }
  }
  const digest = answersDigest(answers);
  if (answers.answersDigest && answers.answersDigest !== digest) {
    throw new Error(
      "know-code: answers.json answersDigest mismatch (file tampered after write).",
    );
  }
  return { ...answers, answersDigest: digest };
}

export function assertGradeForHash(
  repoRoot: string,
  diffHash: string,
): GradeReceipt {
  const grade = readGrade(repoRoot);
  if (!grade) {
    throw new Error(
      "know-code: missing .know-code/grade.json — after agent grading, a human must run:\n" +
        `  know-code grade --review --hash ${diffHash}`,
    );
  }
  if (grade.diffHash !== diffHash) {
    throw new Error(
      `know-code: grade.json hash mismatch.\n` +
        `  grade:   ${grade.diffHash}\n` +
        `  current: ${diffHash}`,
    );
  }
  if (!grade.passed || grade.score < PASS_SCORE) {
    throw new Error(
      `know-code: grade below pass bar (${PASS_SCORE}). score=${grade.score} passed=${grade.passed}`,
    );
  }
  maybeAssertSigned(repoRoot, "grade.json", grade as unknown as Record<string, unknown> & { sig?: string; keyId?: string });
  return grade;
}

export function assertTaughtForHash(
  repoRoot: string,
  diffHash: string,
): TaughtReceipt {
  const taught = readTaught(repoRoot);
  if (!taught) {
    throw new Error(
      "know-code: missing .know-code/taught.json — after know-code-teach (or human skip), a human must run:\n" +
        "  know-code taught\n" +
        "  know-code taught --skip   # only if the human explicitly skipped teaching",
    );
  }
  if (taught.diffHash !== diffHash) {
    throw new Error(
      `know-code: taught.json hash mismatch.\n` +
        `  taught:  ${taught.diffHash}\n` +
        `  current: ${diffHash}\n` +
        `Re-run know-code-teach for the current index, then know-code taught.`,
    );
  }
  maybeAssertSigned(repoRoot, "taught.json", taught as unknown as Record<string, unknown> & { sig?: string; keyId?: string });
  return taught;
}

export function assertGradeAnswersBinding(
  grade: GradeReceipt,
  answers: AnswersFile,
): void {
  const digest = answers.answersDigest || answersDigest(answers);
  if (!grade.answersDigest || grade.answersDigest !== digest) {
    throw new Error(
      "know-code: grade seal does not bind current answers.json (answers changed after grade).",
    );
  }
}
