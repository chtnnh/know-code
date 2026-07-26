---
name: know-code-teach
description: >-
  Explain architecture, decisions, and trade-offs to the human before and while
  coding so they stay oriented. Use at session start, before large edits, when
  the user asks what is being built or why, or when pairing with know-code so the
  comprehension quiz is not their first exposure. Does not open the push gate.
compatibility: "works in any agentskills.io harness"
metadata:
  author: chtnnh
  version: "0.1.0"
license: MIT
---

# know-code-teach

Teach the human what is changing and why — **before and while** you code. This skill never writes a know-code gate receipt. Verification is `know-code`.

## When to run

- Start of a non-trivial implementation session
- Before large refactors, new modules, schema/API changes
- User asks “what are you doing?”, “why this approach?”, or “catch me up”
- After know-code quiz failure — re-teach the weak areas, then re-quiz with `know-code`

## Playbook

Read `references/explain-playbook.md` and follow it. Defaults:

1. **Intent** — one sentence: problem + proposed outcome
2. **Touch map** — which areas of the codebase will change (paths/modules)
3. **Approach** — chosen design in plain language
4. **Trade-offs** — 1–3 alternatives and why not
5. **Risks** — what could go wrong; what you will verify
6. **Checkpoint** — ask if the human wants a different approach before editing

While coding, keep explanations **incremental**: after meaningful chunks, narrate what landed and what is next. No lectures. No wall of text.

## Pairing with know-code

| Skill | Role |
|-------|------|
| `know-code-teach` | Build understanding during work |
| `know-code` | Verify understanding before push/PR |

Ideal loop: teach → implement → teach deltas → `know-code` quiz → push.

## Hard rules

- Do **not** run `know-code pass`
- Do **not** quiz here (unless the human asks for a quick check — then hand off to `know-code`)
- Prefer questions that invite the human to steer (“prefer A or B?”) over monologue
- If the human is already expert and asks to skip teaching, comply and stay brief
