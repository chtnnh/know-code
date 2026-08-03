---
sidebar_position: 4
title: CLI reference
---

# CLI reference

Requires Node 20+. Install the scoped package (binary is still `know-code`):

```bash
npm i -g @chtnnh/know-code
```

| Command | Purpose |
|---------|---------|
| `know-code init` | Config, git hooks; optional `--agents`, `--workflow` |
| `know-code attest-init [--force]` | Human: passphrase-encrypted Ed25519 seal key |
| `know-code skills [--global]` | Install Agent Skills (project or user-global) |
| `know-code taught [--skip]` | **Seal** teach (or skip) for current hash |
| `know-code ask` | Browser quiz UI → `.know-code/answers.json` |
| `know-code grade --score … --hash …` | **Seal** grade (≥0.8 to open gate) |
| `know-code pass --level … --hash …` | **Seal** gate receipt |
| `know-code status [--json]` | Gate status, hash, seal validity |
| `know-code hash [--json]` | Print current index hash |
| `know-code check` | Exit 0 allow / 2 block (requires valid seal) |
| `know-code commit -m "…"` | `git commit` + `Know-Code-Verified` trailer |
| `know-code override` | Human TTY: type `OVERRIDE` for one-shot emergency allow |
| `know-code verify` | CI trailer check |

## Useful flags

```bash
know-code init --level standard --base-branch main \
  --agents claude,cursor,codex --workflow --require-trailer

know-code attest-init
know-code taught
know-code ask --quiz .know-code/quiz.json --port 3847 --timeout 1800
know-code grade --score 0.85 --hash "$(know-code hash)" --level standard
know-code pass --level standard --hash "$(know-code hash)"
know-code commit -m "feat: …"
know-code verify --require-all
```

## Environment

| Variable | Meaning |
|----------|---------|
| `KNOW_CODE_LEVEL` | Override quiz level |
| `KNOW_CODE_ATTEST_PASSPHRASE` | Non-interactive seal (never set by agents; denied in hooks) |
| `KNOW_CODE_ATTEST_HOME` | Override `~/.know-code/attest` |
| `KNOW_CODE_OVERRIDE=1` | Bypass only **after** `know-code override` (TTY); denied in agent hooks / CI |
| `KNOW_CODE_QUIZ_PORT` | Default quiz port |
| `KNOW_CODE_QUIZ_TIMEOUT` | Quiz wait seconds (default 1800) |

CI **does not** honor overrides — only matching trailers pass `know-code verify`.
