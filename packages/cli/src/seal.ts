/**
 * Human-held Ed25519 attestation seals.
 *
 * Threat model (what this defends):
 * - Same-UID coding agent can write any file under the repo and run non-interactive CLI.
 * - Agent does NOT know the human passphrase and cannot complete TTY passphrase prompts
 *   in a sealed human terminal; agent hooks cannot seal.
 *
 * Not defended: passphrase phishing into an agent-captured prompt; malware/keylogger;
 * replacing ~/.know-code/attest on disk (pubkey lives in meta.json beside the key).
 *
 * Pattern: passphrase unlocks encrypted private key at seal time; public key verifies
 * taught/grade/gate without the secret. See also agent-receipts / local trust-anchor designs.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  sign as cryptoSign,
  verify as cryptoVerify,
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stderr as output } from "node:process";
import { findGitRoot } from "./paths.js";
import { readConfig } from "./config.js";
import { promptSecretHidden } from "./prompt.js";

export const ATTEST_VERSION = 1 as const;

export interface AttestMeta {
  version: typeof ATTEST_VERSION;
  repoId: string;
  keyId: string;
  pubKey: string; // base64 SPKI
  createdAt: string;
}

interface EncryptedPrivateKey {
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function homeAttestRoot(): string {
  return (
    process.env.KNOW_CODE_ATTEST_HOME || join(homedir(), ".know-code", "attest")
  );
}

export function repoAttestId(repoRoot: string): string {
  return createHash("sha256").update(repoRoot).digest("hex").slice(0, 32);
}

export function attestDir(repoRoot: string): string {
  return join(homeAttestRoot(), repoAttestId(repoRoot));
}

function metaPath(repoRoot: string): string {
  return join(attestDir(repoRoot), "meta.json");
}

function privatePath(repoRoot: string): string {
  return join(attestDir(repoRoot), "private.enc");
}

export function keyIdFromPubKey(pubKeyB64: string): string {
  return createHash("sha256").update(pubKeyB64).digest("hex").slice(0, 16);
}

export function readAttestMeta(repoRoot: string): AttestMeta | null {
  const path = metaPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as AttestMeta;
    if (data.version !== 1 || !data.pubKey || !data.keyId) return null;
    return data;
  } catch {
    return null;
  }
}

/** Deny sealing from agent shell hooks. */
export function assertNotAgentHook(action: string): void {
  if (process.env.KNOW_CODE_HOOK_FORMAT) {
    throw new Error(
      `know-code: cannot ${action} from agent hooks.\n` +
        `  A human must run this in their own terminal (TTY + passphrase).`,
    );
  }
}

export function canUsePassphraseEnv(): boolean {
  if (process.env.KNOW_CODE_HOOK_FORMAT) return false;
  return true;
}

function promptSecret(question: string): Promise<string> {
  return promptSecretHidden(question);
}

export async function resolvePassphrase(opts?: {
  passphrase?: string;
}): Promise<string> {
  assertNotAgentHook("unlock attest key");

  if (opts?.passphrase) {
    if (!opts.passphrase) {
      throw new Error("know-code: empty passphrase");
    }
    return opts.passphrase;
  }

  const fromEnv = process.env.KNOW_CODE_ATTEST_PASSPHRASE;
  if (fromEnv) {
    if (!canUsePassphraseEnv()) {
      throw new Error(
        "know-code: KNOW_CODE_ATTEST_PASSPHRASE denied in agent hooks.",
      );
    }
    return fromEnv;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "know-code: sealing requires an interactive TTY (or KNOW_CODE_ATTEST_PASSPHRASE outside agent hooks).\n" +
        "  Run this command in your own terminal, not via the agent.",
    );
  }

  const pass = await promptSecret("know-code attest passphrase: ");
  if (!pass) {
    throw new Error("know-code: empty passphrase");
  }
  return pass;
}

