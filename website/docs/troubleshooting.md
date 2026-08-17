---
sidebar_position: 8
title: Troubleshooting
---

# Troubleshooting

## commit/push blocked

```text
know-code: commit/push blocked — diff changed since last quiz.
```

The diff changed since your last pass. Re-run the pipeline:

| Step | Who | Command |
|------|-----|---------|
| Start range (if batch) | **You** | `know-code range begin` |
| Teach seal | **You** | `know-code taught` |
| Quiz | **Agent** | `questions` → write `quiz.json` → `ask` |
| Answer | **You** | Browser tab from `ask` |
| Grade + pass | **You** | `grade --review` → `pass` |
| Commit | **Agent** | `know-code commit -m "…"` |

```bash
know-code status --json
know-code doctor
```

## Quiz hash mismatch

```text
Quiz diffHash does not match current … hash
```

Re-run `know-code questions --template`, rewrite `.know-code/quiz.json` for the current hash (`know-code hash`).

## Too few quiz questions

```text
Quiz has N questions but need at least M
```

Run `know-code questions --json` and add questions until `minQuestions` is met. Validate with `know-code quiz validate`.

## `range already active`

Finish with `know-code range seal` or clear with `know-code range abort` (`--keep-seal` to retain range-seal.json).

## Grade below 0.8 (exit 2)

Re-teach weak areas, update quiz, re-run `ask`, agent re-proposes grade, human `grade --review` again.

## `requireTrailer` local vs CI mismatch

Local `init` defaults `requireTrailer: false`; the GitHub Action writes `true` if config is missing. Align:

```bash
know-code config set requireTrailer true
```

Or use `know-code init --workflow` (sets `requireTrailer` when adding CI).

## Port in use (`ask`)

```text
Port 3847 in use — try: know-code ask --port <other>
```

## Skills install failure

If `npx skills add` fails, install manually from [skills.md](skills.md) or clone the repo skills into your agent skills directory.

## Stale seals after rebase / pull

Local `.know-code` receipts (taught / grade / gate / range-seal) are keyed to a diff hash. Rebasing or pulling **feature file** changes invalidates them. Run `know-code status --json` and re-run from `taught`, or `know-code reset`.

Rebasing onto an **unrelated** `main` update does **not** change the tree-canonical range hash. CI `verify` should still match the existing trailer. If local seals look stale but `know-code hash` is unchanged, you do not need a new quiz — only CI cares about the trailer.

## CI: merged `main` into the PR (Update branch)

HEAD is `Merge branch 'main' into …` with no `Know-Code-Verified`. That is expected. Verify scans trailers in `merge-base..HEAD`. It fails only if the trailer is an old (pre–tree-canonical) hash, or the merge changed the feature patch. Restamp with `know-code commit` after a new pass if the tree changed.

## CI: rebased onto updated `main`

Author rebase, then push. Replayed commits keep the trailer text; new SHAs are fine. Verify should pass. If it fails, the rebase resolved conflicts in feature files — re-pass.

GitHub **rebase and merge** is the same shape after the fact; CI already ran on the PR tip.

## CI: squash and merge

Verify ran on the PR, then again on **push** for the squash commit (`--from` the previous main tip). A red check after the squash lands is this push job if the landing commit has no grounded trailer (`PR_TITLE` + `BLANK` drops it). Message `trailers: skipped full-history scan (on base tip)` means someone ran bare `know-code verify` on the default branch without `--from`.

## CI: `on base tip` / no matching trailer on `main`

Bare `know-code verify` on the base branch (zero commits ahead of `origin/main`) has no range. The push job must pass `--from` (previous tip). Locally: `know-code verify --from HEAD^` after a single landing.

## CI: push walk failed

```text
commit abc has no Know-Code-Verified trailer
run N … does not match tree pair
--from is not an ancestor of HEAD
```

- **No trailer on a linear commit:** receipt-mode range (tip only) landed via merge or rebase-and-merge. Squash instead, or `range seal --rewrite` so every commit carries the tip hash. The trailer must start at column 0 (GitHub’s default squash hoist does; local `git merge --squash` indents the body).
- **Trailer does not match the tree-pair:** the landing tree changed, or you expected one hash for a stacked push. Each run is hashed separately; the combined `before..HEAD` patch is not a candidate. A second push in the **same** range session is OK: the walker also tries the tip against ancestors of the previous landing (the original `range begin`).
- **Not an ancestor:** the push rewrote history (`before` is not in `HEAD`’s ancestry). Fail closed.
- **All-zeros `before`:** new branch — the job skips the walk on purpose.

