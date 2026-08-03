# @chtnnh/know-code

**Agents don’t push until you know exactly what’s changed.**

CLI that gates `git commit` / `git push` / PR creation until a human passes a browser comprehension quiz about the staged diff. Pair with the [know-code Agent Skills](https://github.com/chtnnh/know-code) in Claude Code, Cursor, Codex, and other agentskills.io harnesses.

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · **Repo:** [chtnnh/know-code](https://github.com/chtnnh/know-code)

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init   # human passphrase — seals taught/grade/pass
```

## Everyday commands

```bash
know-code status
know-code taught                 # human seal (after know-code-teach)
know-code ask --quiz .know-code/quiz.json
know-code grade --score 0.85 --hash "$(know-code hash)"   # human seal
know-code pass --level standard --hash "$(know-code hash)" # human seal
know-code commit -m "feat: …"
know-code verify
```

`check` rejects unsigned or forged `gate.json`. Sealing is denied in agent hooks.

## Emergency bypass (human TTY)

```bash
know-code override
KNOW_CODE_OVERRIDE=1 git commit
```

## License

MIT
