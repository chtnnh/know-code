import { readFileSync, existsSync } from "node:fs";
import { readConfig, resolveLevel } from "../config.js";
import { resolveQuizContext } from "../hash.js";
import {
  collectQuotaSignals,
  computeQuestionQuota,
  resolveQuotaFrom,
} from "../questions.js";
import { findGitRoot, quizPath } from "../paths.js";
import type { QuizSpec } from "./ask.js";

export interface QuizValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateQuiz(
  repoRoot: string,
  quiz: QuizSpec,
): QuizValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);

  if (!quiz.diffHash) errors.push("missing diffHash");
  if (!quiz.level) errors.push("missing level");
  if (!Array.isArray(quiz.questions) || !quiz.questions.length) {
    errors.push("questions[] must be non-empty");
  }

  const ids = new Set<string>();
  for (const q of quiz.questions || []) {
    if (!q.id) errors.push("question missing id");
    else if (ids.has(q.id)) errors.push(`duplicate question id: ${q.id}`);
    else ids.add(q.id);
    if (!q.prompt?.trim()) errors.push(`question ${q.id || "?"} missing prompt`);
  }

  if (quiz.diffHash && quiz.diffHash !== ctx.diffHash) {
    errors.push(
      `diffHash mismatch: quiz=${quiz.diffHash.slice(0, 12)}… current=${ctx.diffHash.slice(0, 12)}…`,
    );
  }

  const fromRef = resolveQuotaFrom(repoRoot, config.baseBranch, ctx.rangeFromOid);
  const level = resolveLevel(repoRoot, quiz.level);
  const quota = computeQuestionQuota(
    collectQuotaSignals(repoRoot, level, fromRef),
  );
  if ((quiz.questions?.length ?? 0) < quota.minQuestions) {
    errors.push(
      `need at least ${quota.minQuestions} questions (have ${quiz.questions?.length ?? 0})`,
    );
  }

  for (const q of quiz.questions || []) {
    if ((q as { expectedPoints?: string[] }).expectedPoints?.length) {
      continue;
    }
    if ((q as { type?: string }).type === "mcq") {
      const choices = (q as { choices?: string[] }).choices;
      if (!choices?.length) {
        warnings.push(`mcq ${q.id} missing choices[]`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function cmdQuizValidate(opts: { path?: string; json?: boolean }): void {
  const repoRoot = findGitRoot();
  const path = opts.path || quizPath(repoRoot);
  if (!existsSync(path)) {
    console.error(`know-code: quiz file not found: ${path}`);
    process.exit(1);
  }

  let quiz: QuizSpec;
  try {
    quiz = JSON.parse(readFileSync(path, "utf8")) as QuizSpec;
  } catch {
    console.error(`know-code: invalid JSON in ${path}`);
    process.exit(1);
  }

  const result = validateQuiz(repoRoot, quiz);

  if (opts.json) {
    console.log(JSON.stringify({ path, ...result }, null, 2));
  } else {
    console.log(`know-code quiz validate: ${path}`);
    if (result.ok) {
      console.log("  ok");
    }
    for (const e of result.errors) console.error(`  error: ${e}`);
    for (const w of result.warnings) console.error(`  warn:  ${w}`);
  }

  if (!result.ok) process.exit(1);
}
