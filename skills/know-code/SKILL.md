---
name: know-code
description: >-
  Gate git commit, git push, and PR creation until the human passes a
  comprehension quiz about the current code changes. Use when commit/push/PR is
  blocked by know-code, when the user asks to run know-code or verify they
  understand the diff, or before shipping. Always ensure know-code-teach ran
  before the work (and before the quiz) unless the human skipped teaching.
  Quizzes via browser form; open the gate; commit with know-code commit so the
  Know-Code-Verified trailer is added automatically.
compatibility: "requires git, node>=20, know-code CLI; browser preferred for quiz UI"
metadata:
  author: chtnnh
  version: "0.1.4"
license: MIT
---

# know-code

Block committing and shipping until the **human** can explain the diff. You generate questions; the human answers in a **browser form**; you grade; the CLI opens the gate. Commits go through **`know-code commit`** so the CI trailer is added without the human asking.

## When to run

- A hook failed with `know-code: commit/push blocked`
- User asks to verify understanding / run know-code / open the gate
- Immediately before shipping if status is not allowed

## Prerequisites

```bash
command -v know-code || npx --yes know-code --help
know-code status --json
```

## Workflow

Follow every step. Do **not** skip the quiz or invent a pass.

### 0. Teach first (required)

**Before** writing `quiz.json` or running `know-code ask`, run **know-code-teach** on the current staged/index diff.

Also: **know-code-teach must have run before the edits themselves** (see that skill). If you edited without teaching, teach the landed diff now before quizzing.

Skip teaching only if the human explicitly skips. Do not open the gate during teaching.

### 1. Read level and hash

```bash
know-code status --json
know-code hash --json
```

Stage intended changes before quizzing (hash covers the **index**).

### 2–3. Diff + rubric

Ground questions in the real patch. Load `references/levels.md`.

### 4. Write `.know-code/quiz.json`

Do **not** ask questions in the agent chat. Free-response, cite paths, match level depth.

### 5. Browser quiz

```bash
know-code ask --quiz .know-code/quiz.json
```

> Answer in the browser form — not in this chat.

### 6. Grade

Read `.know-code/answers.json`. ≥80% required. On fail, re-teach weak spots then re-quiz.

### 7. Open the gate

```bash
know-code pass --level <lite|standard|deep> --hash <diffHash>
know-code check
```

### 8. Commit with trailer (always — do not wait for the human to ask)

When the human wants the work committed (or after a pass when shipping is the goal), **always** commit via:

```bash
know-code commit -m "<message>"
```

This runs the gate check and appends:

```text
Know-Code-Verified: <diffHash>
```

Do **not** use bare `git commit` for know-code-gated work unless the human explicitly requests no trailer (`know-code commit --no-trailer` or they refuse CI trailers).

Then push when asked / when shipping.

## Hard rules

- **Teach before edits** (know-code-teach) and **teach before quiz** unless skipped.
- **Do not quiz in the agent prompt box** when `know-code ask` can run.
- Never call `know-code pass` without a real graded pass.
- **Always use `know-code commit -m "..."`** so the trailer is included without the human requesting it.
- Bypass is human-only: `KNOW_CODE_OVERRIDE=1`.

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
npx skills add chtnnh/know-code
```

Docs: https://kc.chtnnhfoundation.org
