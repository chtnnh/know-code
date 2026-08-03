# know-code

This repository dogfoods its own gate.

## Required agent loop

1. Human: `know-code attest-init` once
2. **`know-code range begin`** at start of feature work
3. **know-code-teach** → human seals **`know-code taught`**
4. Agent: **`know-code questions`** → write quiz → **`know-code ask`**
5. Human seals **`grade`** + **`pass`**
6. Human: **`know-code range seal`** (or `--rewrite` if configured)
7. **`know-code commit`** / push

Never set `KNOW_CODE_OVERRIDE` or `KNOW_CODE_ATTEST_PASSPHRASE` from the agent.

CLI: `npm run know-code -- …`

Docs: https://kc.chtnnhfoundation.org
