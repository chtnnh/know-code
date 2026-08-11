import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CURSOR_MATCHER } from "./gate-cmd.js";
import { gitHooksDir, findGitRoot } from "./paths.js";

export { CURSOR_MATCHER } from "./gate-cmd.js";

const HOOK_MARKER = "# know-code gate";

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

/** Shared body for git pre-commit and pre-push. */
export function gitGateHookScript(): string {
  return `#!/usr/bin/env bash
${HOOK_MARKER}
# Blocks commit/push unless know-code check passes.
# Prefer repo-local CLI (monorepo dev) over global know-code on PATH.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
# Never honor KNOW_CODE_COMMIT from the environment. Pre-commit requireTrailer
# is satisfied by a grounded Know-Code-Verified trailer in COMMIT_EDITMSG.
# Pre-push passes --push so only HEAD trailers count (stale EDITMSG ignored).
unset KNOW_CODE_COMMIT || true

CHECK_ARGS=()
if [[ "$(basename "$0")" == "pre-push" ]]; then
  CHECK_ARGS+=(--push)
fi

run_check() {
  # Bash 3.2 + set -u: empty "\${arr[@]}" is "unbound variable" — branch on length.
  if [[ \${#CHECK_ARGS[@]} -gt 0 ]]; then
    if [[ -f "$ROOT/packages/cli/dist/index.js" ]]; then
      node "$ROOT/packages/cli/dist/index.js" check "\${CHECK_ARGS[@]}"
      return $?
    fi
    if [[ -x "$ROOT/node_modules/.bin/know-code" ]]; then
      "$ROOT/node_modules/.bin/know-code" check "\${CHECK_ARGS[@]}"
      return $?
    fi
    if command -v know-code >/dev/null 2>&1; then
      know-code check "\${CHECK_ARGS[@]}"
      return $?
    fi
    if command -v npx >/dev/null 2>&1; then
      npx --yes know-code check "\${CHECK_ARGS[@]}"
      return $?
    fi
  else
    if [[ -f "$ROOT/packages/cli/dist/index.js" ]]; then
      node "$ROOT/packages/cli/dist/index.js" check
      return $?
    fi
    if [[ -x "$ROOT/node_modules/.bin/know-code" ]]; then
      "$ROOT/node_modules/.bin/know-code" check
      return $?
    fi
    if command -v know-code >/dev/null 2>&1; then
      know-code check
      return $?
    fi
    if command -v npx >/dev/null 2>&1; then
      npx --yes know-code check
      return $?
    fi
  fi
  return 127
}

rc=0
run_check || rc=$?

if [[ $rc -eq 0 ]]; then
  exit 0
fi

if [[ $rc -eq 127 ]]; then
  echo "know-code: CLI not found. Install with: npm i -g @chtnnh/know-code" >&2
  echo "know-code: emergency: know-code override && KNOW_CODE_OVERRIDE=1 …" >&2
  exit 1
fi

# check ran and denied (stderr already has reason + next step)
exit "$rc"
`;
}

/** True when an on-disk hook matches the current generated script. */
export function gitGateHookIsCurrent(content: string): boolean {
  if (!content.includes(HOOK_MARKER)) return false;
  return (
    content.includes("run_check || rc=$?") &&
    content.includes("unset KNOW_CODE_COMMIT") &&
    content.includes("--push") &&
    // 0.3.0: empty CHECK_ARGS under bash 3.2 + set -u
    content.includes("${#CHECK_ARGS[@]}")
  );
}

export function gitHooksNeedUpgrade(repoRoot: string): boolean {
  for (const name of ["pre-commit", "pre-push"] as const) {
    const hookPath = join(gitHooksDir(repoRoot), name);
    if (!existsSync(hookPath)) return true;
    const content = readFileSync(hookPath, "utf8");
    if (!gitGateHookIsCurrent(content)) return true;
  }
  return false;
}

export function installGitHooks(repoRoot: string): {
  preCommit: ReturnType<typeof installGitHook>;
  prePush: ReturnType<typeof installGitHook>;
} {
  return {
    preCommit: installGitHook(repoRoot, "pre-commit"),
    prePush: installGitHook(repoRoot, "pre-push"),
  };
}

