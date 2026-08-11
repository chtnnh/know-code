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
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  local git_push_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]push'
  local git_add_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]add'
  local git_implicit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]](pull|merge|cherry-pick|revert|rebase|am)'
  local git_stash_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]stash[^|;&]*(apply|pop|branch)'
  local git_reset_hard_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]reset[^|;&]*--hard'
  # Align with packages/cli/src/gate-cmd.ts shouldGate() — parsed command only.
  [[ "$c" =~ $git_commit_re ]] && return 0
  [[ "$c" =~ $git_push_re ]] && return 0
  [[ "$c" =~ $git_add_re ]] && return 0
  [[ "$c" =~ $git_implicit_re ]] && return 0
  [[ "$c" =~ $git_stash_re ]] && return 0
  [[ "$c" =~ $git_reset_hard_re ]] && return 0
  [[ "$c" =~ gh[[:space:]]+pr[[:space:]]+create ]] && return 0
  [[ "$c" =~ glab[[:space:]]+mr[[:space:]]+create ]] && return 0
  return 1
}

is_push_only_ship_cmd() {
  local git_push_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]push'
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  # Ship-only push — not compound commit && push (needs pre-commit check path).
  [[ "$1" =~ $git_push_re ]] || return 1
  [[ "$1" =~ $git_commit_re ]] && return 1
  return 0
}

compound_ship_cmd() {
  [[ "$1" =~ (\&\&|\|\||;) ]] || return 1
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  local git_push_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]push'
  [[ "$1" =~ $git_commit_re && "$1" =~ $git_push_re ]]
}

compound_add_commit() {
  [[ "$1" =~ (\&\&|\|\||;) ]] || return 1
  local git_add_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]add'
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  [[ "$1" =~ $git_add_re && "$1" =~ $git_commit_re ]]
}

git_config_env_set() {
  local k
  for k in GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_COUNT; do
    [[ -n "${!k:-}" ]] && return 0
  done
  while IFS= read -r k; do
    [[ "$k" =~ ^GIT_CONFIG_(KEY_|VALUE_) ]] && return 0
  done < <(compgen -e 2>/dev/null || true)
  return 1
}

bypasses_git_hooks() {
  local c="$1"
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  local git_push_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]push'
  [[ "$c" =~ $git_commit_re || "$c" =~ $git_push_re ]] || return 1
  # Align with gate-cmd.ts agentHookBypassesGitHooks — scan the git…commit/push span.
  local scan="$c"
  scan="$(printf '%s' "$scan" | sed -E 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')"
  [[ "$c" =~ GIT_CONFIG_(GLOBAL|SYSTEM|COUNT|KEY_|VALUE_) ]] && return 0
  [[ "$scan" =~ include\.path ]] && return 0
  [[ "$scan" =~ core\.hooksPath ]] && return 0
  [[ "$scan" =~ (^|[[:space:]])--no-verify($|[[:space:]]) ]] && return 0
  if [[ "$c" =~ $git_commit_re ]]; then
    [[ "$scan" =~ (^|[[:space:]])-n($|[[:space:]]) ]] && return 0
    [[ "$scan" =~ (^|[[:space:]])-[A-Za-z]*n[A-Za-z]*($|[[:space:]]) ]] && return 0
  fi
  return 1
}

amends_commit() {
  local c="$1"
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  [[ "$c" =~ $git_commit_re ]] || return 1
  local scan="$c"
  scan="$(printf '%s' "$scan" | sed -E 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')"
  [[ "$scan" =~ (^|[[:space:]])--amend($|[[:space:]]) ]] && return 0
  return 1
}

