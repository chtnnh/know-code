---
sidebar_position: 6
title: Levels
---

# Levels

Quiz depth is set at `init` or in config. The **agent** must write at least `minQuestions` for the active level (from `know-code questions`).

| Level | Questions | Focus |
|-------|-----------|-------|
| `lite` | 2–3 | What changed |
| `standard` | 4–6 | Architecture + trade-offs (default) |
| `deep` | 7–10 | Failure modes, security, migrations |

```bash
know-code init --level deep
# or
export KNOW_CODE_LEVEL=lite
```

Pass bar is **≥80%** solidly correct answers relative to the real diff. Vague hand-waving fails even if keywords match.
