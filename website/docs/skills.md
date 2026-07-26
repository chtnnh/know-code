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

**Project** (committed with the repo / shared with the team):

```bash
know-code skills
# or: npx skills add chtnnh/know-code
```

**Global** (your user profile — available in every repo for Cursor, Claude Code, Codex, …):

```bash
know-code skills --global
# or: npx skills add chtnnh/know-code --global
```

Global installs land under harness home dirs such as `~/.cursor/skills/`, `~/.claude/skills/`, and `~/.codex/skills/`. List with `npx skills ls -g`.

You can still symlink `skills/know-code` and `skills/know-code-teach` into `.agents/skills/` manually (this repo keeps committed links).
