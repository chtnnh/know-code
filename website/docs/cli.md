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
| `know-code status [--json]` | Gate status, hash, range |
| `know-code hash [--json]` | Print current index hash |
| `know-code check` | Exit 0 allow / 2 block |
| `know-code pass --level … --hash …` | Write gate receipt |
| `know-code ask` | Browser quiz UI |
| `know-code commit -m "…"` | `git commit` + `Know-Code-Verified` trailer |
| `know-code verify` | CI trailer check |

## Useful flags

```bash
know-code init --level standard --base-branch main \
  --agents claude,cursor,codex --workflow --require-trailer

know-code ask --quiz .know-code/quiz.json --port 3847 --timeout 1800
know-code commit -m "feat: …"          # preferred
know-code commit --no-trailer -m "…"   # opt out of trailer
know-code verify --require-all
```

## Environment

| Variable | Meaning |
|----------|---------|
| `KNOW_CODE_LEVEL` | Override quiz level |
| `KNOW_CODE_OVERRIDE=1` | Bypass local gate once (appends `.know-code/override.log`) |
| `KNOW_CODE_QUIZ_PORT` | Default quiz port |
| `KNOW_CODE_QUIZ_TIMEOUT` | Quiz wait seconds (default 1800) |

CI **does not** honor overrides — only matching trailers pass `know-code verify`.
