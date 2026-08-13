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

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: chtnnh/know-code/action@v0.3.0
        with:
          base-branch: main
          require-range-trailers: true
```

:::note PR-only trigger
Grounded verification recomputes the diff between the merge-base and HEAD. On a
push **to** the base branch itself, HEAD *is* the base (zero commits ahead), so
there is no range to recompute — which is why the workflow runs on
`pull_request` only. Direct pushes are enforced locally by the pre-push hook.
:::

## Composite action inputs

| Input | Default | Description |
|-------|---------|-------------|
| `base-branch` | `main` | Must match local `baseBranch` (`know-code config`) |
| `require-all` | `false` | Stricter messaging when trailers missing |
| `require-range-trailers` | `false` | Every commit ahead of base must share the same `Know-Code-Verified` hash (rewrite teams) |
| `version` | `^0.3.0` | npm pin for `@chtnnh/know-code` when not building from this monorepo |

## What verify checks

Default `know-code verify` (one CI command for all merge styles). CI only sees **public git** — not gitignored `.know-code/` seals.

1. **HEAD trailer** must match a **grounded** candidate:
   - **merge-base..HEAD** — tree-canonical range hash (fromOid tree → `write-tree`)
   - **index** — empty-tree → current tree (single-commit / hotfix)
   - **uniform-trailers** — only when every commit’s trailer is already a grounded candidate
2. **Fallback:** any commit in `merge-base..HEAD` carries a matching trailer (pre-squash PR branches).

Do **not** rely on local `range-seal` / `commit-drift` for green CI. Checkout the PR tip (`ref: ${{ github.event.pull_request.head.sha }}`), not the ephemeral merge commit. Full design: [Verification design](verify.md).

Squash merges only need the **squash commit** to carry a trailer for the combined diff — intermediate commits are not checked.

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
