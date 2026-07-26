# @chtnnh/know-code

**Agents don’t push until you know exactly what’s changed.**

CLI that gates `git commit` / `git push` / PR creation until a human passes a browser comprehension quiz about the staged diff. Pair with the [know-code Agent Skills](https://github.com/chtnnh/know-code) in Claude Code, Cursor, Codex, and other agentskills.io harnesses.

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org) · **Repo:** [chtnnh/know-code](https://github.com/chtnnh/know-code)

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
```

The npm binary is `know-code` (package name is scoped because unscoped `know-code` collides with `knowcode` on npm).

## Skills (project or global)

```bash
# This repo / project only
know-code skills
# same as: npx skills add chtnnh/know-code

# All repos — install into your user harness dirs (~/.cursor/skills, ~/.claude/skills, …)
know-code skills --global
# same as: npx skills add chtnnh/know-code --global
```

## Everyday commands

```bash
know-code status
know-code ask --quiz .know-code/quiz.json
know-code pass --level standard --hash "$(know-code hash)"
know-code commit -m "feat: …"    # adds Know-Code-Verified trailer
know-code verify                 # CI
```

## CI

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- uses: chtnnh/know-code/action@v0.1.2
  with:
    base-branch: main
```

Or `know-code init --workflow`.

## License

MIT
