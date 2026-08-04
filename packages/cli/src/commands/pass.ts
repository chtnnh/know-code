import { readConfig, resolveLevel } from "../config.js";
import {
  assertAnswersForHash,
  assertGradeAnswersBinding,
  assertGradeForHash,
  assertTaughtForHash,
} from "../attest.js";
import { materializedTreeOid, writeGate } from "../gate.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot } from "../paths.js";
import { sealPayload } from "../seal.js";
import { isLevel, type GateReceipt } from "../types.js";

/**
 * Open the gate. Human-sealed when requireAttest is true.
 */
export async function cmdPass(opts: {
  level?: string;
  hash?: string;
  passphrase?: string;
}): Promise<void> {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const level = resolveLevel(repoRoot, opts.level);
  const hash = opts.hash || ctx.diffHash;

  if (hash !== ctx.diffHash) {
    console.error(
      `know-code: provided hash does not match current diff.\n` +
        `  provided: ${opts.hash}\n` +
        `  current:  ${ctx.diffHash}\n` +
        `  scope:    ${ctx.scope}\n` +
        `Re-run teach / quiz against the current diff.`,
    );
    process.exit(1);
  }

  if (opts.level && !isLevel(opts.level)) {
    console.error(`know-code: invalid level "${opts.level}"`);
    process.exit(1);
  }

  let answers;
  let grade;
  try {
    assertTaughtForHash(repoRoot, ctx.diffHash);
    answers = assertAnswersForHash(repoRoot, ctx.diffHash);
    grade = assertGradeForHash(repoRoot, ctx.diffHash);
    assertGradeAnswersBinding(grade, answers);
    if (grade.level && grade.level !== level) {
      console.error(
        `know-code: warning — grade level (${grade.level}) differs from pass level (${level})`,
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const unsigned: Omit<GateReceipt, "keyId" | "sig"> = {
    version: 1,
    diffHash: ctx.diffHash,
    level,
    passedAt: new Date().toISOString(),
    commitRange: ctx.commitRange,
    baseRef: ctx.baseRef,
    headRef: ctx.headRef,
    scope: ctx.scope,
    rangeFromOid: ctx.rangeFromOid,
    commitCount: ctx.commitCount,
    answersDigest: answers.answersDigest,
    gatedTreeOid: materializedTreeOid(repoRoot),
  };

  try {
    const sealed = (await sealPayload(
      repoRoot,
      unsigned as unknown as Record<string, unknown>,
      { passphrase: opts.passphrase },
    )) as unknown as GateReceipt;
    writeGate(repoRoot, sealed);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`know-code: gate sealed (${level}, scope=${ctx.scope})`);
  console.log(`know-code: hash ${ctx.diffHash}`);
  console.log(
    'know-code: next: know-code commit -m "<message>" (adds Know-Code-Verified trailer)',
  );
  if (ctx.scope === "range") {
    console.log(
      "know-code: then: know-code range seal   # after commit (optional --rewrite)",
    );
  }
}
