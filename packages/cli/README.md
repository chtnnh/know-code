# @chtnnh/know-code

**Agents don't push until you know exactly what's changed.**

CLI that gates `git commit` / `git push` / PR creation until **you** pass a browser comprehension quiz. The agent writes the quiz and proposes your grade — you answer and seal the gate. Pair with the [know-code Agent Skills](https://github.com/chtnnh/know-code).

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · **Repo:** [chtnnh/know-code](https://github.com/chtnnh/know-code)

## Who does what

| | Agent | You |
|---|-------|-----|
| Teach | Explains (`know-code-teach` skill) | `taught` |
| Quiz | Writes `quiz.json`, runs `ask` | Answer in browser |
| Grade | `grade-proposal.json` | `grade --review` → `pass` |
| Stage | — | `git add` (your terminal) |
| Commit | `know-code commit` | After you pass |
| Ship | — | `range seal`, `git push` |

## Install (you, once)

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init
know-code skills
```

## Range workflow (recommended)

One quiz per feature batch — not per commit.

```bash
know-code range begin                    # you

# agent: know-code-teach
know-code taught                         # you

# agent: questions → quiz.json → quiz validate → ask
# you: answer in browser

# agent: grade-proposal.json
know-code grade --review                 # you
know-code pass                           # you

know-code commit -m "feat: first slice"  # agent
# … more commits …
know-code range seal                     # you
know-code doctor --strict                # you
git push
```

## Everyday commands

| Command | Who |
|---------|-----|
| `know-code taught` / `grade --review` / `pass` / `range seal` | **you** (passphrase) |
| `know-code questions` · `quiz validate` · `ask` | **agent** runs · **you** answer in browser |
| `know-code commit` / `amend` | **agent** (after pass) |
| `know-code status` · `doctor --strict` · `ship` | either |

## Agent hooks (0.3.0+)

Agent shell hooks deny `git add`, amend, merge/pull/rebase, and other bypasses. **You** stage; the agent commits through `know-code commit` after pass.

```bash
know-code hooks install
know-code init --agents claude,cursor,codex
```

See [hooks docs](https://kc.chtnnhfoundation.org/docs/hooks).

## Config

Merged from `~/.know-code/config.json` + `.know-code/config.json` (gitignored). Notable: `enforcePipeline` defaults to **`true`** (0.3.0). See [config docs](https://kc.chtnnhfoundation.org/docs/config).

## Upgrading to 0.3.0

1. Re-run **`know-code pass`** so `gate.json` includes `gatedTreeOid`.
2. Refresh hooks: `hooks install`, `init --agents …`.
3. You stage (`git add`); agents use `know-code commit` / `amend`.

## Emergency bypass (human TTY)

```bash
know-code override
KNOW_CODE_OVERRIDE=1 git commit
```

Denied in agent hooks and CI.

## License

MIT
