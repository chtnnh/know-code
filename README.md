# k(no)w-code

**Your agents don’t push until you know exactly what’s changed.**

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git push` / PR creation until the **human** passes a comprehension quiz about the diff. Three difficulty levels. Works with Claude Code, Cursor, Codex, Zed, and plain terminals.

## How it works

1. **Skill** — the host agent diffs your branch, asks level-appropriate questions in chat, and grades your answers (no extra API key).
2. **CLI receipt** — on pass, `know-code pass` writes `.know-code/gate.json` keyed to a content hash of the diff.
3. **Git pre-push** — `know-code check` must succeed or the push fails (Zed / terminal / any agent).
4. **Agent hooks** (optional) — Claude / Cursor / Codex deny `git push` / `gh pr create` early and tell the agent to run this skill.
5. **CI** (optional) — GitHub Action verifies a `Know-Code-Verified: <hash>` commit trailer.

```text
push/PR → agent hook (optional) → git pre-push → know-code check
                ↓ fail
          know-code skill (quiz) → know-code pass → retry
```

## Install

```bash
# CLI
npm i -g know-code

# In your repo
know-code init --level standard --agents claude,cursor,codex

# Skills (Claude Code, Cursor, Codex, Zed, …)
npx skills add chtnnh/know-code
```

Or copy/symlink:

```bash
mkdir -p .agents/skills
ln -s /path/to/know-code/skills/know-code .agents/skills/know-code
ln -s /path/to/know-code/skills/know-code-teach .agents/skills/know-code-teach
```

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

## CI Action

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

After a local quiz pass, add a trailer to a commit on the PR:

```text
Know-Code-Verified: <diffHash from know-code hash>
```

Mark the workflow as a required status check for branch protection.

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

### Publish (maintainers)

```bash
# GitHub (already on origin/main after merge)
git push origin main

# npm — requires npm login with publish rights
cd packages/cli && npm publish --access public

# Optional: make the GitHub repo public so `npx skills add chtnnh/know-code` works anonymously
gh repo edit chtnnh/know-code --visibility public
```

Install from git without npm:

```bash
npm i -g github:chtnnh/know-code#main:packages/cli
```

## Prior art

Inspired by OwnDiff, Pushback, and proctor-skill — portable skills + content-hash receipts + layered enforcement.

## License

MIT
