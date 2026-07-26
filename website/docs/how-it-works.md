---
sidebar_position: 2
title: How it works
---

# How it works

```text
teach (before edits) → implement → hook deny?
                ↓
          know-code-teach (unless skipped) → quiz.json → know-code ask
                ↓
          grade → know-code pass → know-code commit -m "…" → push → CI
```

## Layers

1. **Skills** — the host agent explains the design (`know-code-teach`) and later quizzes you (`know-code`).
2. **Browser quiz** — `know-code ask` opens a local form with one textarea per answer.
3. **Receipt** — `know-code pass` writes `.know-code/gate.json` keyed to a content hash of the index (empty tree → staged tree).
4. **Git hooks** — `pre-commit` / `pre-push` run `know-code check`.
5. **Agent hooks** — Claude / Cursor / Codex deny gated shell commands until the receipt matches.
6. **CI** — verifies `Know-Code-Verified: <hash>` on the commit (HEAD trailer first).

## Hash model

The hash is SHA-256 of the patch from Git’s empty tree to the **current index**. Using a fixed floor (not merge-base) keeps the hash stable when `origin/main` catches up to HEAD, so you are not forced to re-quiz after a routine sync.

Message-only amends that do not change the tree keep the same hash.
