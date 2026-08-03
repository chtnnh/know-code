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

export const OVERRIDE_TTL_MS = 10 * 60 * 1000;

export interface OverrideAllow {
  version: 1;
  createdAt: string;
  expiresAt: string;
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

export function hasValidOverrideAllow(repoRoot: string): boolean {
  const allow = readOverrideAllow(repoRoot);
  if (!allow) return false;
  return Date.parse(allow.expiresAt) > Date.now();
}

export function writeOverrideAllow(repoRoot: string): OverrideAllow {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OVERRIDE_TTL_MS).toISOString();
  const allow: OverrideAllow = { version: 1, createdAt, expiresAt };
  writeFileSync(overrideAllowPath(repoRoot), `${JSON.stringify(allow, null, 2)}\n`);
  return allow;
}

export function consumeOverrideAllow(repoRoot: string): void {
  const path = overrideAllowPath(repoRoot);
  if (existsSync(path)) unlinkSync(path);
}

/**
 * If KNOW_CODE_OVERRIDE=1, decide whether bypass is allowed.
 * Env alone is never enough — needs a fresh override-allow from `know-code override`.
 * Denied in agent hooks and CI.
 */
export function tryOverrideBypass(repoRoot: string): {
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
    logOverride(repoRoot, "denied OVERRIDE without override-allow.json");
    return {
      allowed: false,
      reason:
        "know-code: OVERRIDE requires a prior TTY confirmation.\n" +
        "  Run: know-code override\n" +
        "  Then: KNOW_CODE_OVERRIDE=1 <command>\n" +
        "  (allowance lasts 10 minutes, one successful check consumes it)",
    };
  }

  consumeOverrideAllow(repoRoot);
  logOverride(repoRoot, "allowed OVERRIDE (consumed override-allow)");
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

/** Interactive: write a short-lived one-shot override allowance. */
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

  const allow = writeOverrideAllow(repoRoot);
  logOverride(repoRoot, "created override-allow via TTY");
  console.error(`know-code: override allowed until ${allow.expiresAt}`);
  console.error(
    "know-code: next: KNOW_CODE_OVERRIDE=1 git commit|push  (or know-code commit)",
  );
}
