---
slug: /
sidebar_position: 1
title: Getting started
---

# know-code

**Your agents don't push until you know exactly what's changed.**

know-code is a cross-harness [Agent Skill](https://agentskills.io) plus CLI. It blocks `git commit`, `git push`, and PR creation until **you** — the human — pass a comprehension quiz about the code that's about to ship.

The agent does not grade itself. It teaches, writes the quiz, and proposes a score. **You** answer in the browser, review the grade, and seal the gate with your attest passphrase.

## Who does what?

| Role | Responsibility |
|------|----------------|
| **You (human)** | Install, `attest-init`, `range begin`, seal `taught` / `grade` / `pass`, answer the browser quiz, `range seal`, `git push`. Anything that needs your passphrase runs in **your** terminal — never inside the agent. |
| **Agent** | Explain the change (`know-code-teach`), write `.know-code/quiz.json`, run `know-code ask`, write `grade-proposal.json`, then **`git commit`** (plain git) for each slice after you pass. |
| **Git hooks** | Block commit/push when the gate is closed — for both you and the agent. |
| **CI** | `know-code verify` checks that shipped commits carry a grounded `Know-Code-Verified` trailer. |

**Staging:** with agent hooks (recommended), **you** run `git add` in your own terminal. Agents cannot stage — that prevents sneaking edits in after the quiz.

## Install (you, once per machine)

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init          # passphrase — only you know this
know-code skills               # install teach + gate skills into your agent
```

`init --workflow` adds `.github/workflows/know-code.yml` and sets `requireTrailer` for CI.

## The loop (range workflow)

**Range mode = one quiz for the whole batch.** You pass once; the agent lands many commits with plain `git commit`; you finish with `range seal --rewrite` so every commit gets a `Know-Code-Verified` trailer before push.

| Step | Who | What |
|------|-----|------|
| 1 | **You** | `know-code range begin` at the start of feature work |
| 2 | **Agent** | Implements + explains (`know-code-teach`) |
| 3 | **You** | `know-code taught` — seal that you were taught (passphrase) |
| 4 | **Agent** | `know-code questions` → writes `.know-code/quiz.json` → `quiz validate` |
| 5 | **Agent** | `know-code ask` — opens a **browser tab** for you |
| 6 | **You** | Answer questions in the browser (not in chat) |
| 7 | **Agent** | Writes `grade-proposal.json` from your answers |
| 8 | **You** | `know-code grade --review` then `know-code pass` (passphrase) — **gate opens** |
| 9 | **You** | `git add` each slice in your terminal |
| 10 | **Agent** | `git commit -m "…"` for each logical commit (gate stays open via range drift) |
| 11 | **You** | `know-code range seal --rewrite`, then `git push --force-with-lease` |

```text
range begin → teach → taught → quiz → pass (once)
  → [you: git add] → [agent: git commit] × N → range seal --rewrite → push
```

`know-code commit` is a convenience wrapper (adds the trailer for you). In range mode you usually use plain `git commit` and let **`range seal --rewrite`** stamp trailers on the whole batch.

Single-commit hotfix? Skip `range begin` — see [Workflows](workflows.md).

## When you're stuck

```bash
know-code status --json    # next step + blockers
know-code doctor --strict  # hooks, attest, pipeline health
```

Walk through a full example: [Tutorial](tutorial.md) · Deeper mechanics: [How it works](how-it-works.md)

Docs: [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · Source: [github.com/chtnnh/know-code](https://github.com/chtnnh/know-code)
