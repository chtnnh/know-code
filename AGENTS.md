# know-code

This repository dogfoods its own gate.

- Skill source: `skills/know-code`, `skills/know-code-teach`
- Committed links: `.agents/skills/`
- Local Cursor/Claude links: created by `npm run link-skills` (gitignored)
- Agent hooks: `.cursor/hooks.json`, `.claude/settings.json`, `.codex/hooks.json`
- Config: `.know-code/config.json` (`requireTrailer: true`)

## Skills

- **know-code** — quiz before push/PR; `know-code pass`; add `Know-Code-Verified` trailer for CI
- **know-code-teach** — explain while coding (does not open the gate)

## When push/PR is blocked

1. Run the **know-code** skill
2. `know-code pass --level <level> --hash <diffHash>`
3. Add trailer `Know-Code-Verified: <diffHash>` on the commit
4. Retry push / open PR

CLI from this checkout: `npm run know-code -- …`
