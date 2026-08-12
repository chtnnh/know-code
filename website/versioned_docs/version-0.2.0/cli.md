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
| `know-code config [--json]` · `config set <key> <value>` | Effective settings + quiz scope |
| `know-code doctor [--json]` | Health check: attest, hooks, pipeline, port |
| `know-code attest-init [--force]` | Human: create passphrase-encrypted Ed25519 key |
| `know-code range begin\|status\|seal\|abort\|continue` | One-quiz-per-range session |
| `know-code questions [--json] [--template]` | Quiz quota + template skeleton |
| `know-code quiz validate` | Lint `quiz.json` before `ask` |
| `know-code taught [--skip]` | **Seal** teach receipt (human) |
| `know-code ask` | Browser quiz → `answers.json` |
| `know-code grade propose [--json]` | Agent: rubric context for grading |
| `know-code grade --review\|--accept` | **Seal** grade after agent proposal |
| `know-code pass [--hash <hash>]` | **Seal** gate receipt |
| `know-code status [--json]` | Gate, hash, `nextStep`, blockers |
| `know-code ship [--dry-run]` | Pre-push checklist |
| `know-code hash [--json]` | Current quiz hash |
| `know-code check` | Exit 0 allow / 2 block (hooks) |
| `know-code commit -m "…"\|-F file` | `git commit` + trailer |
| `know-code amend` | Amend with gate check + trailer |
| `know-code reset` | Clear stale `.know-code` artifacts |
| `know-code override` | Human TTY: one-shot emergency allow |
| `know-code verify` | Trailer verification (see flags below) |
| `know-code hooks install` | Install or refresh git pre-commit/pre-push hooks |
| `know-code hooks uninstall` | Remove git/agent hooks |
| `know-code skills [--global]` | Install Agent Skills |

## Typical flags

```bash
know-code init --level standard --workflow   # sets requireTrailer for CI

know-code range begin
know-code questions --template > .know-code/quiz.json
know-code quiz validate
know-code taught
know-code ask --no-open
# agent writes grade-proposal.json
know-code grade --review
know-code pass
know-code commit -m "feat: ship it"
know-code range seal
know-code range continue --yes
know-code verify --require-range-trailers
```

**Commit messages:** quote `-m "…"` or use `-F file`.

**Grading:** see [Grading](grading.md). Legacy `grade --score` requires `allowSelfScore: true`.

## Environment

| Variable | Meaning |
|----------|---------|
| `KNOW_CODE_LEVEL` | Override `level` |
| `KNOW_CODE_ATTEST_PASSPHRASE` | Non-interactive seal (never set by agents) |
| `KNOW_CODE_OVERRIDE=1` | Bypass after `know-code override` (denied in agent hooks) |

See also: [Configuration](config.md) · [Quiz](quiz.md) · [Grading](grading.md) · [CI](ci.md)
