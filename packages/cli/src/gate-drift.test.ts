import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  answersDigest,
  writeAnswers,
  writeGrade,
  writeTaught,
  type GradeReceipt,
  type TaughtReceipt,
} from "./attest.js";
import { runCheck } from "./commands/check.js";
import { writeConfig } from "./config.js";
import {
  materializedTreeOid,
  readGate,
  resolveEffectiveQuizState,
  writeGate,
} from "./gate.js";
import { computeRangeDiffContext, resolveQuizContext } from "./hash.js";
import { initAttestKey, signPayload } from "./seal.js";
import { writeRangeSession } from "./range.js";
import { DEFAULT_CONFIG, type GateReceipt } from "./types.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe("gate survives commit when tree unchanged (range drift)", () => {
  let repoRoot: string;
  let attestHome: string;
  const passphrase = "gate-drift-passphrase";
  const prevHome = process.env.KNOW_CODE_ATTEST_HOME;

  before(() => {
    attestHome = mkdtempSync(join(tmpdir(), "kc-drift-home-"));
    process.env.KNOW_CODE_ATTEST_HOME = attestHome;
    repoRoot = mkdtempSync(join(tmpdir(), "kc-drift-repo-"));
    git(repoRoot, ["init", "-b", "main", "--template="]);
    git(repoRoot, ["config", "user.email", "test@example.com"]);
    git(repoRoot, ["config", "user.name", "test"]);
    writeFileSync(join(repoRoot, "base.txt"), "base\n");
    git(repoRoot, ["add", "base.txt"]);
    git(repoRoot, ["commit", "-m", "base"]);
    mkdirSync(join(repoRoot, ".know-code"), { recursive: true });
    writeConfig(repoRoot, {
      ...DEFAULT_CONFIG,
      level: "lite",
      rangeMode: "range",
      requireTrailer: true,
    });
    initAttestKey(repoRoot, passphrase);
  });

  after(() => {
    if (prevHome === undefined) delete process.env.KNOW_CODE_ATTEST_HOME;
    else process.env.KNOW_CODE_ATTEST_HOME = prevHome;
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(attestHome, { recursive: true, force: true });
  });

  it("keeps gate open after commit materializes staged range work", () => {
    const fromOid = git(repoRoot, ["rev-parse", "HEAD"]);
    writeRangeSession(repoRoot, {
      version: 1,
      fromOid,
      fromRef: fromOid,
      startedAt: new Date().toISOString(),
      startHead: fromOid,
    });

    writeFileSync(join(repoRoot, "feature.txt"), "new\n");
    git(repoRoot, ["add", "feature.txt"]);

    const stagedCtx = computeRangeDiffContext(repoRoot, {
      ...DEFAULT_CONFIG,
      rangeMode: "range",
    }, fromOid);
    const hash = stagedCtx.diffHash;
    const gatedTreeOid = materializedTreeOid(repoRoot);

    writeAnswers(repoRoot, {
      diffHash: hash,
      level: "lite",
      answers: [{ id: "q1", answer: "range staged" }],
    });
    const digest = answersDigest({
      diffHash: hash,
      answers: [{ id: "q1", answer: "range staged" }],
    });

    const taughtUnsigned: Omit<TaughtReceipt, "keyId" | "sig"> = {
      version: 1,
      diffHash: hash,
      taughtAt: new Date().toISOString(),
      skipped: false,
    };
    const t = signPayload(
      repoRoot,
      passphrase,
      taughtUnsigned as unknown as Record<string, unknown>,
    );
    writeTaught(repoRoot, { ...taughtUnsigned, ...t });

    const gradeUnsigned: Omit<GradeReceipt, "keyId" | "sig"> = {
      version: 1,
      diffHash: hash,
      score: 1,
      passed: true,
      gradedAt: new Date().toISOString(),
      level: "lite",
      answersDigest: digest,
    };
    const g = signPayload(
      repoRoot,
      passphrase,
      gradeUnsigned as unknown as Record<string, unknown>,
    );
    writeGrade(repoRoot, { ...gradeUnsigned, ...g });

    const gateUnsigned: Omit<GateReceipt, "keyId" | "sig"> = {
      version: 1,
      diffHash: hash,
      level: "lite",
      passedAt: new Date().toISOString(),
      commitRange: stagedCtx.commitRange,
      baseRef: stagedCtx.baseRef,
      headRef: stagedCtx.headRef,
      scope: "range",
      rangeFromOid: fromOid,
      commitCount: stagedCtx.commitCount,
      answersDigest: digest,
      gatedTreeOid,
    };
    const sealed = signPayload(
      repoRoot,
      passphrase,
      gateUnsigned as unknown as Record<string, unknown>,
    );
    writeGate(repoRoot, { ...gateUnsigned, ...sealed });

    const beforeCommit = resolveEffectiveQuizState(repoRoot);
    assert.equal(beforeCommit.commitDrift, false);
    assert.equal(runCheck(repoRoot).allowed, false);

    git(repoRoot, [
      "commit",
      "-m",
      `feat: add feature\n\nKnow-Code-Verified: ${hash}\n`,
    ]);

    const afterCommit = resolveQuizContext(repoRoot, {
      ...DEFAULT_CONFIG,
      rangeMode: "range",
    });
    assert.notEqual(afterCommit.diffHash, hash);
    assert.equal(materializedTreeOid(repoRoot), gatedTreeOid);

    const drift = resolveEffectiveQuizState(repoRoot);
    assert.equal(drift.commitDrift, true);
    assert.equal(drift.effectiveHash, hash);
    assert.equal(readGate(repoRoot)!.gatedTreeOid, gatedTreeOid);
    assert.equal(runCheck(repoRoot).allowed, true);
  });
});
