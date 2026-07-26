# know-code

This repository ships two Agent Skills:

- **know-code** — quiz the human before push/PR; write a gate receipt with the CLI
- **know-code-teach** — explain architecture and trade-offs while coding (does not open the gate)

When a push or `gh pr create` is blocked, run the know-code skill. Install the CLI with `npm i -g know-code`.
