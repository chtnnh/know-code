---
name: know-code-teach
description: >-
  Explain architecture, decisions, and trade-offs to the human BEFORE making
  code edits and while coding. Use at session start, before any non-trivial
  implementation or refactor, when the user asks what is being built or why,
  after a know-code gate deny (before the quiz), or when the human is unfamiliar
  with the area. Does not open the gate.
compatibility: "works in any agentskills.io harness"
metadata:
  author: chtnnh
  version: "0.2.0"
license: MIT
---

# know-code-teach

Teach the human what is changing and why — **before you edit files**, then keep teaching in small increments while you code. This skill never writes a know-code gate receipt. Verification is `know-code`.

## When to run (required)

Run this skill **before** you create or modify project files for any non-trivial task:

- New features, refactors, bug fixes that touch more than a one-liner
- Session start on an unfamiliar codebase / area
- After a know-code gate deny (before `know-code` quiz)
- After a quiz failure (re-teach weak spots)
- User asks “what are you doing?”, “why this approach?”, or “catch me up”

Skip only if the human explicitly says so (“skip teach”, “just do it”, “I know this”).

## Playbook

Read `references/explain-playbook.md` and follow it. Defaults:

1. **Intent** — one sentence: problem + proposed outcome
2. **Touch map** — which areas of the codebase will change (paths/modules)
3. **Approach** — chosen design in plain language
4. **Trade-offs** — 1–3 alternatives and why not
5. **Risks** — what could go wrong; what you will verify
6. **Checkpoint** — ask if the human wants a different approach **before editing**

While coding, keep explanations **incremental**: after meaningful chunks, narrate what landed and what is next. No lectures. No wall of text.

## Pairing with know-code

| Skill | Role |
|-------|------|
| `know-code-teach` | Build understanding **before/during** work |
| `know-code` | Verify understanding before commit/push/PR |

**Required order:** `range begin` → teach → human seals `know-code taught` → edit → (teach deltas) → `questions` → quiz → ask → agent `grade-proposal.json` → human `grade --review` → `pass` → `know-code commit` → `range seal` / push.

Re-seal **`know-code taught`** when the diff hash changes (`know-code hash`).

After teaching (or an explicit human skip), the **human** seals the artifact (passphrase; agents cannot forge):

```bash
know-code taught
# or, only if the human explicitly skipped:
know-code taught --skip
```

Ask the human to run that in their terminal if you cannot obtain a TTY seal. Stage intended changes before sealing — receipts are keyed to the current quiz hash (`know-code hash` / `know-code config --json`).

After a gate deny: teach first, then quiz, unless the human explicitly skips teaching.

## Hard rules

- Do **not** start non-trivial edits until you have taught (or the human skipped)
- After teach/skip, run **`know-code taught`** (or `taught --skip`) before handing off to quiz/`pass`
- Do **not** run `know-code pass` or `know-code grade`
- Do **not** quiz here (hand off to `know-code`)
- Prefer questions that invite the human to steer (“prefer A or B?”) over monologue
- If the human is already expert and asks to skip teaching, comply, stay brief, and run `know-code taught --skip`
