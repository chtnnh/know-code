# Workflows

## Range (default — one quiz per feature batch)

Best for 2+ commits before push.

```bash
know-code range begin
# teach → taught → questions → quiz → ask → grade propose → grade --review → pass
know-code commit -m "…"    # repeat commits
know-code range seal
git push
```

After seal: `know-code range continue --yes` to start the next batch.

## Index-only (hotfix)

Single commit, no `range begin`. Quiz hash covers staged + index diff.

```bash
know-code taught
know-code questions --template
know-code ask
# grade propose → grade --review → pass
know-code commit -m "hotfix: …"
git push
```

Set `rangeMode: "index"` in config to prefer this mode.

## PR-first

Hooks gate `gh pr create` and `glab mr create`. Pass the quiz before opening the PR.

## Receipt vs rewrite

| Mode | When | Command |
|------|------|---------|
| **receipt** | Trailer on HEAD / latest commit is enough | `range seal` |
| **rewrite** | CI requires trailer on **every** commit in range | `range seal --rewrite` + `verify --require-range-trailers` |

Rewrite changes commit SHAs — use `git push --force-with-lease`.

## When to `range abort`

- Wrong `from` ref / started range by mistake
- `range abort` clears session (use `--keep-seal` to retain range-seal.json)
- Does not undo commits — only clears local session state
