# know-code

This repository dogfoods its own gate. Skills are linked under:

- `.agents/skills/know-code` + `know-code-teach`
- `.cursor/skills/…`
- `.claude/skills/…`

## Skills

- **know-code** — quiz the human before push/PR; write a gate receipt with the CLI; add `Know-Code-Verified` trailer for CI
- **know-code-teach** — explain architecture and trade-offs while coding (does not open the gate)

## When push/PR is blocked

1. Run the **know-code** skill
2. Pass the quiz → `know-code pass --level <level> --hash <diffHash>`
3. Amend or add a commit with trailer `Know-Code-Verified: <diffHash>`
4. Retry push / open PR

CLI (from this checkout): `node packages/cli/dist/index.js …` or `npm i -g github:chtnnh/know-code#main:packages/cli`.
