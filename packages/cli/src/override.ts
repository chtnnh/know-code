import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { stdin as input, stderr as output } from "node:process";
import {
  findGitRoot,
  knowCodeDir,
  overrideAllowPath,
  overrideLogPath,
} from "./paths.js";
import { assertSigned, sealPayload } from "./seal.js";

export const OVERRIDE_TTL_MS = 10 * 60 * 1000;

export interface OverrideAllow {
  version: 1;
  createdAt: string;
  expiresAt: string;
  keyId?: string;
  sig?: string;
}

/** Agent shell hooks set KNOW_CODE_HOOK_FORMAT; CI sets CI=true. */
export function isRestrictedOverrideContext(): boolean {
  if (process.env.KNOW_CODE_HOOK_FORMAT) return true;
  if (process.env.CI === "true" || process.env.CI === "1") return true;
  if (process.env.GITHUB_ACTIONS === "true") return true;
  return false;
}

export function logOverride(repoRoot: string, note: string): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  const line = `${new Date().toISOString()} ${note}\n`;
  appendFileSync(overrideLogPath(repoRoot), line);
}

export function readOverrideAllow(repoRoot: string): OverrideAllow | null {
  const path = overrideAllowPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as OverrideAllow;
    if (data.version !== 1 || !data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fresh TTL + human Ed25519 seal. Unsigned agent-minted files never count —
 * same threat model as forgeable .commit-in-progress tokens.
 */
export function hasValidOverrideAllow(repoRoot: string): boolean {
  const allow = readOverrideAllow(repoRoot);
  if (!allow) return false;
  if (Date.parse(allow.expiresAt) <= Date.now()) return false;
  if (!allow.sig || !allow.keyId) return false;
  try {
    assertSigned(
      repoRoot,
      "override-allow.json",
      allow as unknown as Record<string, unknown> & {
        sig?: string;
        keyId?: string;
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** @internal unsigned writer — does not authorize OVERRIDE (tests only). */
export function writeUnsignedOverrideAllow(repoRoot: string): OverrideAllow {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OVERRIDE_TTL_MS).toISOString();
  const allow: OverrideAllow = { version: 1, createdAt, expiresAt };
  writeFileSync(overrideAllowPath(repoRoot), `${JSON.stringify(allow, null, 2)}\n`);
  return allow;
}

/** Human-sealed override allowance (passphrase / TTY). */
export async function writeSealedOverrideAllow(
  repoRoot: string,
  opts?: { passphrase?: string },
): Promise<OverrideAllow> {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OVERRIDE_TTL_MS).toISOString();
  const unsigned: Omit<OverrideAllow, "keyId" | "sig"> = {
    version: 1,
    createdAt,
    expiresAt,
  };
  const sealed = (await sealPayload(
    repoRoot,
    unsigned as unknown as Record<string, unknown>,
    { passphrase: opts?.passphrase },
  )) as unknown as OverrideAllow;
  writeFileSync(
    overrideAllowPath(repoRoot),
    `${JSON.stringify(sealed, null, 2)}\n`,
  );
  return sealed;
}

/** @deprecated use writeSealedOverrideAllow — unsigned files are not valid. */
export function writeOverrideAllow(repoRoot: string): OverrideAllow {
  return writeUnsignedOverrideAllow(repoRoot);
}

export function consumeOverrideAllow(repoRoot: string): void {
  const path = overrideAllowPath(repoRoot);
  if (existsSync(path)) unlinkSync(path);
}

/**
 * If KNOW_CODE_OVERRIDE=1, decide whether bypass is allowed.
 * Env alone is never enough — needs a fresh sealed override-allow from
 * `know-code override`. Denied in agent hooks and CI.
 *
 * `consume` defaults true (check/hook). `know-code commit` peeks during entry
 * then consumes override-allow after a successful commit (not via pre-commit).
 */
export function tryOverrideBypass(
  repoRoot: string,
  opts: { consume?: boolean } = {},
): {
  allowed: boolean;
  reason?: string;
} {
  if (process.env.KNOW_CODE_OVERRIDE !== "1") {
    return { allowed: false };
  }

  if (isRestrictedOverrideContext()) {
    logOverride(
      repoRoot,
      "denied OVERRIDE in agent-hook/CI context (env alone insufficient)",
    );
    return {
      allowed: false,
      reason:
        "know-code: OVERRIDE denied in agent hooks / CI. A human must run `know-code override` on a TTY, then retry with KNOW_CODE_OVERRIDE=1.",
    };
  }

  if (!hasValidOverrideAllow(repoRoot)) {
    logOverride(repoRoot, "denied OVERRIDE without sealed override-allow.json");
    return {
      allowed: false,
      reason:
        "know-code: OVERRIDE requires a prior TTY confirmation with attest seal.\n" +
        "  Run: know-code override\n" +
        "  Then: KNOW_CODE_OVERRIDE=1 <command>\n" +
        "  (allowance lasts 10 minutes, one successful check consumes it)",
    };
  }

  if (opts.consume !== false) {
    consumeOverrideAllow(repoRoot);
    logOverride(repoRoot, "allowed OVERRIDE (consumed sealed override-allow)");
  } else {
    logOverride(repoRoot, "allowed OVERRIDE (peek; not consumed)");
  }
  return { allowed: true };
}

function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Interactive: write a short-lived one-shot sealed override allowance. */
export async function cmdOverride(): Promise<void> {
  const repoRoot = findGitRoot();

  if (isRestrictedOverrideContext()) {
    console.error(
      "know-code: cannot create override allow from agent hooks / CI.",
    );
    process.exit(1);
  }

  if (!process.stdin.isTTY) {
    console.error(
      "know-code: override requires an interactive TTY (human confirmation).",
    );
    process.exit(1);
  }

  console.error(
    "know-code: emergency bypass — this skips the comprehension quiz.",
  );
  console.error(
    "know-code: type OVERRIDE (all caps) to allow one check/commit/push within 10 minutes.",
  );
  const answer = await promptLine("> ");
  if (answer !== "OVERRIDE") {
    console.error("know-code: aborted (expected OVERRIDE).");
    process.exit(1);
  }

  try {
    const allow = await writeSealedOverrideAllow(repoRoot);
    logOverride(repoRoot, "created sealed override-allow via TTY");
    console.error(`know-code: override allowed until ${allow.expiresAt}`);
    console.error(
      "know-code: next: KNOW_CODE_OVERRIDE=1 git commit|push  (or know-code commit)",
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
