# know-code

This repository dogfoods its own gate.

- Skill source: `skills/know-code`, `skills/know-code-teach`
- Committed links: `.agents/skills/`
- Local Cursor/Claude links: `npm run link-skills` (gitignored)
- Agent hooks: `.cursor/hooks.json`, `.claude/settings.json`, `.codex/hooks.json`
- Config: `.know-code/config.json` (`requireTrailer: true`)

## Required agent loop

1. **know-code-teach** before non-trivial edits (unless human skips)
2. Implement (teach deltas as you go)
3. On gate deny / before ship: teach (if needed) → **know-code** browser quiz → `know-code pass`
4. **Commit with `know-code commit -m "..."`** — always adds `Know-Code-Verified` trailer; do not wait for the human to ask for the trailer
5. Push when shipping

## Skills

- **know-code-teach** — explain before/while coding (never opens the gate)
- **know-code** — quiz in browser; `know-code pass`; ship via `know-code commit`

CLI from this checkout: `npm run know-code -- …`

Docs: https://kc.chtnnhfoundation.org
