#!/usr/bin/env bash
# Shared gate for agent shell hooks. Reads JSON on stdin (Claude/Cursor/Codex).
# Denies git commit / push / PR creation when know-code check fails.
# Only the parsed command field is gated — never the raw stdin blob (avoids
# false positives when quiz text / heredocs mention "git commit").
#
# KNOW_CODE_OVERRIDE is NEVER honored in agent hooks — humans must use a TTY
# \`know-code override\` then KNOW_CODE_OVERRIDE=1 outside the agent.
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

# No structured command → allow (do not scan raw stdin for substrings).
if [[ -z "$CMD" ]]; then
  if [[ -n "${KNOW_CODE_HOOK_FORMAT:-}" ]]; then
    case "${KNOW_CODE_HOOK_FORMAT}" in
      cursor) echo '{"permission":"allow"}' ;;
      *) echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}' ;;
    esac
  fi
  exit 0
fi

should_gate() {
  local c="$1"
  # Align with packages/cli/src/gate-cmd.ts shouldGate() — parsed command only.
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

log_override_denied() {
  local root snippet
  root="$(resolve_root)"
  mkdir -p "$root/.know-code"
  snippet="$(printf '%s' "$CMD" | head -c 200 | tr '\n' ' ')"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) denied OVERRIDE in agent hook cmd=${snippet}" >> "$root/.know-code/override.log"
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

# Agent hooks: never honor OVERRIDE env alone.
if [[ "${KNOW_CODE_OVERRIDE:-}" == "1" ]]; then
  log_override_denied
  deny_json "know-code: OVERRIDE denied in agent hooks. Human: run know-code override on a TTY, then KNOW_CODE_OVERRIDE=1 outside the agent."
fi

REASON="know-code: blocked. Flow: know-code taught → ask → grade → pass → know-code commit. Human emergency: know-code override"

if run_check; then
  allow_json
  exit 0
fi

deny_json "$REASON"
