---
sidebar_position: 4
title: Skills
---

# Skills

Two skills ship in this repository. Install them into your agent harness so it knows the human/agent split.

## know-code-teach

**Agent** explains architecture, decisions, and trade-offs **before** edits and while coding. It never opens the gate.

When to use: session start, before non-trivial work, after a gate deny (before the quiz), or when you ask the agent to catch you up.

After the agent teaches, **you** seal receipt:

```bash
know-code taught
```

Skip only if you explicitly say so ("skip teach", "just do it") — then you still run `taught --skip` yourself.

## know-code

**Agent** runs the gate workflow; **you** own attest seals and browser answers.

| Step | Who | Action |
|------|-----|--------|
| 1 | **You** | `know-code range begin` (multi-commit batches) |
| 2 | **Agent** | Teach (or you skipped) |
| 3 | **You** | `know-code taught` |
| 4 | **Agent** | `questions` → write `quiz.json` → `quiz validate` |
| 5 | **Agent** | `know-code ask` → **you** answer in browser |
| 6 | **Agent** | Write `grade-proposal.json` |
| 7 | **You** | `grade --review` → `pass` |
| 8 | **You** | `git add` per slice |
| 9 | **Agent** | `git commit -m "…"` (plain git, gate open) |
| 10 | **You** | `range seal --rewrite` → `git push` |

Hard rules for the agent:

- Quiz answers happen in the **browser**, never in chat
- Never set `KNOW_CODE_OVERRIDE` or `KNOW_CODE_ATTEST_PASSPHRASE`
- Never forge signed artifacts (`taught`, `grade`, `pass`, `range-seal`)
- Never run `git add` (you stage in your terminal)

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

Optional: `know-code skills --agents claude,cursor --yes`

This repo keeps committed copies under `.agents/skills/`. Local harness links: `npm run link-skills` (gitignored).
