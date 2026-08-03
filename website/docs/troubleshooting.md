---
sidebar_position: 8
title: Troubleshooting
---

# Troubleshooting

## commit/push blocked

```text
know-code: commit/push blocked — diff changed since last quiz.
```

Stage intended changes, then in **your** terminal:

```bash
know-code range begin              # if multi-commit batch
know-code taught                   # or taught --skip
know-code questions --json         # agent writes quiz.json
know-code ask --quiz .know-code/quiz.json
know-code grade --score 0.85 --hash "$(know-code hash)"
know-code pass --level standard --hash "$(know-code hash)"
know-code commit -m "your message"
```

If `check` says the seal is invalid, an agent may have written unsigned JSON — re-run the human seal commands.

## `know-code commit` says pass `-m "..."`

The CLI must receive `-m` and the message as separate argv tokens. Always quote:

```bash
know-code commit -m "fix(cli): thing"
# monorepo: npm run know-code -- commit -m "fix(cli): thing"
```

## Hash changed / scope confusion

- **Index scope:** hash = empty-tree → index (staged + HEAD tree). Syncing `origin/main` without staging changes usually does not change it.
- **Range scope:** hash = cumulative `fromOid...HEAD` while `range begin` is active. See `know-code config --json`.

## After `range seal --rewrite`

Trailers use the **range** hash from `range-seal.json`, not the post-seal index hash. Verify with:

```bash
know-code verify --require-range-trailers
```

Push uses `check`, which reads the sealed range when trailers match.

## Global `know-code` vs monorepo build

Git hooks prefer `packages/cli/dist/index.js` when present. If push fails but `npm run know-code -- check` passes, reinstall hooks: `know-code init` or refresh `.git/hooks/pre-push`.

## Cursor hook fired on a non-git command

The shell hook only gates the **parsed** `command` field — not incidental text in JSON or heredocs. Re-run `know-code init --agents cursor` to refresh `.cursor/hooks.json`.

## CI failed: no matching trailer

```bash
know-code hash
know-code commit -m "your message"
```

Amending without changing the tree keeps the same hash; changing files requires a new quiz.

## Quiz timed out

`know-code ask` waits 1800s by default. Raise with `--timeout` or `KNOW_CODE_QUIZ_TIMEOUT`.

## Emergency bypass (human TTY only)

```bash
know-code override
KNOW_CODE_OVERRIDE=1 git commit
```

Denied in agent hooks and CI. Logged under `.know-code/override.log`.

## pass refused: missing taught / answers / grade

`know-code pass` needs matching **sealed** artifacts for the **current** hash. Re-run `taught`, complete `ask`, then `grade` before `pass` — in a human terminal with your attest passphrase.

## attest not initialized

```bash
know-code attest-init
```

Creates a passphrase-encrypted Ed25519 key under `~/.know-code/attest/` (public key in `meta.json`). Nothing attest-related is committed to git.
