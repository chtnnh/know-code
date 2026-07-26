---
sidebar_position: 3
title: Skills
---

# Skills

Two complementary skills ship in this repository under `skills/`.

## know-code-teach

Explains architecture, decisions, and trade-offs **before** edits and while coding. It never opens the gate.

Use it at session start, before non-trivial work, after a gate deny (before the quiz), or when you ask the agent to catch you up.

Skip only if you explicitly say so (“skip teach”, “just do it”).

## know-code

Gates commit / push / PR until you pass a browser quiz about the **current** staged diff. The agent:

1. Reads the level and hash  
2. Writes `.know-code/quiz.json`  
3. Runs `know-code ask`  
4. Grades `.know-code/answers.json` (≥80%)  
5. Runs `know-code pass`  
6. Commits with `know-code commit -m "…"` so the CI trailer is automatic  

Hard rule: do not quiz in the agent chat when the browser form is available.

## Install into your harness

```bash
npx skills add chtnnh/know-code
```

Or symlink `skills/know-code` and `skills/know-code-teach` into `.agents/skills/` (this repo keeps committed links).