export function cmdHooksInstall(): void {
  const repoRoot = findGitRoot();
  const { preCommit, prePush } = installGitHooks(repoRoot);
  for (const hook of [preCommit, prePush]) {
    const label = hook.path.endsWith("pre-commit") ? "pre-commit" : "pre-push";
    console.log(
      hook.created
        ? `Installed git ${label} hook → ${hook.path}`
        : `Updated git ${label} hook → ${hook.path}`,
    );
    if (hook.backedUp) {
      console.log(`Backed up previous hook → ${hook.backedUp}`);
    }
  }
}

function installGitHook(
  repoRoot: string,
  name: "pre-commit" | "pre-push",
): { path: string; created: boolean; backedUp?: string } {
  const hooksDir = gitHooksDir(repoRoot);
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, name);
  const script = gitGateHookScript();

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf8");
    if (existing.includes(HOOK_MARKER) || existing.includes("# know-code pre-push")) {
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

export function installGitPrePush(repoRoot: string) {
  return installGitHook(repoRoot, "pre-push");
}

export function installGitPreCommit(repoRoot: string) {
  return installGitHook(repoRoot, "pre-commit");
}

export type AgentId = "claude" | "cursor" | "codex";

function installCheckScript(repoRoot: string): string {
  const committed = join(repoRoot, "hooks", "check-shell.sh");
  if (existsSync(committed)) {
    chmodSync(committed, 0o755);
    return "hooks/check-shell.sh";
  }

  const destDir = join(repoRoot, ".know-code");
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, "check-shell.sh");
  const src = join(bundledHooksDir(), "check-shell.sh");
  if (!existsSync(src)) {
    throw new Error(`Missing bundled hook script at ${src}`);
  }
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
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
    matcher: CURSOR_MATCHER,
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

export function uninstallGitHooks(repoRoot: string): void {
  for (const name of ["pre-commit", "pre-push"] as const) {
    const hookPath = join(gitHooksDir(repoRoot), name);
    if (!existsSync(hookPath)) continue;
    const content = readFileSync(hookPath, "utf8");
    if (!content.includes(HOOK_MARKER)) continue;
    const backup = `${hookPath}.know-code-backup`;
    if (existsSync(backup)) {
      copyFileSync(backup, hookPath);
      chmodSync(hookPath, 0o755);
    } else {
      unlinkSync(hookPath);
    }
  }
}

export function uninstallAgentHooks(
  repoRoot: string,
  agents: AgentId[],
): void {
  for (const agent of agents) {
    if (agent === "claude") {
      const dest = join(repoRoot, ".claude", "settings.json");
      if (!existsSync(dest)) continue;
      const existing = readJsonFile(dest);
      const hooks = (existing.hooks as Record<string, unknown>) || {};
      const pre = Array.isArray(hooks.PreToolUse)
        ? (hooks.PreToolUse as unknown[]).filter(
            (e) => !JSON.stringify(e).includes("know-code"),
          )
        : [];
      writeJson(dest, { ...existing, hooks: { ...hooks, PreToolUse: pre } });
    }
    if (agent === "cursor") {
      const dest = join(repoRoot, ".cursor", "hooks.json");
      if (!existsSync(dest)) continue;
      const existing = readJsonFile(dest);
      const hooks = (existing.hooks as Record<string, unknown>) || {};
      const before = Array.isArray(hooks.beforeShellExecution)
        ? (hooks.beforeShellExecution as unknown[]).filter(
            (e) => !JSON.stringify(e).includes("know-code"),
          )
        : [];
      writeJson(dest, {
        ...existing,
        hooks: { ...hooks, beforeShellExecution: before },
      });
    }
    if (agent === "codex") {
      const dest = join(repoRoot, ".codex", "hooks.json");
      if (!existsSync(dest)) continue;
      const existing = readJsonFile(dest);
      const hooks = (existing.hooks as Record<string, unknown>) || {};
      const pre = Array.isArray(hooks.PreToolUse)
        ? (hooks.PreToolUse as unknown[]).filter(
            (e) => !JSON.stringify(e).includes("know-code"),
          )
        : [];
      writeJson(dest, { ...existing, hooks: { ...hooks, PreToolUse: pre } });
    }
  }
}
