---
sidebar_position: 4
title: Skills
---

# Skills

Two complementary skills ship in this repository under `skills/`.

## know-code-teach

Explains architecture, decisions, and trade-offs **before** edits and while coding. It never opens the gate.

Use at session start, before non-trivial work, after a gate deny (before the quiz), or when you ask the agent to catch you up.

At feature start, pair with `know-code range begin`. Skip only if you explicitly say so (“skip teach”, “just do it”). After teach or skip, the **human** seals `know-code taught`.

## know-code

Gates commit / push / PR until you pass a browser quiz. Typical agent steps:

1. Ensure `know-code range begin` is active for multi-commit work
2. Ensure the human sealed `know-code taught` for the current hash
3. Run `know-code questions --json`, write `.know-code/quiz.json`
4. Run `know-code ask`
5. Human seals `grade` (≥80%) and `pass`
6. Human runs `know-code commit -m "…"` (quote the message)
7. Human runs `know-code range seal` when the batch is done

Hard rules: quiz in the **browser**, not chat; never forge seals or set `KNOW_CODE_OVERRIDE` / `KNOW_CODE_ATTEST_PASSPHRASE` from the agent.

## Install into your harness

**Project** (committed with the repo):

```bash
know-code skills
```

**Global** (every repo — Cursor, Claude Code, Codex, …):

```bash
know-code skills --global
```

Global installs land under `~/.cursor/skills/`, `~/.claude/skills/`, `~/.codex/skills/`. List with `npx skills ls -g`.

Optional flags: `know-code skills --agents claude,cursor --yes`

This repo keeps committed copies under `.agents/skills/`. Local harness links: `npm run link-skills` (gitignored).
