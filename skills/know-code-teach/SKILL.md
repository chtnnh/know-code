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
  version: "0.1.2"
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

**Required order:** teach → edit → (teach deltas) → `know-code` quiz → `know-code commit` / push.

After a gate deny: teach first, then quiz, unless the human explicitly skips teaching.

## Hard rules

- Do **not** start non-trivial edits until you have taught (or the human skipped)
- Do **not** run `know-code pass`
- Do **not** quiz here (hand off to `know-code`)
- Prefer questions that invite the human to steer (“prefer A or B?”) over monologue
- If the human is already expert and asks to skip teaching, comply and stay brief
