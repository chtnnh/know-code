# know-code GitHub Action

Verifies that a PR carries a `Know-Code-Verified: <diffHash>` commit trailer matching `know-code hash` for the PR head.

Checkout the repo with `fetch-depth: 0` before invoking this action.

## Usage

```yaml
name: know-code
on: pull_request
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: chtnnh/know-code/action@main
        with:
          base-branch: main
```

After passing the local quiz:

```bash
HASH=$(know-code hash)
# include in commit message:
# Know-Code-Verified: $HASH
```

Enable **know-code / verify** as a required status check for branch protection.
