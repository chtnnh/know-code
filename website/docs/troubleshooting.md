---
sidebar_position: 7
title: Troubleshooting
---

# Troubleshooting

## commit/push blocked

```text
know-code: commit/push blocked — diff changed since last quiz.
```

Stage the intended changes, then (human seals — use your own terminal):

```bash
know-code attest-init            # once, if needed
know-code taught                 # or taught --skip
know-code ask --quiz .know-code/quiz.json
know-code grade --score <0-1> --hash "$(know-code hash)"
know-code pass --level standard --hash "$(know-code hash)"
```

If `check` says the seal is missing/invalid, an agent may have written unsigned JSON — re-run the human seal commands.

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

## Emergency bypass (human TTY only)

```bash
know-code override               # interactive: type OVERRIDE
KNOW_CODE_OVERRIDE=1 git commit  # one-shot; consumes allow (10m TTL)
```

Env alone is not enough. Agent hooks and CI deny `KNOW_CODE_OVERRIDE`. Logged under `.know-code/override.log`. CI still requires a trailer.

## pass refused: missing taught / answers / grade

`know-code pass` needs matching **sealed** artifacts for the **current** hash. Re-run `taught`, complete `ask`, then `grade --score … --hash …` before `pass` — all in a human terminal with your attest passphrase.

## attest not initialized

```bash
know-code attest-init
```

Creates a passphrase-encrypted Ed25519 key under `~/.know-code/attest/` (public key in `meta.json` beside it). Nothing attest-related is committed to git.