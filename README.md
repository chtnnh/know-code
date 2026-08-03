# k(no)w-code

**Your agents don’t push until you know exactly what’s changed.**

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git commit`, `git push`, and PR creation until the **human** passes a comprehension quiz about the diff. Three difficulty levels. Works with Claude Code, Cursor, Codex, Zed, and plain terminals.

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)

## How it works

1. **Attest key** — `know-code attest-init` once (passphrase-encrypted Ed25519; pubkey in repo config).
2. **Range session** — `know-code range begin` pins merge-base; **one quiz** covers all commits until `range seal`.
3. **Question quota** — agent runs `know-code questions` before writing the quiz (count scales with diff/commits/level).
4. **Human seals** — `taught` → browser `ask` → `grade` → `pass` (Ed25519; agents cannot forge).
5. **Ship** — `range seal` (optional `--rewrite` for trailers on every commit) → push → CI verifies trailers.

```text
attest-init → range begin → teach → taught → questions → ask → grade → pass → range seal → push
```

**Version note:** npm has **0.1.3** today; **0.1.4** (this branch) adds range workflow, question quota, and attest seals.

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init
```

Optional home defaults: `~/.know-code/config.json`. Per-repo settings in `.know-code/config.json` (gitignored, from `know-code init`).

## CLI highlights

```bash
know-code range begin
know-code questions              # agent: before writing quiz.json
know-code taught                 # human seal
know-code ask
know-code grade --score 0.85 --hash "$(know-code hash)"
know-code pass --level standard --hash "$(know-code hash)"
know-code range seal             # or --rewrite (force-push)
know-code commit -m "msg"
know-code config                 # effective settings
```

## Config

| Field | Default | Meaning |
|-------|---------|---------|
| `rangeMode` | `auto` | Use range hash when `range begin` active |
| `rangeSeal` | `receipt` | `rewrite` stamps every commit in range |
| `requireAttest` | `true` | Human Ed25519 seals required |

## Development

```bash
npm install && npm run build && npm test
npm run smoke                    # isolated range + attest smoke
npm run know-code -- status
```

## License

MIT
