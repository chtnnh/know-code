# k(no)w-code

**Your agents don’t push until you know exactly what’s changed.**

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git commit`, `git push`, and PR creation until the **human** passes a comprehension quiz about the diff. **Agent-proposed grading** with human review — not self-scored. Works with Claude Code, Cursor, Codex, and plain terminals.

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)

## How it works

1. **Attest key** — `know-code attest-init` once (passphrase-encrypted Ed25519).
2. **Range session** — `know-code range begin` for multi-commit batches.
3. **Question quota** — `know-code questions` before writing the quiz.
4. **Agent grades** — writes `grade-proposal.json` after browser `ask`.
5. **Human reviews** — `grade --review` → `pass` → `commit` → `range seal` → push.

```text
attest-init → range begin → taught → questions → ask → grade propose → grade --review → pass
  → commit(s) → range seal → push
```

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init
know-code skills
know-code range begin
```

## CLI highlights

| Phase | Command | Who |
|-------|---------|-----|
| Debug | `know-code doctor` · `status --json` | either |
| Start range | `know-code range begin` | human |
| Question quota | `know-code questions --template` | agent |
| Validate quiz | `know-code quiz validate` | agent |
| Teach receipt | `know-code taught` | human |
| Quiz | `know-code ask` | human (browser) |
| Grade proposal | agent writes `grade-proposal.json` | agent |
| Review + pass | `know-code grade --review` · `pass` | human |
| Ship checklist | `know-code ship` | human |
| Commit | `know-code commit -m "…"` or `-F file` | human |
| Finish range | `know-code range seal` | human |

**Human review** (after agent grading proposal):

```bash
know-code grade --review
know-code pass
know-code commit -m "feat: …"
```

See [grading docs](https://kc.chtnnhfoundation.org/docs/grading) and [tutorial](https://kc.chtnnhfoundation.org/docs/tutorial).

## Author

**CHTNNH Foundation** — [chtnnhfoundation.org](https://chtnnnhfoundation.org)

- CLI: [@chtnnh/know-code](https://www.npmjs.com/package/@chtnnh/know-code)
- Source: [github.com/chtnnh/know-code](https://github.com/chtnnh/know-code)
- Docs: [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)

## Development

```bash
npm install
npm run build
npm test
npm run know-code -- status
```

Dogfood: see [AGENTS.md](./AGENTS.md).
