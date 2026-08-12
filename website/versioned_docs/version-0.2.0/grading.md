# Grading

know-code uses **agent-proposed grading** with **human review and attest**. The human does not self-assign a score.

## Flow

1. Human completes browser quiz (`know-code ask`) → `answers.json`
2. **Agent** reads answers + quiz + diff context → writes `grade-proposal.json`
3. **Human** runs `know-code grade --review` (TUI shows per-question scores + feedback)
4. Human attests passphrase → sealed `grade.json`
5. Human runs `know-code pass` → sealed `gate.json`

```bash
# Agent (after ask)
know-code grade propose --json    # optional context helper
# Agent writes .know-code/grade-proposal.json

# Human
know-code grade --review          # or --accept to skip score adjustment
know-code pass
```

## Pass bar

Overall score ≥ **0.8**. Below the bar, `grade --review` exits 2 — re-teach and re-quiz.

## `grade-proposal.json`

Written by the agent (unsigned). Binds `diffHash` and `answersDigest`. See the skill reference `grading-rubric.md` in the repo.

## Emergency self-score

Disabled by default (`allowSelfScore: false`). Enable only for emergencies:

```bash
know-code config set allowSelfScore true
know-code grade --score 0.85
```

## Config

| Field | Default | Meaning |
|-------|---------|---------|
| `requireGradeProposal` | `true` | Require agent proposal before human grade |
| `allowSelfScore` | `false` | Permit legacy `grade --score` |
