---
slug: /
sidebar_position: 1
title: Getting started
---

# know-code

**Your agents don’t push until you know exactly what’s changed.**

know-code is a cross-harness [Agent Skill](https://agentskills.io) plus CLI that blocks `git commit`, `git push`, and PR creation until a **human** passes a short comprehension quiz about the current diff.

## Install

```bash
# CLI (after npm publish)
npm i -g know-code

# Until publish, install from GitHub
npm i -g github:chtnnh/know-code#main:packages/cli

# In your repository
know-code init --level standard --agents claude,cursor,codex --workflow

# Skills (Claude Code, Cursor, Codex, Zed, …)
npx skills add chtnnh/know-code
```

`init --workflow` writes `.github/workflows/know-code.yml` that runs the [composite GitHub Action](/ci) on pull requests and pushes to `main`.

## First loop

1. Let the agent run **know-code-teach** before non-trivial edits (or skip explicitly).
2. Stage your changes.
3. When commit/push is blocked, the agent writes a quiz and runs `know-code ask` — answer in the **browser form**, not chat.
4. After a pass: `know-code pass` then `know-code commit -m "…"`.
5. Push. CI verifies the `Know-Code-Verified` trailer.

Docs home: [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · Source: [github.com/chtnnh/know-code](https://github.com/chtnnh/know-code)
