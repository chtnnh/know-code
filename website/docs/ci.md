---
sidebar_position: 7
title: CI & GitHub Action
---

# CI & GitHub Action

## Quick add (recommended)

```bash
know-code init --workflow
```

Writes `.github/workflows/know-code.yml`:

```yaml
name: know-code

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha || github.sha }}

      - uses: chtnnh/know-code/action@v0.3.0
        with:
          base-branch: main
          from: ${{ github.event_name == 'push' && github.event.before || '' }}
```

:::note PR plus push
The PR job checks out `head.sha` and runs `know-code verify` (merge-base ahead of HEAD). The push job checks out the new base tip and passes `from` so verify walks `github.event.before..HEAD`. Without `--from`, HEAD *is* the base (`aheadCount` 0) and range verify cannot match. Direct pushes that skip the PR still get a trailer check. All-zeros `before` (new branch) skips the walk.
:::

## Composite action inputs

| Input | Default | Description |
|-------|---------|-------------|
| `base-branch` | `main` | Must match local `baseBranch` (`know-code config`) |
| `from` | _(empty)_ | Previous tip SHA for push jobs (`github.event.before`). Empty on `pull_request`. All-zeros skips the walk. |
| `require-all` | `false` | Stricter messaging when trailers missing |
| `require-range-trailers` | `false` | Every commit ahead of base must share the same `Know-Code-Verified` hash (rewrite teams) |
| `version` | `^0.3.0` | npm pin for `@chtnnh/know-code` when not building from this monorepo |

## What verify checks

Default `know-code verify` (one CI command for all merge styles). CI only sees **public git** — not gitignored `.know-code/` seals.

1. **HEAD trailer** must match a **grounded** candidate:
   - **merge-base..HEAD** — tree-canonical range hash (fromOid tree → `write-tree`)
   - **index** — empty-tree → current tree (single-commit / hotfix)
   - **uniform-trailers** — only when every commit’s trailer is already a grounded candidate
2. **Fallback:** any commit in `merge-base..HEAD` carries a matching trailer (Update branch, `pull/N/merge`, pre-squash PR branches).

Do **not** rely on local `range-seal` / `commit-drift` for green CI. Checkout the PR tip SHA, not the ephemeral merge commit.

**Push job:** `know-code verify --from` previous tip. Splits `before..HEAD` into trailer runs; each run’s historical tree-pair must match. A dirty index does not count. Full design: [Verification design](verify.md).

### Merge methods (what CI actually sees)

The **PR** job runs on the **PR tip**. The **push** job runs on the landing commit with `--from` previous tip.

- **Update branch** (merge `main` into the PR): HEAD is a merge commit with no trailer. PR verify still passes: it scans `merge-base..HEAD` and the tree-canonical hash is unchanged if only unrelated `main` files were added.
- **Rebase and merge** / author `git rebase origin/main`: replayed commits keep the original `Know-Code-Verified` line. The hash against the **new** merge-base still matches. Push walk requires a trailer on every replayed non-merge commit (rewrite or each commit already trailered).
- **Squash and merge**: PR verify already passed on the multi-commit PR. Push verify checks the squash commit. GitHub’s default squash message often copies the trailer onto that landing; the `PR_TITLE` + `BLANK` preset does not — that fails the **push** job, not the PR job.
- **Create a merge commit**: PR job same as Update branch if HEAD has no trailer — range fallback. Push walk attaches the merge to the PR-side run but hashes the last non-merge (feature tip), so the landing still matches after `main` moved. Every non-merge in `before..HEAD` still needs a trailer.

After any of those land on `main`, bare `know-code verify` cannot succeed (`on base tip`). The push job uses `--from` instead. Details: [Verification design](verify.md#github-merge-methods) and [Push walk](verify.md#push-walk).

**Strict opt-in:** `--require-range-trailers` — every commit in the range must share the same trailer (rewrite teams only).

Use `know-code commit -m "…"` locally so the trailer is attached automatically.

## Branch protection

After `ci` and `know-code` have run at least once:

```bash
node scripts/setup-branch-protection.mjs chtnnh/your-repo main
```

Requires `gh` with admin access. Mark **know-code** (and preferably **ci**) as required checks.

## Overrides

`KNOW_CODE_OVERRIDE=1` is local-only, requires a prior `know-code override` on a TTY, is denied in agent hooks, and is logged to `.know-code/override.log`. It never satisfies CI.
