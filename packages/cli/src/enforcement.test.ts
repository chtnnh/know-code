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
import { writeConfig } from "./config.js";
import { isSignedGateOpen, readGate, writeGate } from "./gate.js";
import { initAttestKey, signPayload } from "./seal.js";
import { DEFAULT_CONFIG, type GateReceipt } from "./types.js";

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

describe("enforcement: forged receipts cannot open gate", () => {
  let repoRoot: string;
  let attestHome: string;
  const passphrase = "enforcement-passphrase-ok";
  const prevHome = process.env.KNOW_CODE_ATTEST_HOME;
  const prevHook = process.env.KNOW_CODE_HOOK_FORMAT;
  const hash = "f".repeat(64);

  before(() => {
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    attestHome = mkdtempSync(join(tmpdir(), "kc-enf-home-"));
    process.env.KNOW_CODE_ATTEST_HOME = attestHome;
    repoRoot = mkdtempSync(join(tmpdir(), "kc-enf-repo-"));
    git(repoRoot, ["init", "-b", "main", "--template="]);
    git(repoRoot, ["config", "user.email", "test@example.com"]);
    git(repoRoot, ["config", "user.name", "test"]);
    mkdirSync(join(repoRoot, ".know-code"), { recursive: true });
    writeConfig(repoRoot, { ...DEFAULT_CONFIG, level: "lite" });
    initAttestKey(repoRoot, passphrase);
  });

  after(() => {
    if (prevHome === undefined) delete process.env.KNOW_CODE_ATTEST_HOME;
    else process.env.KNOW_CODE_ATTEST_HOME = prevHome;
    if (prevHook === undefined) delete process.env.KNOW_CODE_HOOK_FORMAT;
    else process.env.KNOW_CODE_HOOK_FORMAT = prevHook;
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(attestHome, { recursive: true, force: true });
  });

  it("unsigned gate.json does not open", () => {
    writeGate(repoRoot, {
      version: 1,
      diffHash: hash,
      level: "lite",
      passedAt: new Date().toISOString(),
      commitRange: "x",
      baseRef: "y",
      headRef: "z",
    });
    assert.equal(isSignedGateOpen(repoRoot, readGate(repoRoot), hash, "lite"), false);
  });

  it("agent-forged sig bytes do not open", () => {
    writeGate(repoRoot, {
      version: 1,
      diffHash: hash,
      level: "lite",
      passedAt: new Date().toISOString(),
      commitRange: "x",
      baseRef: "y",
      headRef: "z",
      keyId: "deadbeefdeadbeef",
      sig: Buffer.alloc(64, 7).toString("base64"),
    });
    assert.equal(isSignedGateOpen(repoRoot, readGate(repoRoot), hash, "lite"), false);
  });

  it("valid human-sealed gate opens", () => {
    writeAnswers(repoRoot, {
      diffHash: hash,
      level: "lite",
      answers: [{ id: "q1", answer: "because seals" }],
    });
    const digest = answersDigest({
      diffHash: hash,
      answers: [{ id: "q1", answer: "because seals" }],
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
      commitRange: "x",
      baseRef: "y",
      headRef: "z",
      answersDigest: digest,
    };
    const sealed = signPayload(
      repoRoot,
      passphrase,
      gateUnsigned as unknown as Record<string, unknown>,
    );
    writeGate(repoRoot, { ...gateUnsigned, ...sealed });
    assert.equal(isSignedGateOpen(repoRoot, readGate(repoRoot), hash, "lite"), true);
  });

  it("mutating sealed gate payload invalidates", () => {
    const receipt = readGate(repoRoot)!;
    writeFileSync(
      join(repoRoot, ".know-code", "gate.json"),
      `${JSON.stringify({ ...receipt, level: "deep" }, null, 2)}\n`,
    );
    assert.equal(
      isSignedGateOpen(repoRoot, readGate(repoRoot), hash, "lite"),
      false,
    );
  });
});