auto_stages_commit() {
  local c="$1"
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  [[ "$c" =~ $git_commit_re ]] || return 1
  local scan="$c"
  scan="$(printf '%s' "$scan" | sed -E 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')"
  [[ "$scan" =~ (^|[[:space:]])--all($|[[:space:]]) ]] && return 0
  [[ "$scan" =~ (^|[[:space:]])--update($|[[:space:]]) ]] && return 0
  [[ "$scan" =~ (^|[[:space:]])-[A-Za-z]*a[A-Za-z]*($|[[:space:]]) ]] && return 0
  [[ "$scan" =~ (^|[[:space:]])-[A-Za-z]*u[A-Za-z]*($|[[:space:]]) ]] && return 0
  return 1
}

commit_has_pathspec() {
  local c="$1"
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  [[ "$c" =~ $git_commit_re ]] || return 1
  local scan="$c"
  scan="$(printf '%s' "$scan" | sed -E 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')"
  # Align with gate-cmd.ts agentHookCommitHasPathspec — after `commit` only.
  local after="${scan#*commit}"
  [[ "$after" =~ (^|[[:space:]])--($|[[:space:]]) ]] && return 0
  [[ "$after" =~ (^|[[:space:]])--only= ]] && return 0
  # Bare path after options (e.g. git commit -m msg file.txt)
  printf '%s' "$after" | node -e '
    let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{
      const tokens = d.trim().split(/\s+/).filter(Boolean);
      const valueFlags = new Set(["-m","--message","-F","--file","-C","--reuse-message","-c","--reedit-message","-t","--template","--author","--date","--fixup","--squash"]);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === "--") process.exit(0);
        if (t.startsWith("-")) {
          if (valueFlags.has(t)) { i++; continue; }
          if (!t.startsWith("--") && /m/.test(t.slice(1)) && !t.includes("=")) { i++; continue; }
          if (t.startsWith("--only=")) process.exit(0);
          continue;
        }
        process.exit(0);
      }
      process.exit(1);
    });
  ' && return 0
  return 1
}

reuses_message() {
  local c="$1"
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  [[ "$c" =~ $git_commit_re ]] || return 1
  local scan="$c"
  scan="$(printf '%s' "$scan" | sed -E 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')"
  # Only flags after the commit subcommand (ignore global git -c key=val).
  local after="${scan#*commit}"
  [[ "$after" =~ (^|[[:space:]])--reuse-message(=|[[:space:]]|$) ]] && return 0
  [[ "$after" =~ (^|[[:space:]])--reedit-message(=|[[:space:]]|$) ]] && return 0
  [[ "$after" =~ (^|[[:space:]])-C(=|[[:space:]]|$) ]] && return 0
  [[ "$after" =~ (^|[[:space:]])-c(=|[[:space:]]|$) ]] && return 0
  return 1
}

commit_only() {
  local c="$1"
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  [[ "$c" =~ $git_commit_re ]] || return 1
  local scan="$c"
  scan="$(printf '%s' "$scan" | sed -E 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')"
  local after="${scan#*commit}"
  [[ "$after" =~ (^|[[:space:]])--only(=|[[:space:]]|$) ]] && return 0
  [[ "$after" =~ (^|[[:space:]])-o($|[[:space:]]) ]] && return 0
  [[ "$after" =~ (^|[[:space:]])-[A-Za-z]*o[A-Za-z]*($|[[:space:]]) ]] && return 0
  return 1
}

fixup_squash() {
  local c="$1"
  local git_commit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]commit'
  [[ "$c" =~ $git_commit_re ]] || return 1
  local scan="$c"
  scan="$(printf '%s' "$scan" | sed -E 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')"
  [[ "$scan" =~ (^|[[:space:]])--(fixup|squash)(=|[[:space:]]|$) ]] && return 0
  return 1
}

adds_files() {
  local git_add_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]add'
  [[ "$1" =~ $git_add_re ]]
}

implicit_commit() {
  local git_implicit_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]](pull|merge|cherry-pick|revert|rebase|am)'
  [[ "$1" =~ $git_implicit_re ]]
}

