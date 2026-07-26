---
sidebar_position: 7
title: Troubleshooting
---

# Troubleshooting

## commit/push blocked

```text
know-code: commit/push blocked — diff changed since last quiz.
```

Stage the intended changes, re-run teach (unless skipped), quiz via `know-code ask`, then `know-code pass` with the **current** `know-code hash`.

## Hash changed after I synced main

Hashing uses empty-tree → index (not merge-base). Syncing `origin/main` alone should not change the hash. Staging or unstaging files will.

## Cursor hook fired on a non-git command

Cursor’s matcher looks for real `git commit` / `git push` / `gh pr create` invocations. The shell hook only gates the **parsed** `command` field — not incidental text inside JSON or heredocs. Re-run `know-code init --agents cursor` to refresh `.cursor/hooks.json`.

## CI failed: no matching trailer

```bash
know-code hash
know-code commit -m "your message"   # adds Know-Code-Verified
```

Amending without changing the tree keeps the same hash; changing files requires a new quiz.

## Quiz timed out

`know-code ask` waits 1800s by default. Raise with `--timeout` or `KNOW_CODE_QUIZ_TIMEOUT`.

## Emergency bypass (local only)

```bash
KNOW_CODE_OVERRIDE=1 git commit
KNOW_CODE_OVERRIDE=1 git push
```

Logged under `.know-code/override.log`. CI still requires a trailer.
