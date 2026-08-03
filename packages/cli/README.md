# @chtnnh/know-code

**Agents don’t push until you know exactly what’s changed.**

CLI that gates `git commit` / `git push` / PR creation until a human passes a browser comprehension quiz. Pair with the [know-code Agent Skills](https://github.com/chtnnh/know-code).

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · **Repo:** [chtnnh/know-code](https://github.com/chtnnh/know-code)

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init   # human passphrase — once per machine
```

## Range workflow (recommended)

One quiz per feature batch — not per commit.

```bash
know-code range begin
# agent: know-code-teach → you: know-code taught
know-code questions --json          # agent writes .know-code/quiz.json
know-code ask --quiz .know-code/quiz.json
know-code grade --score 0.85 --hash "$(know-code hash)"
know-code pass --level standard --hash "$(know-code hash)"
know-code commit -m "feat: first slice"
# … more commits in the range …
know-code range seal                # or --rewrite + git push --force-with-lease
git push
```

## Everyday commands

| Command | Who |
|---------|-----|
| `know-code config` | either |
| `know-code questions` | agent |
| `know-code taught` / `grade` / `pass` | **human** (attest passphrase) |
| `know-code ask` | human answers in browser |
| `know-code commit -m "…"` | human (quote the message) |
| `know-code check` | hooks / CI helper |
| `know-code verify` | CI / local trailer check |

```bash
know-code status
know-code hash
know-code verify --require-range-trailers   # after range seal --rewrite
```

## Config

Merged from `~/.know-code/config.json` + `.know-code/config.json` (local, gitignored). Fields: `level`, `baseBranch`, `requireTrailer`, `rangeMode`, `rangeSeal`, `requireAttest`. See [config docs](https://kc.chtnnhfoundation.org/docs/config).

## Emergency bypass (human TTY)

```bash
know-code override
KNOW_CODE_OVERRIDE=1 git commit
```

Denied in agent hooks and CI.

## License

MIT
