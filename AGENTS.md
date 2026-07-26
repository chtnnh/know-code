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

## When commit/push/PR is blocked

1. Stage the changes you intend to land
2. Run **know-code-teach** first (unless the human explicitly skips teaching)
3. Run the **know-code** skill: write `.know-code/quiz.json` → `know-code ask` (browser form, not chat)
4. Grade `.know-code/answers.json`, then `know-code pass --level <level> --hash <diffHash>`
5. Include trailer `Know-Code-Verified: <diffHash>` when required
6. Retry commit / push / open PR

CLI from this checkout: `npm run know-code -- …`
