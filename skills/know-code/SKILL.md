---
name: know-code
description: >-
  Gate git commit, git push, and PR creation until the human passes a
  comprehension quiz about the current code changes. Use when commit/push/PR is
  blocked by know-code, when the user asks to run know-code or verify they
  understand the diff, or before git commit / git push / gh pr create / glab mr
  create. Always run know-code-teach first unless the human explicitly skips
  teaching. Quizzes via a browser form with dedicated answer fields; writes a
  gate receipt via the know-code CLI.
compatibility: "requires git, node>=20, know-code CLI; browser preferred for quiz UI"
metadata:
  author: chtnnh
  version: "0.1.2"
license: MIT
---

# know-code

Block committing and shipping until the **human** can explain the diff. You generate questions; the human answers in a **browser form** (dedicated textboxes); you grade; the CLI opens the gate.

## When to run

- A hook failed with `know-code: commit/push blocked`
- User asks to verify understanding / run know-code / open the gate
- Immediately before `git commit`, `git push`, `gh pr create`, or `glab mr create` if status is not allowed

## Prerequisites

```bash
command -v know-code || npx --yes know-code --help
know-code status --json
```

## Workflow

Follow every step. Do **not** skip the quiz or invent a pass.

### 0. Teach first (required)

**Before** writing `quiz.json` or running `know-code ask`, run **know-code-teach** on the current staged/index diff (intent, touch map, approach, trade-offs, risks).

Skip teaching only if the human explicitly says so (e.g. “skip teach”, “I already know this”, “ready to quiz” after a teach session in the same turn).  
If the human says they don’t know the repo / want a catch-up, you **must** teach before quizzing — even if they also said they want the quiz.

Do not open the gate during teaching.

### 1. Read level and hash

```bash
know-code status --json
know-code hash --json
```

- Level: `.know-code/config.json` or `KNOW_CODE_LEVEL` (`lite` | `standard` | `deep`).
- Record `diffHash`. Stage intended changes before quizzing (hash covers the **index**).

### 2. Collect the diff

Use status/`git diff <from> $(git write-tree)` / `git diff --cached` so questions are grounded in the real patch.

### 3. Load the rubric

Read `references/levels.md` (and optionally `references/question-templates.md`).

### 4. Write the quiz file

Create `.know-code/quiz.json` (do **not** ask questions in the agent chat):

```json
{
  "diffHash": "<from know-code hash>",
  "level": "standard",
  "title": "know-code quiz",
  "questions": [
    { "id": "q1", "prompt": "…" },
    { "id": "q2", "prompt": "…" }
  ]
}
```

Rules for prompts: grounded in the diff, cite paths, no leading, free-response, count/depth per level.

### 5. Open the browser quiz UI (required when a browser exists)

```bash
know-code ask --quiz .know-code/quiz.json
```

This opens a local page with **one textarea per question**. Tell the human:

> Answer in the browser form that just opened — not in this chat.

Wait for the command to finish. It writes `.know-code/answers.json` and prints JSON.

**Fallback (headless / no browser only):** if `know-code ask` cannot open a UI, say so once and collect answers in chat. Never use chat answers when the browser UI is available.

### 6. Grade

Read `.know-code/answers.json`. Grade honestly against the diff (≥80% solidly correct).  
Weak answers: you may rewrite only those prompts in `quiz.json` and re-run `know-code ask` once for retries — or fail the quiz. After a fail, offer **know-code-teach** on the weak spots before re-quizzing.

### 7. Open the gate

Only after a real pass:

```bash
know-code pass --level <lite|standard|deep> --hash <diffHash>
know-code check
```

### 8. Resume ship

Safe to retry `git commit` / `git push` / `gh pr create`.  
If `requireTrailer` is true, include `Know-Code-Verified: <diffHash>` on the commit.

## Hard rules

- **Teach before quiz** unless the human explicitly skips teaching.
- **Do not quiz in the agent prompt box** when `know-code ask` can run.
- Never call `know-code pass` without a real graded pass.
- Never paste model-written answers for the human.
- Bypass is human-only: `KNOW_CODE_OVERRIDE=1`.
- Teaching belongs in `know-code-teach` (this skill only verifies).

## Install

```bash
npm i -g know-code
know-code init --level standard --agents claude,cursor,codex
npx skills add chtnnh/know-code
```

Zed/terminal: git `pre-commit` / `pre-push` still enforce; quiz UI still opens in the system browser when the skill runs `know-code ask`.
