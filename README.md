# k(no)w-code

**Your agents don’t push until you know exactly what’s changed.**

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git commit`, `git push`, and PR creation until the **human** passes a comprehension quiz about the diff. Three difficulty levels. Works with Claude Code, Cursor, Codex, Zed, and plain terminals.

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)

## How it works

1. **Attest key** — `know-code attest-init` once (passphrase-encrypted Ed25519 under `~/.know-code/attest/`).
2. **Range session** — `know-code range begin` pins merge-base; **one quiz** covers all commits until `range seal`.
3. **Question quota** — agent runs `know-code questions` before writing the quiz (count scales with diff/commits/level).
4. **Human seals** — `taught` → browser `ask` → `grade` → `pass` (Ed25519; agents cannot forge).
5. **Ship** — `know-code commit -m "…"` per commit; `range seal` when finishing a multi-commit range → push → CI verifies trailers.

```text
attest-init → range begin → teach → taught → questions → ask → grade → pass
  → commit(s) → range seal → push
```

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init
know-code range begin
```

**Config:** optional `~/.know-code/config.json` (defaults) + `.know-code/config.json` (local, gitignored from `init`). See [configuration](https://kc.chtnnhfoundation.org/docs/config).

## CLI highlights

| Phase | Command | Who |
|-------|---------|-----|
| Start range | `know-code range begin` | human |
| Question quota | `know-code questions` | agent |
| Teach receipt | `know-code taught` | human |
| Quiz | `know-code ask --quiz .know-code/quiz.json` | human (browser) |
| Grade / pass | `know-code grade` · `know-code pass` | human |
| Commit | `know-code commit -m "…"` | human |
| Finish range | `know-code range seal` | human |
| Verify / config | `know-code verify` · `know-code config` | either |

**Human seals** (passphrase):

```bash
HASH=$(know-code hash)
know-code grade --score 0.85 --hash "$HASH" --level standard
know-code pass --level standard --hash "$HASH"
```

**Ship a multi-commit range:**

```bash
know-code commit -m "feat: first slice"    # repeat per commit; always quote -m
know-code range seal                       # receipt mode
# know-code range seal --rewrite           # optional: trailers on every commit → force-push
know-code verify --require-range-trailers  # after --rewrite
git push
```

**Monorepo dev:** `npm run know-code -- <command>` from this repo root.

## Config (summary)

| Field | Default | Meaning |
|-------|---------|---------|
| `level` | `standard` | Quiz difficulty (`lite` / `standard` / `deep`) |
| `baseBranch` | `main` | Merge-base branch; align with CI `base-branch` |
| `requireTrailer` | `false` | Expect `Know-Code-Verified` on commits (CI uses `true`) |
| `rangeMode` | `auto` | Range hash when session active; else index hash |
| `rangeSeal` | `receipt` | `rewrite` stamps every commit in range |
| `requireAttest` | `true` | Human Ed25519 seals on taught/grade/pass |

Full reference: [kc.chtnnhfoundation.org/docs/config](https://kc.chtnnhfoundation.org/docs/config)

## Development

```bash
npm install && npm run build && npm test
npm run smoke                    # isolated range + attest smoke
npm run know-code -- status
```

## Author

Built by **[chtnnh](https://github.com/chtnnh)**.

- **Repository:** [github.com/chtnnh/know-code](https://github.com/chtnnh/know-code)
- **npm:** [@chtnnh/know-code](https://www.npmjs.com/package/@chtnnh/know-code)
- **Documentation:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)
- **Issues:** [github.com/chtnnh/know-code/issues](https://github.com/chtnnh/know-code/issues)

## License

MIT
