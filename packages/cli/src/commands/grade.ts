import { readConfig, resolveLevel } from "../config.js";
import {
  PASS_SCORE,
  assertAnswersForHash,
  writeGrade,
  type GradeReceipt,
} from "../attest.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot } from "../paths.js";
import { sealPayload } from "../seal.js";
import { isLevel, type Level } from "../types.js";

/**
 * Record grading of browser quiz answers. Human-sealed — required before pass.
 * Score is 0–1; pass bar is PASS_SCORE (0.8).
 */
export async function cmdGrade(opts: {
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
    console.error("know-code: grade requires --score <0-1> (e.g. --score 0.85)");
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

  const passed = score >= PASS_SCORE;
  const unsigned: Omit<GradeReceipt, "keyId" | "sig"> = {
    version: 1,
    diffHash: ctx.diffHash,
    score,
    passed,
    gradedAt: new Date().toISOString(),
    level,
    answersDigest: answers.answersDigest!,
  };

  try {
    const sealed = (await sealPayload(
      repoRoot,
      unsigned as unknown as Record<string, unknown>,
      { passphrase: opts.passphrase },
    )) as unknown as GradeReceipt;
    writeGrade(repoRoot, sealed);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (passed) {
    console.log(
      `know-code: grade sealed score=${score} (≥${PASS_SCORE}) — human may open gate via know-code pass`,
    );
  } else {
    console.error(
      `know-code: grade sealed score=${score} (<${PASS_SCORE}) — re-teach / re-quiz before pass`,
    );
    process.exit(2);
  }
}
