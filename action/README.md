# know-code GitHub Action

Verify `Know-Code-Verified` commit trailers in CI.

## Usage

On `pull_request`, checkout the PR tip. On `push` to the base branch, pass
`from:` with `github.event.before` so verify walks each landed run (HEAD
equals the base, so there is no merge-base range to recompute).

```yaml
on:
  pull_request:
  push:
    branches: [main]

# ...

- uses: actions/checkout@v4
  with:
    fetch-depth: 0
    ref: ${{ github.event.pull_request.head.sha || github.sha }}

- uses: chtnnh/know-code/action@v0.3.0
  with:
    base-branch: main
    from: ${{ github.event_name == 'push' && github.event.before || '' }}
    require-all: false
    require-range-trailers: false
    version: "^0.3.0"
```

All-zeros `github.event.before` (new branch) skips the walk.

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `base-branch` | `main` | Base branch for diff hashing |
| `from` | _(empty)_ | Previous tip for push jobs (`github.event.before`). Empty on `pull_request`. |
| `require-all` | `false` | Stricter verify messaging |
| `require-range-trailers` | `false` | Every commit in range must have trailer (rewrite teams; PR path) |
| `version` | `^0.3.0` | npm version when not building from monorepo checkout |

## Quick add

```bash
know-code init --workflow
```

This writes `.github/workflows/know-code.yml` and sets `requireTrailer: true` in local config when using `--workflow`.
