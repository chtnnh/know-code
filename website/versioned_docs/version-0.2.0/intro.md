---
slug: /
sidebar_position: 1
title: Getting started
---

# know-code

**Your agents don’t push until you know exactly what’s changed.**

know-code is a cross-harness [Agent Skill](https://agentskills.io) plus CLI that blocks `git commit`, `git push`, and PR creation until a **human** passes a comprehension quiz about the current diff.

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init          # once per machine
know-code skills
```

`init --workflow` writes `.github/workflows/know-code.yml` and enables `requireTrailer` for CI alignment.

## First loop (range workflow)

```text
range begin → teach → taught → questions → ask → grade propose → grade --review → pass → commit → range seal → push
```

1. `know-code range begin` at the start of feature work.
2. Agent runs **know-code-teach**; you seal `know-code taught` in your terminal.
3. Agent runs `know-code questions`, writes `.know-code/quiz.json`, **starts** `know-code ask` — **you answer in the browser**.
4. Agent writes `grade-proposal.json`; you run `know-code grade --review` and `pass`.
5. `know-code commit -m "…"` for each commit (quote the message).
6. `know-code range seal` when the batch is done; `git push`.

Stuck? `know-code status` · `know-code doctor` · [Tutorial](tutorial.md)

Docs: [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · Source: [github.com/chtnnh/know-code](https://github.com/chtnnh/know-code)
