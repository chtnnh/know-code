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
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: chtnnh/know-code/action@v0.2.0
        with:
          base-branch: main
          require-range-trailers: true
```

## Composite action inputs

| Input | Default | Description |
|-------|---------|-------------|
| `base-branch` | `main` | Must match local `baseBranch` (`know-code config`) |
| `require-all` | `false` | Stricter messaging when trailers missing |
| `require-range-trailers` | `false` | Every commit ahead of base must share the same `Know-Code-Verified` hash (rewrite teams) |
| `version` | `^0.2.0` | npm pin for `@chtnnh/know-code` when not building from this monorepo |

## What verify checks

Default `know-code verify` (one CI command for all merge styles):

1. **HEAD trailer** must match one of:
   - **merge-base..HEAD** — cumulative diff since the base branch (range batches, squash merges, PR tips)
   - **index** — empty-tree → current tree (single-commit / hotfix)
   - **range-seal** or **uniform-trailers** — when present locally
2. **Fallback:** any commit in `merge-base..HEAD` carries a matching trailer (pre-squash PR branches).

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
