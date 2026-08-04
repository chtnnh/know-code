---
name: know-code
description: >-
  Gate git commit, git push, and PR creation until the human passes a
  comprehension quiz about the current code changes. Use when commit/push/PR is
  blocked by know-code, when the user asks to run know-code or verify they
  understand the diff, or before shipping. Start with know-code range begin for
  multi-commit work. Run know-code questions before writing the quiz. Agent
  proposes grades; human reviews and attests grade/pass.
metadata:
  author: chtnnh
  version: "0.2.0"
license: MIT
---

# know-code

Read `references/question-templates.md`, `references/levels.md`, and `references/grading-rubric.md` before quizzing or grading.

## Flow (range — one quiz per feature branch)

```text
attest-init (once) → range begin → teach → taught (human seal)
  → questions → quiz validate → ask → grade propose (agent) → grade --review (human) → pass (human)
  → commit → range seal → push
```

### 0. Range + attest

```bash
know-code attest-init          # human, once per machine
know-code range begin          # pin merge-base — quiz covers all commits until seal
know-code range status         # check active session
```

### 1. Teach + seal

Run **know-code-teach**, then human:

```bash
know-code taught
```

Re-seal `taught` when the diff hash changes.

### 2. Question quota (agent)

```bash
know-code questions --json
know-code questions --template   # starter quiz.json skeleton
know-code quiz validate
```

Write **exactly** `minQuestions` entries in `.know-code/quiz.json` (see [quiz docs](https://kc.chtnnhfoundation.org/docs/quiz)).

### 3. Quiz

Agent starts the server; **human answers in the browser** (not chat):

```bash
know-code ask --quiz .know-code/quiz.json
know-code ask --no-open        # SSH / headless
```

### 4. Agent grading proposal

After `ask`, read `.know-code/answers.json` and write `.know-code/grade-proposal.json`:

```bash
know-code grade propose --json   # rubric context
```

Follow `references/grading-rubric.md`. **Never** run `grade --score` or `pass`.

### 5. Human review + seal

```bash
know-code grade --review
know-code pass
```

### 6. Commit + range seal

```bash
know-code commit -m "<message>"   # or -F file; always adds trailer
know-code range seal              # optional: --rewrite (force-push)
```

Gated by hooks: `git commit`, `git push`, `gh pr create`, `glab mr create`.

## Debugging

```bash
know-code status --json
know-code doctor
```

## Hard rules

- Run **`know-code questions`** before writing the quiz
- Agent writes **`grade-proposal.json`**; human runs **`grade --review`**
- Never forge seals or set `KNOW_CODE_ATTEST_PASSPHRASE` / `KNOW_CODE_OVERRIDE` from the agent
- Quiz in the **browser**, not chat
- 2+ commits before push → use **`range begin`**

Docs: https://kc.chtnnhfoundation.org
