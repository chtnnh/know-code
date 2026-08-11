# know-code

This repository dogfoods its own gate.

## Required agent loop

1. Human: `know-code attest-init` once
2. **`know-code range begin`** at start of feature work (2+ commits before push)
3. **know-code-teach** → human seals **`know-code taught`**
4. Agent: **`know-code questions`** → write `.know-code/quiz.json` → **`know-code quiz validate`** → **`know-code ask`**
5. Agent writes **`grade-proposal.json`** (see `skills/know-code/references/grading-rubric.md`)
6. Human: **`know-code grade --review`** + **`pass`**
7. **`know-code commit -m "…"`** per commit (quote the message)
8. Human: **`know-code range seal`** → push

Debug: `know-code status --json` · `know-code doctor`

Quiz schema: [docs/quiz](https://kc.chtnnhfoundation.org/docs/quiz) · Grading: [docs/grading](https://kc.chtnnhfoundation.org/docs/grading)

Never set `KNOW_CODE_OVERRIDE` or `KNOW_CODE_ATTEST_PASSPHRASE` from the agent.

**Config:** `~/.know-code/config.json` + gitignored `.know-code/config.json`

CLI (always local build in this repo): `npm run know-code -- …`  
After `npm run build`, keep bare `know-code` pointed here: `npm link -w @chtnnh/know-code`  
(`know-code doctor` warns if PATH still hits a stale global.)

Docs: https://kc.chtnnhfoundation.org