## Gate open but `range seal` blocked (pre-0.2.1)

Upgrade to ≥0.2.1 and re-run `know-code pass` once so `gate.json` includes `gatedTreeOid`. Seal honors commit drift (pass on staged batch → commits → seal on tip).

## CI verify accepts wrong trailer (pre-0.2.1)

Fixed in 0.2.1: verify only accepts grounded hashes. Do not rely on a hand-written `Know-Code-Verified` line that does not match `know-code hash` / merge-base..HEAD.

## Pathspec / partial commits after pass

`know-code commit -- path` can shrink the index tree and invalidate `gatedTreeOid`. Prefer staging the full batch (`git add -A`) before `pass`, then commit without pathspecs — or re-pass after intentional tree changes.

## Corrupt `.know-code/*.json`

`status` / `doctor` report a `corrupt` blocker. Fix or `know-code reset` and re-run the pipeline.

## Wrong attest passphrase

```text
wrong attest passphrase
```

Use the passphrase from `attest-init`. Rotate with `attest-init --force` (invalidates old seals).

## `status --json` debugging

```bash
know-code status --json | jq '.nextStep, .blockers'
```

## `know-code commit` says pass `-m "..."`

The CLI must receive `-m` and the message as separate argv tokens. Always quote:

```bash
know-code commit -m "fix(cli): thing"
# monorepo: npm run know-code -- commit -m "fix(cli): thing"
```

## Hash changed / scope confusion

- **Index scope:** hash = empty-tree → index (staged + HEAD tree). Syncing `origin/main` without staging changes usually does not change it.
- **Range scope:** hash = tree of range start → `write-tree` while `range begin` is active. See `know-code config --json`.

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

HEAD has no grounded `Know-Code-Verified`, or the trailer does not match `merge-base..HEAD` / index. Typical causes: files changed after `pass`, a pre–tree-canonical trailer after merging `main`, or checkout of the ephemeral merge commit without the range fallback finding a feature trailer.

```bash
know-code hash
know-code commit -m "your message"
```

Amending without changing the tree keeps the same hash; changing files requires a new quiz. See [Verification design](verify.md#github-merge-methods) for merge-button behavior.

## Quiz timed out

`know-code ask` waits 1800s by default. Raise with `--timeout` or `KNOW_CODE_QUIZ_TIMEOUT`.

## Emergency bypass (human TTY only)

```bash
know-code override
KNOW_CODE_OVERRIDE=1 git commit
```

Denied in agent hooks and CI. Logged under `.know-code/override.log`.

## Upgrading to 0.3.0

1. Re-run **`know-code pass`** once so `gate.json` includes `gatedTreeOid` (legacy gates never open).
2. Refresh hooks: `know-code hooks install` and `know-code init --agents cursor,claude,codex`.
3. Agents can no longer run raw `git add`, `git commit --amend`, `git merge`, etc. — humans stage outside the agent; agents use `know-code commit` / `know-code amend`.
4. `enforcePipeline` defaults to **true** — teaching + quiz before pass.
5. Before shipping: `know-code doctor --strict` (also run by `know-code ship`).

## Agent denied: git add / amend / merge

Expected in 0.3.0. Stage and history rewrite belong to the human (or a non-agent shell). After the quiz:

```bash
know-code commit -m "feat: …"
# or
know-code amend
```

## Gate closed: missing gatedTreeOid

```text
gate.json missing gatedTreeOid (legacy)
```

Re-seal after upgrade:

```bash
know-code pass
```

## pass refused: missing taught / answers / grade

`know-code pass` needs matching **sealed** artifacts for the **current** hash. Re-run `taught`, complete `ask`, then `grade` before `pass` — in a human terminal with your attest passphrase.

## attest not initialized

```bash
know-code attest-init
```

Creates a passphrase-encrypted Ed25519 key under `~/.know-code/attest/` (public key in `meta.json`). Nothing attest-related is committed to git.
