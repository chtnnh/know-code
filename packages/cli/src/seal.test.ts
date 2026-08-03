import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertNotAgentHook,
  initAttestKey,
  keyIdFromPubKey,
  readAttestMeta,
  signPayload,
  verifyPayload,
} from "./seal.js";
import { writeConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./types.js";

describe("attest seals (Ed25519)", () => {
  let repoRoot: string;
  let attestHome: string;
  const passphrase = "test-passphrase-ok";
  const prevHome = process.env.KNOW_CODE_ATTEST_HOME;
  const prevHook = process.env.KNOW_CODE_HOOK_FORMAT;

  before(() => {
    attestHome = mkdtempSync(join(tmpdir(), "kc-attest-"));
    process.env.KNOW_CODE_ATTEST_HOME = attestHome;
    delete process.env.KNOW_CODE_HOOK_FORMAT;
    repoRoot = mkdtempSync(join(tmpdir(), "kc-repo-"));
    mkdirSync(join(repoRoot, ".know-code"), { recursive: true });
    writeConfig(repoRoot, { ...DEFAULT_CONFIG, level: "lite" });
  });

  after(() => {
    if (prevHome === undefined) delete process.env.KNOW_CODE_ATTEST_HOME;
    else process.env.KNOW_CODE_ATTEST_HOME = prevHome;
    if (prevHook === undefined) delete process.env.KNOW_CODE_HOOK_FORMAT;
    else process.env.KNOW_CODE_HOOK_FORMAT = prevHook;
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(attestHome, { recursive: true, force: true });
  });

  it("initAttestKey writes meta to home attest dir", () => {
    const meta = initAttestKey(repoRoot, passphrase);
    assert.equal(meta.keyId, keyIdFromPubKey(meta.pubKey));
    assert.equal(readAttestMeta(repoRoot)?.keyId, meta.keyId);
  });

  it("sign + verify roundtrip", () => {
    const payload = {
      version: 1,
      diffHash: "a".repeat(64),
      taughtAt: new Date().toISOString(),
      skipped: false,
    };
    const { keyId, sig } = signPayload(repoRoot, passphrase, payload);
    const sealed = { ...payload, keyId, sig };
    const pub = readAttestMeta(repoRoot)!.pubKey;
    assert.equal(verifyPayload(pub, sealed), true);
  });

  it("rejects tampered payload", () => {
    const payload = {
      version: 1,
      diffHash: "b".repeat(64),
      taughtAt: new Date().toISOString(),
      skipped: false,
    };
    const { keyId, sig } = signPayload(repoRoot, passphrase, payload);
    const pub = readAttestMeta(repoRoot)!.pubKey;
    assert.equal(
      verifyPayload(pub, { ...payload, skipped: true, keyId, sig }),
      false,
    );
  });

  it("rejects wrong passphrase", () => {
    assert.throws(
      () =>
        signPayload(repoRoot, "wrong-passphrase!!", {
          version: 1,
          diffHash: "c".repeat(64),
        }),
      /wrong attest passphrase/,
    );
  });

  it("assertNotAgentHook blocks agent context", () => {
    process.env.KNOW_CODE_HOOK_FORMAT = "cursor";
    assert.throws(() => assertNotAgentHook("sign"), /agent hooks/);
    delete process.env.KNOW_CODE_HOOK_FORMAT;
  });

  it("sign denied in agent hook context", () => {
    process.env.KNOW_CODE_HOOK_FORMAT = "cursor";
    assert.throws(
      () =>
        signPayload(repoRoot, passphrase, {
          version: 1,
          diffHash: "d".repeat(64),
        }),
      /agent hooks/,
    );
    delete process.env.KNOW_CODE_HOOK_FORMAT;
  });

  it("forged sig without private key fails verify", () => {
    const pub = readAttestMeta(repoRoot)!.pubKey;
    assert.equal(
      verifyPayload(pub, {
        version: 1,
        diffHash: "e".repeat(64),
        keyId: keyIdFromPubKey(pub),
        sig: Buffer.alloc(64).toString("base64"),
      }),
      false,
    );
  });
});
