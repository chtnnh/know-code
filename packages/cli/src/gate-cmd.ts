/**
 * Shared rules for whether a shell command should hit the know-code gate.
 * Used by tests and documented as the Cursor matcher source of truth.
 * Bash check-shell.sh keeps an aligned should_gate() for the parsed command only.
 */

/** JS regex for Cursor beforeShellExecution matcher (full command string). */
export const CURSOR_MATCHER =
  "(^|[;|&\\n]\\s*)(git\\s+(commit|push)\\b|gh\\s+pr\\s+create\\b|glab\\s+mr\\s+create\\b)";

/**
 * Return true if this command string is a gated git/gh/glab invocation.
 * Incidental substrings in heredocs / JSON are not gated when only the
 * parsed command field is passed (never the raw hook stdin blob).
 */
export function shouldGate(cmd: string): boolean {
  if (!cmd || !cmd.trim()) return false;
  // Require a real invocation: git commit|push, gh pr create, glab mr create
  // with whitespace between tokens (not "gitcommit" or prose mentioning the words).
  return (
    /(^|[;|&\n]\s*)git\s+commit\b/.test(cmd) ||
    /(^|[;|&\n]\s*)git\s+push\b/.test(cmd) ||
    /(^|[;|&\n]\s*)gh\s+pr\s+create\b/.test(cmd) ||
    /(^|[;|&\n]\s*)glab\s+mr\s+create\b/.test(cmd)
  );
}
