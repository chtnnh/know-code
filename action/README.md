# know-code GitHub Action

Verify `Know-Code-Verified` commit trailers in CI.

## Usage

Trigger the workflow on `pull_request` only. On a direct push to the base
branch, `HEAD` equals the base so there is no merge-base range to verify —
gate direct pushes locally with the pre-push hook instead.

```yaml
on:
  pull_request:

# ...

- uses: chtnnh/know-code/action@v0.3.0
  with:
    base-branch: main
    require-all: false
    require-range-trailers: false
    version: "^0.3.0"
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `base-branch` | `main` | Base branch for diff hashing |
| `require-all` | `false` | Stricter verify messaging |
| `require-range-trailers` | `false` | Every commit in range must have trailer (rewrite teams) |
| `version` | `^0.3.0` | npm version when not building from monorepo checkout |

## Quick add

```bash
know-code init --workflow
```

This writes `.github/workflows/know-code.yml` and sets `requireTrailer: true` in local config when using `--workflow`.
