# Hooks

know-code gates shipping at two layers: **git hooks** and **agent shell hooks**.

## Git hooks

Installed by `know-code init` (or refresh with `know-code hooks install`):

- **pre-commit** — runs `know-code check`
- **pre-push** — runs `know-code check`

Refresh after upgrading the CLI:

```bash
know-code hooks install
```

Uninstall (restores backup if present):

```bash
know-code hooks uninstall
```

## Agent hooks

Optional via `know-code init --agents claude,cursor,codex`:

| Agent | Config file |
|-------|-------------|
| Cursor | `.cursor/hooks.json` |
| Claude | `.claude/settings.json` |
| Codex | `.codex/hooks.json` |

Gated commands (parsed command field only):

- `git commit`
- `git push`
- `gh pr create`
- `glab mr create`

`KNOW_CODE_OVERRIDE` is **never** honored in agent hooks.

Uninstall agent entries:

```bash
know-code hooks uninstall --agents claude,cursor,codex
```

## Opting out

1. `know-code hooks uninstall`
2. Remove agent hook entries manually
3. Human emergency: `know-code override` then `KNOW_CODE_OVERRIDE=1` in **your** terminal (not agent)

See [troubleshooting](./troubleshooting.md).