stash_mutate() {
  local git_stash_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]stash[^|;&]*(apply|pop|branch)'
  [[ "$1" =~ $git_stash_re ]]
}

reset_hard() {
  local git_reset_hard_re='(^|[[:space:];|&])([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*git[^|;&]*[[:space:]]reset[^|;&]*--hard'
  [[ "$1" =~ $git_reset_hard_re ]]
}

is_head_only_ship_cmd() {
  is_push_only_ship_cmd "$1" && return 0
  [[ "$1" =~ gh[[:space:]]+pr[[:space:]]+create ]] && return 0
  [[ "$1" =~ glab[[:space:]]+mr[[:space:]]+create ]] && return 0
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
  local check_args=(check)
  root="$(resolve_root)"
  cd "$root" || return 127

  # Ship commands: only HEAD trailers count — stale COMMIT_EDITMSG must not authorize.
  if is_head_only_ship_cmd "$CMD"; then
    check_args+=(--push)
  fi

  if [[ -f "$root/packages/cli/dist/index.js" ]]; then
    node "$root/packages/cli/dist/index.js" "${check_args[@]}"
    return $?
  fi
  if [[ -x "$root/node_modules/.bin/know-code" ]]; then
    "$root/node_modules/.bin/know-code" "${check_args[@]}"
    return $?
  fi
  if command -v know-code >/dev/null 2>&1; then
    know-code "${check_args[@]}"
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

if compound_ship_cmd "$CMD"; then
  deny_json "know-code: run git commit and git push as separate commands (compound ship denied in agent hooks)."
fi

if compound_add_commit "$CMD"; then
  deny_json "know-code: compound git add && git commit denied in agent hooks (TOCTOU). Stage outside the agent, then know-code commit."
fi

if git_config_env_set; then
  deny_json "know-code: GIT_CONFIG_* environment overrides denied during gated git commands."
fi

if bypasses_git_hooks "$CMD"; then
  deny_json "know-code: git commit/push hook bypass (env/config/--no-verify/-n) denied in agent hooks."
fi

if amends_commit "$CMD"; then
  deny_json "know-code: raw git commit --amend denied in agent hooks. Use: know-code amend"
fi

if auto_stages_commit "$CMD"; then
  deny_json "know-code: git commit -a/--all/-u/--update denied in agent hooks (auto-stage TOCTOU). Stage explicitly, then know-code commit."
fi

if commit_has_pathspec "$CMD"; then
  deny_json "know-code: git commit pathspecs denied in agent hooks. Stage with care outside the agent, then know-code commit -m \"…\"."
fi

if reuses_message "$CMD"; then
  deny_json "know-code: git commit -C/-c/--reuse-message/--reedit-message denied in agent hooks (stale trailer). Use: know-code commit -m \"…\""
fi

if commit_only "$CMD"; then
  deny_json "know-code: git commit --only/-o denied in agent hooks (partial tree). Stage fully, then know-code commit -m \"…\"."
fi

if fixup_squash "$CMD"; then
  deny_json "know-code: git commit --fixup/--squash denied in agent hooks. Use: know-code commit -m \"…\""
fi

if adds_files "$CMD"; then
  deny_json "know-code: raw git add denied in agent hooks. Humans stage outside the agent; agents use know-code commit after the quiz."
fi

if implicit_commit "$CMD"; then
  deny_json "know-code: git pull/merge/cherry-pick/revert/rebase/am denied in agent hooks (implicit commits). Use know-code workflow."
fi

if stash_mutate "$CMD"; then
  deny_json "know-code: git stash apply/pop/branch denied in agent hooks (reintroduces unreviewed trees)."
fi

if reset_hard "$CMD"; then
  deny_json "know-code: git reset --hard denied in agent hooks."
fi

REASON="know-code: blocked. Flow: taught → questions → ask → grade propose → grade --review → pass → commit. Human: know-code status"

if run_check; then
  allow_json
  exit 0
fi

deny_json "$REASON"
