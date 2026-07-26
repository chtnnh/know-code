# k(no)w-code

**Your agents don’t push until you know exactly what’s changed.**

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git push` / PR creation until the **human** passes a comprehension quiz about the diff. Three difficulty levels. Works with Claude Code, Cursor, Codex, Zed, and plain terminals.

## How it works

1. **Skill** — the host agent diffs your branch, asks level-appropriate questions in chat, and grades your answers (no extra API key).
2. **CLI receipt** — on pass, `know-code pass` writes `.know-code/gate.json` keyed to a content hash of the diff.
3. **Git pre-push** — `know-code check` must succeed or the push fails (Zed / terminal / any agent).
4. **Agent hooks** — Claude / Cursor / Codex deny `git push` / `gh pr create` early and tell the agent to run this skill.
5. **CI** — GitHub Action verifies a `Know-Code-Verified: <hash>` commit trailer on pull requests.

```text
push/PR → agent hook → git pre-push → know-code check
                ↓ fail
          know-code skill (quiz) → know-code pass → retry
                ↓
          commit trailer → CI verify
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

Or copy/symlink from a checkout of this repo:

```bash
mkdir -p .agents/skills .cursor/skills .claude/skills
ln -s /path/to/know-code/skills/know-code .agents/skills/know-code
ln -s /path/to/know-code/skills/know-code-teach .agents/skills/know-code-teach
# repeat under .cursor/skills and .claude/skills as needed
```

This repository already has the skills linked under `.agents/skills`, `.cursor/skills`, and `.claude/skills`, plus agent hooks and a required PR check.

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
know-code check          # exit 0 allow / 2 block
know-code pass --level standard --hash <diffHash>
know-code verify         # CI trailer check
```

Emergency bypass (logged):

```bash
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
skills/know-code/           # gate + quiz skill
skills/know-code-teach/     # explain-while-coding skill
packages/cli/               # npm package "know-code"
hooks/                      # agent hook fragments + check-shell.sh
action/                     # GitHub Action
```

## Development

```bash
npm install
npm run build
npm test
node packages/cli/dist/index.js status
```

## Prior art

Inspired by OwnDiff, Pushback, and proctor-skill — portable skills + content-hash receipts + layered enforcement.

## License

MIT
