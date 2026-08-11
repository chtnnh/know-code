import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PASS_SCORE,
  assertAnswersForHash,
  assertGradeForHash,
  assertTaughtForHash,
  answersDigest,
  writeAnswers,
  writeGrade,
  writeTaught,
  type GradeReceipt,
  type TaughtReceipt,
} from "./attest.js";
import { writeConfig } from "./config.js";
import {
  consumeOverrideAllow,
  hasValidOverrideAllow,
  isRestrictedOverrideContext,
  tryOverrideBypass,
  writeSealedOverrideAllow,
  writeUnsignedOverrideAllow,
} from "./override.js";
import { initAttestKey, signPayload } from "./seal.js";
import { DEFAULT_CONFIG } from "./types.js";

describe("attest prerequisites", () => {
  let dir: string;
  let attestHome: string;
  const hash = "a".repeat(64);
  const passphrase = "attest-test-passphrase";
  const prevHome = process.env.KNOW_CODE_ATTEST_HOME;
  const prevHook = process.env.KNOW_CODE_HOOK_FORMAT;

  before(() => {
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    attestHome = mkdtempSync(join(tmpdir(), "kc-att-"));
    process.env.KNOW_CODE_ATTEST_HOME = attestHome;
    dir = mkdtempSync(join(tmpdir(), "attest-"));
    mkdirSync(join(dir, ".know-code"), { recursive: true });
    writeConfig(dir, { ...DEFAULT_CONFIG, level: "lite" });
    initAttestKey(dir, passphrase);
  });

  after(() => {
    if (prevHome === undefined) delete process.env.KNOW_CODE_ATTEST_HOME;
    else process.env.KNOW_CODE_ATTEST_HOME = prevHome;
    if (prevHook === undefined) delete process.env.KNOW_CODE_HOOK_FORMAT;
    else process.env.KNOW_CODE_HOOK_FORMAT = prevHook;
    rmSync(dir, { recursive: true, force: true });
    rmSync(attestHome, { recursive: true, force: true });
  });

  it("requires answers for hash", () => {
    assert.throws(() => assertAnswersForHash(dir, hash), /missing .*answers/);
    writeAnswers(dir, {
      diffHash: hash,
      level: "standard",
      answers: [{ id: "q1", answer: "ok" }],
    });
    assert.equal(assertAnswersForHash(dir, hash).answers.length, 1);
  });

  it("detects answers digest tamper", () => {
    writeFileSync(
      join(dir, ".know-code", "answers.json"),
      JSON.stringify({
        diffHash: hash,
        answers: [{ id: "q1", answer: "ok" }],
        answersDigest: "0".repeat(64),
      }),
    );
    assert.throws(() => assertAnswersForHash(dir, hash), /answersDigest mismatch/);
    writeAnswers(dir, {
      diffHash: hash,
      answers: [{ id: "q1", answer: "ok" }],
    });
  });

  it("requires sealed passing grade for hash", () => {
    assert.throws(() => assertGradeForHash(dir, hash), /missing .*grade/);
    const answers = assertAnswersForHash(dir, hash);
    const digest = answers.answersDigest || answersDigest(answers);

    writeGrade(dir, {
      version: 1,
      diffHash: hash,
      score: 0.5,
      passed: false,
      gradedAt: new Date().toISOString(),
      answersDigest: digest,
    });
    assert.throws(() => assertGradeForHash(dir, hash), /below pass bar|invalid or missing human seal/);

    const unsigned: Omit<GradeReceipt, "keyId" | "sig"> = {
      version: 1,
      diffHash: hash,
      score: PASS_SCORE,
      passed: true,
      gradedAt: new Date().toISOString(),
      answersDigest: digest,
    };
    // unsigned high score still fails seal check
    writeGrade(dir, unsigned as GradeReceipt);
    assert.throws(() => assertGradeForHash(dir, hash), /invalid or missing human seal/);

    const { keyId, sig } = signPayload(
      dir,
      passphrase,
      unsigned as unknown as Record<string, unknown>,
    );
    writeGrade(dir, { ...unsigned, keyId, sig });
    assert.equal(assertGradeForHash(dir, hash).score, PASS_SCORE);
  });

  it("requires sealed taught for hash", () => {
    assert.throws(() => assertTaughtForHash(dir, hash), /missing .*taught/);
    const unsigned: Omit<TaughtReceipt, "keyId" | "sig"> = {
      version: 1,
      diffHash: hash,
      taughtAt: new Date().toISOString(),
      skipped: false,
    };
    writeTaught(dir, unsigned as TaughtReceipt);
    assert.throws(() => assertTaughtForHash(dir, hash), /invalid or missing human seal/);
    const { keyId, sig } = signPayload(
      dir,
      passphrase,
      unsigned as unknown as Record<string, unknown>,
    );
    writeTaught(dir, { ...unsigned, keyId, sig });
    assert.equal(assertTaughtForHash(dir, hash).skipped, false);
  });
});

