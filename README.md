# k(no)w-code

**Your agents don’t push until you know exactly what’s changed.**

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git commit`, `git push`, and PR creation until the **human** passes a comprehension quiz about the diff. Three difficulty levels. Works with Claude Code, Cursor, Codex, Zed, and plain terminals.

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)

## How it works

1. **Skill** — the host agent diffs your index and writes level-appropriate questions.
2. **Browser quiz** — `know-code ask` opens a local form (not the agent chat).
3. **CLI receipt** — on pass, `know-code pass` writes `.know-code/gate.json` keyed to a content hash of the patch.
4. **Git + agent hooks** — deny commit / push / PR create until the receipt matches.
5. **CI** — verifies a `Know-Code-Verified: <hash>` trailer on PRs and pushes to `main`.

```text
teach → implement → quiz (browser) → know-code pass → know-code commit → push
```

## Install

```bash
# CLI (preferred after publish)
npm i -g know-code

# Fallback before / without npm
npm i -g github:chtnnh/know-code#main:packages/cli

know-code init --level standard --agents claude,cursor,codex --workflow
npx skills add chtnnh/know-code
```

`init --workflow` adds a GitHub Actions workflow that uses [`chtnnh/know-code/action@v0.1.2`](./action).

### Zed

Zed has no PreToolUse-style shell hooks. Rely on git hooks from `know-code init` plus the skill under `.agents/skills/`.

## Levels

| Level | Questions | Focus |
|-------|-----------|-------|
| `lite` | 2–3 | What changed |
| `standard` | 4–6 | Architecture + trade-offs (default) |
| `deep` | 7–10 | Failure modes, security, migrations |

## CLI

```bash
know-code init [--level …] [--base-branch main] [--agents …] [--workflow]
know-code status [--json]
know-code hash [--json]
know-code check
know-code pass --level standard --hash <diffHash>
know-code ask [--quiz .know-code/quiz.json] [--timeout 1800]
know-code commit -m "msg"   # use this — adds Know-Code-Verified trailer
know-code verify
```

Emergency bypass (local only; logged to `.know-code/override.log`):

```bash
KNOW_CODE_OVERRIDE=1 git commit
KNOW_CODE_OVERRIDE=1 git push
```

## CI for your repo

```yaml
# written by: know-code init --workflow
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- uses: chtnnh/know-code/action@v0.1.2
  with:
    base-branch: main
```

Mark **know-code** as a required status check. Helper: `node scripts/setup-branch-protection.mjs owner/repo main`.

## Development

```bash
npm install   # links skills + syncs hooks into packages/cli
npm run build
npm test
npm run know-code -- status
npm run build -w website   # docs site
```

## Publish checklist (maintainers)

1. Public GitHub repo  
2. Pages: source = GitHub Actions; DNS `kc` CNAME → `chtnnh.github.io`  
3. Set `NPM_TOKEN` secret; tag `v0.1.2` to run [`.github/workflows/release.yml`](.github/workflows/release.yml)  
4. Smoke install from npm + Action on a fresh repo  

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
