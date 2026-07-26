# know-code GitHub Action

Verifies that a PR carries a `Know-Code-Verified: <diffHash>` commit trailer matching `know-code hash` for the PR head.

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
know-code hash   # copy the hash
git commit --amend -m "$(cat <<EOF
$(git log -1 --format=%B | sed -e '/^Know-Code-Verified:/d')

Know-Code-Verified: <hash>
EOF
)"
```

Enable this check as required in branch protection for team enforcement.
