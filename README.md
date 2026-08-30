# k(no)w-code

**Your agents don't push until you know exactly what's changed.**

[![CI](https://github.com/chtnnh/know-code/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/chtnnh/know-code/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40chtnnh/know-code?logo=npm&label=npm)](https://www.npmjs.com/package/@chtnnh/know-code)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://www.npmjs.com/package/@chtnnh/know-code)
[![License](https://img.shields.io/github/license/chtnnh/know-code)](https://github.com/chtnnh/know-code/blob/main/LICENSE)
[![Human comprehension gate](https://img.shields.io/badge/AI_changes-human%20comprehension%20gate-6f42c1)](https://kc.chtnnhfoundation.org/docs/how-it-works)
[![npm downloads](https://img.shields.io/npm/dm/%40chtnnh/know-code?label=downloads)](https://www.npmjs.com/package/@chtnnh/know-code)

Cross-harness [Agent Skill](https://agentskills.io) + CLI that blocks `git commit`, `git push`, and PR creation until **you** pass a comprehension quiz about the diff. The agent writes the quiz and proposes your grade — **you** answer in the browser and seal the gate. Not self-scored.

**Docs:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)

## Who does what

| | Agent | You (human) |
|---|-------|-------------|
| Teach | Explains the change | `taught` (seal) |
| Quiz | Writes `quiz.json`, runs `ask` | Answer in **browser** |
| Grade | `grade-proposal.json` | `grade --review` → `pass` |
| Stage | — (denied in agent hooks) | `git add` |
| Commit | `know-code commit` | Or you, after pass |
| Ship | — | `range seal`, `git push` |

## Install

```bash
npm i -g @chtnnh/know-code
know-code init --level standard --agents claude,cursor,codex --workflow
know-code attest-init
know-code skills
know-code range begin
```

Every command is also available as **`kc`** (`kc status`, `kc taught`, `kc commit -m "…"`).

## The loop

```text
range begin → [agent teaches] → taught → [agent: quiz] → ask → [you: browser]
  → [agent: grade proposal] → grade --review → pass → [agent: commit(s)] → range seal → push
```

| Phase | Command | Who |
|-------|---------|-----|
| Debug | `status --json` · `doctor --strict` | either |
| Start range | `range begin` | you |
| Teach receipt | `taught` | you |
| Quiz authoring | `questions` · `quiz.json` · `quiz validate` | agent |
| Quiz answers | `ask` | you (browser) |
| Grade | `grade-proposal.json` → `grade --review` · `pass` | agent → you |
| Commit | `know-code commit -m "…"` | agent |
| Finish | `range seal` · `ship` · `git push` | you |

Walkthrough: [tutorial](https://kc.chtnnhfoundation.org/docs/tutorial) · Mechanics: [how it works](https://kc.chtnnhfoundation.org/docs/how-it-works)

## Author

Built by **[chtnnh](https://github.com/chtnnh)**.

- **Repository:** [github.com/chtnnh/know-code](https://github.com/chtnnh/know-code)
- **npm:** [@chtnnh/know-code](https://www.npmjs.com/package/@chtnnh/know-code)
- **Documentation:** [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org)
- **Issues:** [github.com/chtnnh/know-code/issues](https://github.com/chtnnh/know-code/issues)

## Development

```bash
npm install
npm run build
npm test
npm run know-code -- status
```

Dogfood: see [AGENTS.md](./AGENTS.md).