function encryptPrivateKey(privateDer: Buffer, passphrase: string): EncryptedPrivateKey {
  const salt = randomBytes(16);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateDer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptPrivateKey(
  enc: EncryptedPrivateKey,
  passphrase: string,
): Buffer {
  const salt = Buffer.from(enc.salt, "base64");
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = Buffer.from(enc.iv, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const ciphertext = Buffer.from(enc.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function initAttestKey(
  repoRoot: string,
  passphrase: string,
  opts?: { force?: boolean },
): AttestMeta {
  if (!passphrase || passphrase.length < 8) {
    throw new Error(
      "know-code: attest passphrase must be at least 8 characters.",
    );
  }

  const dir = attestDir(repoRoot);
  if (existsSync(metaPath(repoRoot)) && !opts?.force) {
    throw new Error(
      `know-code: attest key already exists at ${dir}\n` +
        `  Re-run with --force to rotate (requires confirming you intend to invalidate old seals).`,
    );
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubKey = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const privateDer = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const keyId = keyIdFromPubKey(pubKey);
  const meta: AttestMeta = {
    version: ATTEST_VERSION,
    repoId: repoAttestId(repoRoot),
    keyId,
    pubKey,
    createdAt: new Date().toISOString(),
  };

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(metaPath(repoRoot), `${JSON.stringify(meta, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(
    privatePath(repoRoot),
    `${JSON.stringify(encryptPrivateKey(privateDer, passphrase), null, 2)}\n`,
    { mode: 0o600 },
  );
  try {
    chmodSync(dir, 0o700);
    chmodSync(metaPath(repoRoot), 0o600);
    chmodSync(privatePath(repoRoot), 0o600);
  } catch {
    // best-effort on platforms that ignore mode
  }

  return meta;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      if (k === "sig") continue;
      out[k] = sortKeysDeep(obj[k]);
    }
    return out;
  }
  return value;
}

/** Canonical bytes signed/verified for a receipt (everything except `sig`). */
export function canonicalSealBytes(payload: Record<string, unknown>): Buffer {
  return Buffer.from(JSON.stringify(sortKeysDeep(payload)), "utf8");
}

export function signPayload(
  repoRoot: string,
  passphrase: string,
  payload: Record<string, unknown>,
): { keyId: string; sig: string } {
  assertNotAgentHook("sign");
  const meta = readAttestMeta(repoRoot);
  if (!meta) {
    throw new Error(
      "know-code: no attest key — run `know-code attest-init` in a human TTY first.",
    );
  }
  if (!existsSync(privatePath(repoRoot))) {
    throw new Error(`know-code: missing encrypted private key at ${privatePath(repoRoot)}`);
  }
  const enc = JSON.parse(
    readFileSync(privatePath(repoRoot), "utf8"),
  ) as EncryptedPrivateKey;
  let privateDer: Buffer;
  try {
    privateDer = decryptPrivateKey(enc, passphrase);
  } catch {
    throw new Error("know-code: wrong attest passphrase (or corrupt private.enc).");
  }

  const key = createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
  const body = { ...payload, keyId: meta.keyId };
  const sig = cryptoSign(null, canonicalSealBytes(body), key).toString("base64");
  return { keyId: meta.keyId, sig };
}

export function verifyPayload(
  pubKeyB64: string,
  payload: Record<string, unknown> & { sig?: string; keyId?: string },
): boolean {
  if (!payload.sig || !payload.keyId) return false;
  if (keyIdFromPubKey(pubKeyB64) !== payload.keyId) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(pubKeyB64, "base64"),
      format: "der",
      type: "spki",
    });
    const { sig, ...rest } = payload;
    return cryptoVerify(
      null,
      canonicalSealBytes(rest as Record<string, unknown>),
      key,
      Buffer.from(sig, "base64"),
    );
  } catch {
    return false;
  }
}

export function requireAttestPubKey(repoRoot: string): string {
  const meta = readAttestMeta(repoRoot);
  if (!meta) {
    throw new Error(
      "know-code: attest not initialized. A human must run:\n" +
        "  know-code attest-init\n" +
        "  (creates passphrase-encrypted Ed25519 key under ~/.know-code/attest/)",
    );
  }
  return meta.pubKey;
}

export function assertSigned(
  repoRoot: string,
  label: string,
  payload: Record<string, unknown> & { sig?: string; keyId?: string },
): void {
  const pub = requireAttestPubKey(repoRoot);
  if (!verifyPayload(pub, payload)) {
    throw new Error(
      `know-code: invalid or missing human seal on ${label}.\n` +
        `  Receipts must be signed via TTY + attest passphrase (agents cannot forge seals).`,
    );
  }
}

export async function sealPayload(
  repoRoot: string,
  payload: Record<string, unknown>,
  opts?: { passphrase?: string },
): Promise<Record<string, unknown> & { keyId?: string; sig?: string }> {
  const config = readConfig(repoRoot);
  if (!config.requireAttest) {
    return { ...payload };
  }
  const passphrase = await resolvePassphrase(opts);
  const { keyId, sig } = signPayload(repoRoot, passphrase, payload);
  return { ...payload, keyId, sig };
}

/** CLI: create / rotate attest key (human TTY). */
export async function cmdAttestInit(opts: {
  force?: boolean;
  passphrase?: string;
}): Promise<void> {
  const repoRoot = findGitRoot();
  assertNotAgentHook("attest-init");

  let passphrase = opts.passphrase || process.env.KNOW_CODE_ATTEST_PASSPHRASE;
  if (passphrase && process.env.KNOW_CODE_HOOK_FORMAT) {
    console.error("know-code: attest-init denied in agent hooks.");
    process.exit(1);
  }
  if (!passphrase) {
    if (!process.stdin.isTTY) {
      console.error(
        "know-code: attest-init requires TTY or KNOW_CODE_ATTEST_PASSPHRASE.",
      );
      process.exit(1);
    }
    passphrase = await promptSecret("new attest passphrase (min 8 chars): ");
    const again = await promptSecret("confirm passphrase: ");
    if (passphrase !== again) {
      console.error("know-code: passphrases did not match.");
      process.exit(1);
    }
  }

  try {
    const meta = initAttestKey(repoRoot, passphrase, { force: opts.force });
    console.log(`know-code: attest key created keyId=${meta.keyId}`);
    console.log(`know-code: private key (encrypted) → ${attestDir(repoRoot)}`);
    console.log(`know-code: public key → ${metaPath(repoRoot)}`);
    console.log(
      "know-code: taught / grade / pass now require this passphrase to seal.",
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
