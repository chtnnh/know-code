/**
 * Shared rules for whether a shell command should hit the know-code gate.
 * Used by tests and documented as the Cursor matcher source of truth.
 * Bash check-shell.sh keeps an aligned should_gate() for the parsed command only.
 */
import { configValueBypassesHooks } from "./git-env.js";

/** Env assignments / chaining before git subcommand. */
const CMD_PREFIX =
  /(?:^|[;|&\n]\s*)(?:(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=(?:[^\s"']+|"[^"]*"|'[^']*')\s+)*/;

/**
 * JS regex for Cursor beforeShellExecution matcher (full command string).
 * Includes commit/push/PR plus implicit-commit and staging/history rewrite ops.
 */
export const CURSOR_MATCHER =
  "(?:^|[;|&\\n]\\s*)(?:(?:export\\s+)?[A-Za-z_][A-Za-z0-9_]*=(?:[^\\s\"']+|\"[^\"]*\"|'[^']*')\\s+)*(git\\b[^\\n|;&]*?\\s+(?:commit|push|add|pull|merge|cherry-pick|revert|rebase|am|stash|reset)\\b|gh\\s+pr\\s+create\\b|glab\\s+mr\\s+create\\b)";

/** `git` … `commit` with optional global flags (-c, -C, --config, etc.). */
const GIT_COMMIT_CMD = new RegExp(
  `${CMD_PREFIX.source}git\\b[^;\\n|&]*\\bcommit\\b`,
);

const GIT_PUSH_CMD = new RegExp(
  `${CMD_PREFIX.source}git\\b[^;\\n|&]*\\bpush\\b`,
);

const GIT_ADD_CMD = new RegExp(
  `${CMD_PREFIX.source}git\\b[^;\\n|&]*\\badd\\b`,
);

const GIT_IMPLICIT_COMMIT_CMD = new RegExp(
  `${CMD_PREFIX.source}git\\b[^;\\n|&]*\\b(?:pull|merge|cherry-pick|revert|rebase|am)\\b`,
);

const GIT_STASH_MUTATE_CMD = new RegExp(
  `${CMD_PREFIX.source}git\\b[^;\\n|&]*\\bstash\\b[^;\\n|&]*\\b(?:apply|pop|branch)\\b`,
);

const GIT_RESET_HARD_CMD = new RegExp(
  `${CMD_PREFIX.source}git\\b[^;\\n|&]*\\breset\\b[^;\\n|&]*(?:^|\\s)--hard\\b`,
);

const GIT_CONFIG_ENV_IN_CMD =
  /\bGIT_CONFIG_(?:GLOBAL|SYSTEM|COUNT|KEY_\d+|VALUE_\d+)\b/;

const COMPOUND_SHIP_SEP = /&&|\|\||;/;

function stripQuotedStrings(s: string): string {
  return s.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

function scanGitCommitInvocation(cmd: string): string {
  const span = cmd.match(
    /(?:^|[;|&\n]\s*)(?:(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=(?:[^\s"']+|"[^"]*"|'[^']*')\s+)*git\b[^;\n|&]*\bcommit\b[^;\n|&]*/i,
  );
  return stripQuotedStrings(span?.[0] ?? cmd);
}

function scanGitPushInvocation(cmd: string): string {
  const span = cmd.match(
    /(?:^|[;|&\n]\s*)(?:(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=(?:[^\s"']+|"[^"]*"|'[^']*')\s+)*git\b[^;\n|&]*\bpush\b[^;\n|&]*/i,
  );
  return stripQuotedStrings(span?.[0] ?? cmd);
}

/**
 * Return true if this command string is a gated git/gh/glab invocation.
 * Incidental substrings in heredocs / JSON are not gated when only the
 * parsed command field is passed (never the raw hook stdin blob).
 */
export function shouldGate(cmd: string): boolean {
  if (!cmd || !cmd.trim()) return false;
  return (
    GIT_COMMIT_CMD.test(cmd) ||
    GIT_PUSH_CMD.test(cmd) ||
    GIT_ADD_CMD.test(cmd) ||
    GIT_IMPLICIT_COMMIT_CMD.test(cmd) ||
    GIT_STASH_MUTATE_CMD.test(cmd) ||
    GIT_RESET_HARD_CMD.test(cmd) ||
    /(^|[;|&\n]\s*)gh\s+pr\s+create\b/.test(cmd) ||
    /(^|[;|&\n]\s*)glab\s+mr\s+create\b/.test(cmd)
  );
}

/** Push ship check only — not when commit is in the same compound command. */
export function isPushOnlyShipCmd(cmd: string): boolean {
  if (!GIT_PUSH_CMD.test(cmd)) return false;
  if (GIT_COMMIT_CMD.test(cmd)) return false;
  return true;
}

/** Chained commit + push must be split so each step gets the right check. */
export function isCompoundShipCommand(cmd: string): boolean {
  if (!COMPOUND_SHIP_SEP.test(cmd)) return false;
  return GIT_COMMIT_CMD.test(cmd) && GIT_PUSH_CMD.test(cmd);
}

/** `git add … && git commit` — staging happens after the agent hook check. */
export function isCompoundAddCommit(cmd: string): boolean {
  if (!COMPOUND_SHIP_SEP.test(cmd)) return false;
  return GIT_ADD_CMD.test(cmd) && GIT_COMMIT_CMD.test(cmd);
}

/** True when parsed git commit argv skips hooks. */
export function gitCommitArgsBypassHooks(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--no-verify") return true;
    if (a === "-n") return true;
    if (
      a.startsWith("-") &&
      !a.startsWith("--") &&
      /-[A-Za-z]*n[A-Za-z]*/.test(a)
    ) {
      return true;
    }
    if (a === "-c" || a === "--config") {
      const value = args[i + 1];
      if (value && configValueBypassesHooks(value)) return true;
      continue;
    }
    if (/^(-c|--config)=/i.test(a)) {
      const value = a.replace(/^(-c|--config)=/i, "");
      if (configValueBypassesHooks(value)) return true;
    }
    if (configValueBypassesHooks(a)) return true;
  }
  return false;
}

/** Auto-stage flags on know-code commit/amend argv (TOCTOU). */
export function gitCommitArgsAutoStage(args: string[]): boolean {
  for (const a of args) {
    if (a === "--all" || a === "--update") return true;
    if (a.startsWith("-") && !a.startsWith("--")) {
      if (/a/.test(a.slice(1)) || /u/.test(a.slice(1))) return true;
    }
  }
  return false;
}

/**
 * Message-reuse flags leave injectTrailer unable to refresh the trailer.
 * Includes -C/--reuse-message and -c/--reedit-message.
 */
export function gitCommitArgsReuseMessage(args: string[]): boolean {
  for (const a of args) {
    if (a === "-C" || a === "--reuse-message") return true;
    if (a === "-c" || a === "--reedit-message") return true;
    if (a.startsWith("--reuse-message=") || a.startsWith("--reedit-message=")) {
      return true;
    }
  }
  return false;
}

/** Partial-commit flags that shrink the tree vs gatedTreeOid. */
export function gitCommitArgsOnly(args: string[]): boolean {
  for (const a of args) {
    if (a === "-o" || a === "--only") return true;
    if (a.startsWith("--only=")) return true;
    if (a.startsWith("-") && !a.startsWith("--") && /o/.test(a.slice(1))) {
      // Short cluster containing o (e.g. -o) — not -m/--message.
      return true;
    }
  }
  return false;
}

/** --fixup / --squash auto-messages skip trailer injection. */
export function gitCommitArgsFixupSquash(args: string[]): boolean {
  for (const a of args) {
    if (a === "--fixup" || a === "--squash") return true;
    if (a.startsWith("--fixup=") || a.startsWith("--squash=")) return true;
  }
  return false;
}

/**
 * Commit argv includes a pathspec (`-- path` or bare path after options).
 * Pathspecs stage at commit time — TOCTOU vs agent-hook check.
 */
export function gitCommitArgsHavePathspec(args: string[]): boolean {
  if (gitCommitArgsOnly(args)) return true;
  const takesValue = new Set([
    "-m",
    "--message",
    "-F",
    "--file",
    "-C",
    "--reuse-message",
    "-c",
    "--reedit-message",
    "-t",
    "--template",
    "--author",
    "--date",
    "--fixup",
    "--squash",
    "--cleanup",
  ]);
  let afterDoubleDash = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      afterDoubleDash = true;
      continue;
    }
    if (afterDoubleDash) return true;
    if (a.startsWith("-")) {
      if (takesValue.has(a)) {
        i++;
        continue;
      }
      if (/^(-c|--config)=/i.test(a)) continue;
      if (a.startsWith("--only=")) return true;
      if (a.includes("=")) continue;
      continue;
    }
    // Bare non-option after commit options → pathspec
    return true;
  }
  return false;
}

/** Agent hooks must deny git commit/push flags/env that skip hook validation. */
export function agentHookBypassesGitHooks(cmd: string): boolean {
  const isCommit = GIT_COMMIT_CMD.test(cmd);
  const isPush = GIT_PUSH_CMD.test(cmd);
  if (!isCommit && !isPush) return false;
  if (GIT_CONFIG_ENV_IN_CMD.test(cmd)) return true;
  const scan = isCommit
    ? scanGitCommitInvocation(cmd)
    : scanGitPushInvocation(cmd);
  if (/(^|\s)--no-verify(\s|$)/.test(scan)) return true;
  if (isCommit && /(^|\s)-n(\s|$)/.test(scan)) return true;
  if (isCommit && /(^|\s)-[A-Za-z]*n[A-Za-z]*(\s|$)/.test(scan)) return true;
  if (configValueBypassesHooks(scan)) return true;
  return false;
}

/** Raw git commit --amend keeps stale trailers; use know-code amend. */
export function agentHookAmendsCommit(cmd: string): boolean {
  if (!GIT_COMMIT_CMD.test(cmd)) return false;
  const scan = scanGitCommitInvocation(cmd);
  return /(^|\s)--amend(\s|$)/.test(scan);
}

/**
 * git commit -a/--all/-u/--update auto-stages after the agent hook runs.
 */
export function agentHookAutoStagesCommit(cmd: string): boolean {
  if (!GIT_COMMIT_CMD.test(cmd)) return false;
  const scan = scanGitCommitInvocation(cmd);
  if (/(^|\s)--all(\s|$)/.test(scan)) return true;
  if (/(^|\s)--update(\s|$)/.test(scan)) return true;
  if (/(^|\s)-[A-Za-z]*a[A-Za-z]*(\s|$)/.test(scan)) return true;
  if (/(^|\s)-[A-Za-z]*u[A-Za-z]*(\s|$)/.test(scan)) return true;
  return false;
}

/** Pathspec on git commit — stages after hook check. */
export function agentHookCommitHasPathspec(cmd: string): boolean {
  if (!GIT_COMMIT_CMD.test(cmd)) return false;
  if (agentHookCommitOnly(cmd)) return true;
  const scan = scanGitCommitInvocation(cmd);
  if (/(^|\s)--(\s|$)/.test(scan)) return true;
  if (/(^|\s)--only=/.test(scan)) return true;
  const tokens = scan.split(/\s+/).filter(Boolean);
  let seenCommit = false;
  const longValueFlags = new Set([
    "-m",
    "--message",
    "-F",
    "--file",
    "-C",
    "--reuse-message",
    "-c",
    "--reedit-message",
    "-t",
    "--template",
    "--author",
    "--date",
    "--fixup",
    "--squash",
  ]);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/\bcommit\b/i.test(t)) {
      seenCommit = true;
      continue;
    }
    if (!seenCommit) continue;
    if (t.startsWith("-")) {
      if (longValueFlags.has(t)) {
        i++;
        continue;
      }
      // Short cluster containing m (e.g. -am) takes a message argument.
      if (
        !t.startsWith("--") &&
        /m/.test(t.slice(1)) &&
        !t.includes("=")
      ) {
        i++;
        continue;
      }
      continue;
    }
    return true;
  }
  return false;
}

/** Flags after the `commit` subcommand only (ignore global `git -c …`). */
function scanAfterCommitSubcommand(cmd: string): string {
  const scan = scanGitCommitInvocation(cmd);
  const m = scan.match(/\bcommit\b(.*)$/i);
  return m?.[1] ?? "";
}

/** -C/-c / --reuse-message / --reedit-message copy a stale trailer. */
export function agentHookReusesMessage(cmd: string): boolean {
  if (!GIT_COMMIT_CMD.test(cmd)) return false;
  // Only scan argv after `commit` — global `git -c key=val` must not match.
  const after = scanAfterCommitSubcommand(cmd);
  if (/(^|\s)--reuse-message(=|\s|$)/.test(after)) return true;
  if (/(^|\s)--reedit-message(=|\s|$)/.test(after)) return true;
  if (/(^|\s)-C(\s|=|$)/.test(after)) return true;
  if (/(^|\s)-c(\s|=|$)/.test(after)) return true;
  return false;
}

/** --only / -o partial commits shrink the tree vs gatedTreeOid. */
export function agentHookCommitOnly(cmd: string): boolean {
  if (!GIT_COMMIT_CMD.test(cmd)) return false;
  const scan = scanGitCommitInvocation(cmd);
  if (/(^|\s)--only(=|\s|$)/.test(scan)) return true;
  if (/(^|\s)-o(\s|$)/.test(scan)) return true;
  if (/(^|\s)-[A-Za-z]*o[A-Za-z]*(\s|$)/.test(scan)) return true;
  return false;
}

/** --fixup / --squash auto-message commits without know-code trailers. */
export function agentHookFixupSquash(cmd: string): boolean {
  if (!GIT_COMMIT_CMD.test(cmd)) return false;
  const scan = scanGitCommitInvocation(cmd);
  return /(^|\s)--(?:fixup|squash)(=|\s|$)/.test(scan);
}

/** Raw git add in agent context — stage unreviewed work. */
export function agentHookAddsFiles(cmd: string): boolean {
  return GIT_ADD_CMD.test(cmd);
}

/** Implicit commit-creating git ops. */
export function agentHookImplicitCommit(cmd: string): boolean {
  return GIT_IMPLICIT_COMMIT_CMD.test(cmd);
}

/** stash apply/pop/branch reintroduces unreviewed trees. */
export function agentHookStashMutate(cmd: string): boolean {
  return GIT_STASH_MUTATE_CMD.test(cmd);
}

/** reset --hard rewrites working tree outside the quiz. */
export function agentHookResetHard(cmd: string): boolean {
  return GIT_RESET_HARD_CMD.test(cmd);
}
