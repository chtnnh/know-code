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
# CLI (scoped package; bin is still `know-code`)
npm i -g @chtnnh/know-code

# Or from GitHub
npm i -g github:chtnnh/know-code#main:packages/cli

# In your repository
know-code init --level standard --agents claude,cursor,codex --workflow

# Skills — this project, or every repo (--global)
know-code skills
know-code skills --global
```

`init --workflow` writes `.github/workflows/know-code.yml` that runs the [composite GitHub Action](/ci) on pull requests and pushes to `main`.

## First loop

1. Run `know-code attest-init` once (your passphrase seals taught/grade/pass).
2. Let the agent run **know-code-teach**, then seal `know-code taught` in your terminal.
3. Stage your changes. When blocked, answer `know-code ask` in the **browser**.
4. Seal `know-code grade` and `know-code pass` yourself, then `know-code commit -m "…"`.
5. Push. CI verifies the `Know-Code-Verified` trailer.

Unsigned/forged receipts never open the gate. Hooks gate shell commit/push/PR only — not edit tools.

Docs home: [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · Source: [github.com/chtnnh/know-code](https://github.com/chtnnh/know-code)
