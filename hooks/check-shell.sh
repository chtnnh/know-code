#!/usr/bin/env bash
# Shared gate for agent shell hooks. Reads JSON on stdin (Claude/Cursor/Codex).
# Denies git commit / push / PR creation when know-code check fails.
set -euo pipefail

INPUT="$(cat || true)"

CMD="$(
  printf '%s' "$INPUT" | node -e '
    let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{
      try {
        const j=JSON.parse(d||"{}");
        const cmd = j.tool_input?.command || j.command || j.tool_input?.cmd || "";
        process.stdout.write(String(cmd));
      } catch { process.stdout.write(""); }
    });
  ' 2>/dev/null || true
)"

# If Cursor matches the outer agent shell string but stdin has no command field,
# fall back to scanning the raw stdin / env for gated verbs.
if [[ -z "$CMD" ]]; then
  CMD="$INPUT"
fi

should_gate() {
  local c="$1"
  [[ "$c" =~ git[[:space:]]+commit ]] && return 0
  [[ "$c" =~ git[[:space:]]+push ]] && return 0
  [[ "$c" =~ gh[[:space:]]+pr[[:space:]]+create ]] && return 0
  [[ "$c" =~ glab[[:space:]]+mr[[:space:]]+create ]] && return 0
  return 1
}

allow_json() {
  case "${KNOW_CODE_HOOK_FORMAT:-claude}" in
    cursor) echo '{"permission":"allow"}' ;;
    *) echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}' ;;
  esac
}

deny_json() {
  local REASON="$1"
  case "${KNOW_CODE_HOOK_FORMAT:-claude}" in
    cursor)
      printf '{"permission":"deny","user_message":%s}\n' "$(node -e "console.log(JSON.stringify(process.argv[1]))" "$REASON")"
      exit 0
      ;;
    *)
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' \
        "$(node -e "console.log(JSON.stringify(process.argv[1]))" "$REASON")"
      echo "$REASON" >&2
      exit 2
      ;;
  esac
}

resolve_root() {
  local script_dir root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$script_dir/../packages/cli/dist/index.js" ]]; then
    cd "$script_dir/.." && pwd
    return
  fi
  if root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
    printf '%s\n' "$root"
    return
  fi
  pwd
}

run_check() {
  local root
  root="$(resolve_root)"
  cd "$root" || return 127

  if [[ -f "$root/packages/cli/dist/index.js" ]]; then
    node "$root/packages/cli/dist/index.js" check
    return $?
  fi
  if [[ -x "$root/node_modules/.bin/know-code" ]]; then
    "$root/node_modules/.bin/know-code" check
    return $?
  fi
  if command -v know-code >/dev/null 2>&1; then
    know-code check
    return $?
  fi
  return 127
}

if ! should_gate "$CMD"; then
  if [[ -n "${KNOW_CODE_HOOK_FORMAT:-}" ]]; then
    allow_json
  fi
  exit 0
fi

if [[ "${KNOW_CODE_OVERRIDE:-}" == "1" ]]; then
  allow_json
  exit 0
fi

REASON="know-code: blocked. Run know-code-teach first (unless skipped), then /know-code browser quiz, then retry. Bypass: KNOW_CODE_OVERRIDE=1"

if run_check; then
  allow_json
  exit 0
fi

deny_json "$REASON"
