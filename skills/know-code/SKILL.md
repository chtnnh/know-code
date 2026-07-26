---
name: know-code
description: >-
  Gate git push and PR creation until the human passes a comprehension quiz
  about the current code changes. Use when push/PR is blocked by know-code,
  when the user asks to run know-code or verify they understand the diff, or
  before git push / gh pr create / glab mr create. Quizzes at lite, standard,
  or deep difficulty; writes a gate receipt via the know-code CLI.
compatibility: "requires git, node>=20, know-code CLI (npm i -g know-code)"
metadata:
  author: chtnnh
  version: "0.1.0"
license: MIT
---

# know-code

Block shipping until the **human** can explain the diff. You (the agent) generate and grade questions; the CLI is the only authority that opens the gate.

## When to run

- A hook or `git push` failed with `know-code: push blocked`
- User asks to verify understanding / run know-code / open the gate
- Immediately before `git push`, `gh pr create`, or `glab mr create` if status is not allowed

## Prerequisites

```bash
command -v know-code || npx --yes know-code --help
know-code status --json
```

If the CLI is missing: `npm i -g know-code` (or use `npx know-code …`).

## Workflow

Follow every step. Do **not** skip the quiz or invent a pass.

### 1. Read level and hash

```bash
know-code status --json
know-code hash --json
```

- Level comes from `.know-code/config.json` or `KNOW_CODE_LEVEL` (`lite` | `standard` | `deep`). Default: `standard`.
- If the human asks to change level for this quiz, respect that and pass `--level` to `know-code pass` later.
- Record `diffHash` from the hash command. All questions must be about **this** diff only.

### 2. Collect the diff

```bash
know-code status --json
```

From the JSON, take `commitRange` (`from..head`). Then:

```bash
git diff <from>...<head>
git log --oneline <from>..<head>
```

If `diffStat` is empty, fall back to `git show --stat HEAD` and `git show HEAD`.

### 3. Load the rubric

Read `references/levels.md` for the active level (question count, focus, pass bar).  
Optionally skim `references/question-templates.md` for prompt ideas.

### 4. Generate questions

Rules:

- Ground every question in the actual diff (cite paths).
- No trivia about unrelated code.
- Do **not** reveal answers or lead the human.
- Match count and depth to the level rubric.
- Prefer free-response over multiple choice.

### 5. Quiz the human

- Ask **one question at a time**.
- Grade each answer honestly against the diff (≥80% of questions must be solidly correct).
- On a weak answer: give **one** hint, allow **one** retry for that question, then mark it failed if still wrong.
- Do not write the gate receipt until the pass bar is met.

### 6. Open the gate

Only after a real pass:

```bash
know-code pass --level <lite|standard|deep> --hash <diffHash>
```

- `--hash` must equal the hash from step 1. If the working tree changed during the quiz, re-hash and re-quiz — do not force a pass.
- Confirm with `know-code check` (exit 0).

### 7. Resume ship

Tell the human/agent it is safe to retry `git push` / `gh pr create`.  
Optional: suggest adding commit trailer `Know-Code-Verified: <diffHash>` when CI verification is enabled.

## Hard rules

- Never call `know-code pass` because the human is in a hurry or the agent “already knows.”
- Never paste model-written answers for the human.
- Emergency bypass is human-only: `KNOW_CODE_OVERRIDE=1 git push` (logged). Do not suggest it unless they explicitly ask for a bypass.
- Teaching belongs in `know-code-teach`. This skill only verifies.

## Install (for humans)

```bash
npm i -g know-code
know-code init --level standard --agents claude,cursor,codex
npx skills add chtnnh/know-code
```

Zed and plain terminals rely on the git `pre-push` hook from `know-code init` (no agent shell hooks).
