#!/usr/bin/env bash
# Shared gate for agent shell hooks. Reads JSON on stdin (Claude/Cursor/Codex).
# Denies git push / gh pr create / glab mr create when know-code check fails.
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

should_gate() {
  local c="$1"
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

run_check() {
  if command -v know-code >/dev/null 2>&1; then
    know-code check
    return $?
  fi
  if [[ -x "node_modules/.bin/know-code" ]]; then
    "node_modules/.bin/know-code" check
    return $?
  fi
  # Monorepo / linked checkout
  if [[ -f "packages/cli/dist/index.js" ]]; then
    node "packages/cli/dist/index.js" check
    return $?
  fi
  if command -v npx >/dev/null 2>&1; then
    npx --yes know-code check
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

REASON="know-code: blocked. Run the know-code skill (/know-code), pass the quiz, then retry. Bypass: KNOW_CODE_OVERRIDE=1"

if run_check; then
  allow_json
  exit 0
fi

deny_json "$REASON"
