import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitHooksDir } from "./paths.js";

const PRE_PUSH_MARKER = "# know-code pre-push";

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function bundledHooksDir(): string {
  const candidates = [
    join(packageRoot(), "hooks"),
    join(packageRoot(), "..", "..", "hooks"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "check-shell.sh"))) return dir;
  }
  return join(packageRoot(), "hooks");
}

export function prePushHookScript(): string {
  return `#!/usr/bin/env bash
${PRE_PUSH_MARKER}
# Blocks push unless know-code quiz receipt matches the current diff.
set -euo pipefail

if [[ "\${KNOW_CODE_OVERRIDE:-}" == "1" ]]; then
  echo "know-code: KNOW_CODE_OVERRIDE=1 — allowing push (logged)." >&2
  ROOT="\$(git rev-parse --show-toplevel)"
  mkdir -p "\$ROOT/.know-code"
  echo "know-code: override at \$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "\$ROOT/.know-code/override.log"
  exit 0
fi

if command -v know-code >/dev/null 2>&1; then
  exec know-code check
fi

ROOT="$(git rev-parse --show-toplevel)"
if [[ -x "\$ROOT/node_modules/.bin/know-code" ]]; then
  exec "\$ROOT/node_modules/.bin/know-code" check
fi
if [[ -f "\$ROOT/packages/cli/dist/index.js" ]]; then
  exec node "\$ROOT/packages/cli/dist/index.js" check
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes know-code check
fi

echo "know-code: CLI not found. Install with: npm i -g know-code" >&2
echo "know-code: or set KNOW_CODE_OVERRIDE=1 to bypass once." >&2
exit 1
`;
}

export function installGitPrePush(repoRoot: string): {
  path: string;
  created: boolean;
  backedUp?: string;
} {
  const hooksDir = gitHooksDir(repoRoot);
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, "pre-push");
  const script = prePushHookScript();

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf8");
    if (existing.includes(PRE_PUSH_MARKER)) {
      writeFileSync(hookPath, script);
      chmodSync(hookPath, 0o755);
      return { path: hookPath, created: false };
    }
    const backup = `${hookPath}.know-code-backup`;
    copyFileSync(hookPath, backup);
    writeFileSync(hookPath, script);
    chmodSync(hookPath, 0o755);
    return { path: hookPath, created: true, backedUp: backup };
  }

  writeFileSync(hookPath, script);
  chmodSync(hookPath, 0o755);
  return { path: hookPath, created: true };
}

export type AgentId = "claude" | "cursor" | "codex";

function installCheckScript(repoRoot: string): string {
  const destDir = join(repoRoot, ".know-code");
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, "check-shell.sh");
  const src = join(bundledHooksDir(), "check-shell.sh");
  if (!existsSync(src)) {
    throw new Error(`Missing bundled hook script at ${src}`);
  }
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
  // Relative path so generated agent configs are portable across machines
  return ".know-code/check-shell.sh";
}

export function installAgentHooks(
  repoRoot: string,
  agents: AgentId[],
): string[] {
  const messages: string[] = [];
  const scriptPath = installCheckScript(repoRoot);

  for (const agent of agents) {
    if (agent === "claude") {
      const dest = join(repoRoot, ".claude", "settings.json");
      mergeClaudeSettings(dest, scriptPath);
      messages.push(`Merged Claude Code hooks into ${dest}`);
    }
    if (agent === "cursor") {
      const dest = join(repoRoot, ".cursor", "hooks.json");
      mergeCursorHooks(dest, scriptPath);
      messages.push(`Merged Cursor hooks into ${dest}`);
    }
    if (agent === "codex") {
      const dest = join(repoRoot, ".codex", "hooks.json");
      mergeCodexHooks(dest, scriptPath);
      messages.push(`Merged Codex hooks into ${dest}`);
    }
  }

  return messages;
}

function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`Cannot parse JSON: ${path}`);
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function mergeClaudeSettings(destPath: string, scriptPath: string): void {
  const existing = readJsonFile(destPath);
  const hooks = (existing.hooks as Record<string, unknown>) || {};
  const pre = Array.isArray(hooks.PreToolUse)
    ? (hooks.PreToolUse as unknown[])
    : [];
  const filtered = pre.filter((e) => !JSON.stringify(e).includes("know-code"));
  filtered.push({
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command: hookCommand("claude", scriptPath),
      },
    ],
  });
  writeJson(destPath, {
    ...existing,
    hooks: { ...hooks, PreToolUse: filtered },
  });
}

function mergeCursorHooks(destPath: string, scriptPath: string): void {
  const existing = readJsonFile(destPath);
  const hooks = (existing.hooks as Record<string, unknown>) || {};
  const before = Array.isArray(hooks.beforeShellExecution)
    ? (hooks.beforeShellExecution as unknown[])
    : [];
  const filtered = before.filter(
    (e) => !JSON.stringify(e).includes("know-code"),
  );
  filtered.push({
    command: hookCommand("cursor", scriptPath),
    matcher: "git push|gh pr create|glab mr create",
  });
  writeJson(destPath, {
    version: existing.version ?? 1,
    ...existing,
    hooks: { ...hooks, beforeShellExecution: filtered },
  });
}

function mergeCodexHooks(destPath: string, scriptPath: string): void {
  const existing = readJsonFile(destPath);
  const hooks = (existing.hooks as Record<string, unknown>) || {};
  const pre = Array.isArray(hooks.PreToolUse)
    ? (hooks.PreToolUse as unknown[])
    : [];
  const filtered = pre.filter((e) => !JSON.stringify(e).includes("know-code"));
  filtered.push({
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command: hookCommand("codex", scriptPath),
      },
    ],
  });
  writeJson(destPath, {
    ...existing,
    hooks: { ...hooks, PreToolUse: filtered },
  });
}

function hookCommand(format: string, scriptPath: string): string {
  const quoted = `'${scriptPath.replace(/'/g, `'\\''`)}'`;
  return `KNOW_CODE_HOOK_FORMAT=${format} bash ${quoted}`;
}
