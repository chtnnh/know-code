# k(no)w-code

**Your agents don’t push until you know exactly what’s changed.**

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git commit`, `git push`, and PR creation until the **human** passes a comprehension quiz about the diff. Three difficulty levels. Works with Claude Code, Cursor, Codex, Zed, and plain terminals.

## How it works

1. **Skill** — the host agent diffs your index (HEAD + staged) and writes level-appropriate questions.
2. **Browser quiz** — `know-code ask` opens a local form with a **dedicated textarea per answer** (not the agent chat). The agent grades the submitted answers.
3. **CLI receipt** — on pass, `know-code pass` writes `.know-code/gate.json` keyed to a content hash of the patch.
4. **Git hooks** — `pre-commit` and `pre-push` run `know-code check`.
5. **Agent hooks** — Claude / Cursor / Codex deny `git commit` / `git push` / `gh pr create` and redirect to the skill.
6. **CI** — verifies a `Know-Code-Verified: <hash>` commit trailer on pull requests.

```text
commit/push/PR → hook deny → know-code-teach (unless skipped)
                ↓
          know-code skill → write quiz.json → know-code ask (browser)
                ↓
          grade answers → know-code pass → retry
```

## Install

```bash
# CLI
npm i -g github:chtnnh/know-code#main:packages/cli

# In your repo
know-code init --level standard --agents claude,cursor,codex

# Skills (Claude Code, Cursor, Codex, Zed, …)
npx skills add chtnnh/know-code
```

This repository keeps skills under `skills/` and links them into `.agents/skills/` (committed). After `npm install`, `prepare` also links Cursor/Claude skill dirs locally and syncs hooks into the CLI package for publish.

### Zed

Zed has no PreToolUse-style shell hooks. Rely on `know-code init` (git `pre-push`) plus the skill under `.agents/skills/`.

## Levels

| Level | Questions | Focus |
|-------|-----------|-------|
| `lite` | 2–3 | What changed |
| `standard` | 4–6 | Architecture + trade-offs (default) |
| `deep` | 7–10 | Failure modes, security, migrations |

```bash
know-code init --level deep
# or
export KNOW_CODE_LEVEL=lite
```

## CLI

```bash
know-code init [--level …] [--base-branch main] [--agents claude,cursor,codex]
know-code status [--json]
know-code hash [--json]
know-code check          # exit 0 allow / 2 block (commit + push)
know-code pass --level standard --hash <diffHash>
know-code ask [--quiz .know-code/quiz.json]   # browser answer form
know-code verify         # CI trailer check
```

Emergency bypass (logged):

```bash
KNOW_CODE_OVERRIDE=1 git commit
KNOW_CODE_OVERRIDE=1 git push
```

## Complementary skill: know-code-teach

Use **know-code-teach** before/while coding so the quiz is not your first exposure to the design. It explains intent, touch map, trade-offs, and risks — and never opens the gate.

Ideal loop: teach → implement → teach deltas → **know-code** quiz → push.

## CI gate

PRs to this repo run [`.github/workflows/know-code.yml`](.github/workflows/know-code.yml), which requires a matching commit trailer:

```text
Know-Code-Verified: <diffHash from know-code hash>
```

After a local quiz pass:

```bash
know-code pass --level standard --hash "$(know-code hash)"
HASH=$(know-code hash)
git commit --amend -m "$(git log -1 --format=%B | sed -e '/^Know-Code-Verified:/d')

Know-Code-Verified: ${HASH}"
```

Consumers can reuse the composite action:

```yaml
# .github/workflows/know-code.yml
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

Mark **know-code / verify** as a required status check in branch protection.

## Repo layout

```text
skills/                     # skill source (know-code, know-code-teach)
.agents/skills/             # committed symlinks → skills/
hooks/                      # check-shell.sh + agent hook fragments (single copy)
packages/cli/               # TypeScript CLI (hooks/ synced on prepare/publish)
action/                     # composite GitHub Action
scripts/                    # link-skills.mjs, sync-hooks.mjs
```

## Development

```bash
npm install   # links skills + syncs hooks into packages/cli
npm run build
npm test
npm run know-code -- status
```

## Prior art

Inspired by OwnDiff, Pushback, and proctor-skill — portable skills + content-hash receipts + layered enforcement.

## License

MIT
