---
name: know-code
description: >-
  Gate git commit, git push, and PR creation until the human passes a
  comprehension quiz about the current code changes. Use when commit/push/PR is
  blocked by know-code, when the user asks to run know-code or verify they
  understand the diff, or before shipping. Start with know-code range begin for
  multi-commit work. Run know-code questions before writing the quiz. Human
  seals taught/grade/pass with attest passphrase.
metadata:
  author: chtnnh
  version: "0.1.4"
license: MIT
---

# know-code

## Flow (range — one quiz per feature branch)

```text
attest-init (once) → range begin → teach → taught (human seal)
  → questions → quiz.json → ask → grade (human) → pass (human) → range seal → push
```

### 0. Range + attest

```bash
know-code attest-init          # human, once per machine
know-code range begin          # pin merge-base — quiz covers all commits until seal
```

### 1. Teach + seal

Run **know-code-teach**, then human:

```bash
know-code taught
```

### 2. Question quota (agent)

```bash
know-code questions --json
```

Write **exactly** `minQuestions` entries in `.know-code/quiz.json` for `know-code hash`.

### 3. Quiz

```bash
know-code ask --quiz .know-code/quiz.json
```

### 4. Human seals

```bash
know-code grade --score 0.85 --hash "$(know-code hash)"
know-code pass --level standard --hash "$(know-code hash)"
know-code range seal           # optional: --rewrite for trailers on every commit
```

### 5. Commit

```bash
know-code commit -m "<message>"
```

## Hard rules

- Run **`know-code questions`** before writing the quiz
- Never forge seals or set `KNOW_CODE_ATTEST_PASSPHRASE` / `KNOW_CODE_OVERRIDE` from the agent
- Quiz in the **browser**, not chat

Docs: https://kc.chtnnhfoundation.org