describe("override policy", () => {
  let dir: string;
  let attestHome: string;
  const passphrase = "override-test-passphrase";
  const keys = [
    "KNOW_CODE_OVERRIDE",
    "KNOW_CODE_HOOK_FORMAT",
    "CI",
    "GITHUB_ACTIONS",
    "KNOW_CODE_ATTEST_HOME",
    "KNOW_CODE_ATTEST_PASSPHRASE",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  before(() => {
    for (const k of keys) prev[k] = process.env[k];
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    attestHome = mkdtempSync(join(tmpdir(), "kc-ovr-att-"));
    process.env.KNOW_CODE_ATTEST_HOME = attestHome;
    process.env.KNOW_CODE_ATTEST_PASSPHRASE = passphrase;
    dir = mkdtempSync(join(tmpdir(), "override-"));
    mkdirSync(join(dir, ".know-code"), { recursive: true });
    writeConfig(dir, { ...DEFAULT_CONFIG, level: "lite", requireAttest: true });
    initAttestKey(dir, passphrase);
  });

  after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    rmSync(dir, { recursive: true, force: true });
    rmSync(attestHome, { recursive: true, force: true });
  });

  it("denies OVERRIDE in agent-hook context", async () => {
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    // Seal while not in agent context (sealing requires human TTY path).
    await writeSealedOverrideAllow(dir, { passphrase });
    process.env.KNOW_CODE_OVERRIDE = "1";
    process.env.KNOW_CODE_HOOK_FORMAT = "cursor";
    assert.equal(isRestrictedOverrideContext(), true);
    const r = tryOverrideBypass(dir);
    assert.equal(r.allowed, false);
    assert.match(r.reason || "", /denied in agent hooks/);
    delete process.env.KNOW_CODE_HOOK_FORMAT;
  });

  it("denies OVERRIDE without allow file", () => {
    process.env.KNOW_CODE_OVERRIDE = "1";
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    consumeOverrideAllow(dir);
    const r = tryOverrideBypass(dir);
    assert.equal(r.allowed, false);
    assert.match(r.reason || "", /know-code override/);
  });

  it("denies agent-minted unsigned override-allow", () => {
    process.env.KNOW_CODE_OVERRIDE = "1";
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    writeUnsignedOverrideAllow(dir);
    assert.equal(hasValidOverrideAllow(dir), false);
    const r = tryOverrideBypass(dir);
    assert.equal(r.allowed, false);
  });

  it("allows then consumes sealed override-allow", async () => {
    process.env.KNOW_CODE_OVERRIDE = "1";
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    await writeSealedOverrideAllow(dir, { passphrase });
    assert.equal(hasValidOverrideAllow(dir), true);
    const r = tryOverrideBypass(dir);
    assert.equal(r.allowed, true);
    assert.equal(hasValidOverrideAllow(dir), false);
    assert.equal(existsSync(join(dir, ".know-code", "override-allow.json")), false);
  });
});
