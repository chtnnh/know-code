---
sidebar_position: 6
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

      - uses: chtnnh/know-code/action@v0.1.2
        with:
          base-branch: main
```

## Composite action inputs

| Input | Default | Description |
|-------|---------|-------------|
| `base-branch` | `main` | Must match local `.know-code/config.json` |
| `require-all` | `false` | Stricter messaging when trailers missing |
| `version` | `^0.1.2` | npm pin when not building from this monorepo |

## What verify checks

1. **Primary:** HEAD commit message contains `Know-Code-Verified: <current-hash>`.
2. **Secondary:** If HEAD is ahead of the base branch, scan trailers on that range only (not the entire repository history).

Use `know-code commit -m "…"` locally so the trailer is attached automatically.

## Branch protection

After `ci` and `know-code` have run at least once:

```bash
node scripts/setup-branch-protection.mjs chtnnh/your-repo main
```

Requires `gh` with admin access. Mark **know-code** (and preferably **ci**) as required checks.

## Overrides

`KNOW_CODE_OVERRIDE=1` is local-only and is logged to `.know-code/override.log`. It never satisfies CI.
