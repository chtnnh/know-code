---
sidebar_position: 5
title: CLI reference
---

# CLI reference

Requires Node 20+. Install the scoped package (binary is still `know-code`):

```bash
npm i -g @chtnnh/know-code
```

## Commands

| Command | Purpose |
|---------|---------|
| `know-code init` | Local config, git hooks; optional `--agents`, `--workflow` |
| `know-code config [--json]` | Effective merged settings + quiz scope |
| `know-code attest-init [--force]` | Human: create passphrase-encrypted Ed25519 key |
| `know-code range begin [--from <ref>]` | Pin merge-base; start one-quiz-per-range session |
| `know-code range status [--json]` | Active session, hash, gate, seal state |
| `know-code range seal [--rewrite]` | Finish range (`receipt` or rewrite commit messages) |
| `know-code range abort` | Clear active range session |
| `know-code questions [--json]` | Minimum quiz size for current diff (agent runs before writing quiz) |
| `know-code taught [--skip] [--hash <hash>]` | **Seal** teach receipt (human) |
| `know-code ask` | Browser quiz → `.know-code/answers.json` |
| `know-code grade --score <0-1> --hash <hash>` | **Seal** grade (≥0.8 to pass) |
| `know-code pass --level <level> --hash <hash>` | **Seal** gate receipt |
| `know-code status [--json]` | Gate, hash, scope, seals |
| `know-code hash [--json]` | Current quiz hash (index or range per [config](/config)) |
| `know-code check` | Exit 0 allow / 2 block (hooks use this) |
| `know-code commit -m "…" [--no-trailer]` | `git commit` + optional `Know-Code-Verified` trailer |
| `know-code override` | Human TTY: one-shot emergency allow file |
| `know-code verify [--require-all] [--require-range-trailers]` | Trailer verification (CI / local) |
| `know-code skills [--global]` | Install Agent Skills (project or user-global) |
| `know-code version` | Print CLI version |

## Typical flags

```bash
know-code init --level standard --base-branch main \
  --agents claude,cursor,codex --workflow --require-trailer

know-code range begin
know-code questions --json
know-code taught                    # or --skip
know-code ask --quiz .know-code/quiz.json --port 3847 --timeout 1800 --no-open
know-code grade --score 0.85 --hash "$(know-code hash)" --level standard
know-code pass --level standard --hash "$(know-code hash)"
know-code commit -m "feat: ship it"
know-code range seal --rewrite
know-code verify --require-range-trailers
```

**Commit messages:** always quote `-m "…"`. Parentheses and spaces break unquoted shells and npm scripts.

**Passphrase flags:** `attest-init`, `taught`, `grade`, `pass`, and `range seal` accept `--passphrase` or `KNOW_CODE_ATTEST_PASSPHRASE` (human terminal only; denied in agent hooks).

## Environment

| Variable | Meaning |
|----------|---------|
| `KNOW_CODE_LEVEL` | Override `level` |
| `KNOW_CODE_ATTEST_PASSPHRASE` | Non-interactive seal (never set by agents) |
| `KNOW_CODE_ATTEST_HOME` | Override `~/.know-code/attest` |
| `KNOW_CODE_HOME` | Override home config directory |
| `KNOW_CODE_OVERRIDE=1` | Bypass after `know-code override` (TTY); denied in agent hooks / CI |
| `KNOW_CODE_QUIZ_PORT` | Default quiz port |
| `KNOW_CODE_QUIZ_TIMEOUT` | Quiz wait seconds (default 1800) |

CI **does not** honor overrides — only matching trailers pass `know-code verify`.

See also: [Configuration](/config) · [How it works](/how-it-works) · [CI](/ci)
