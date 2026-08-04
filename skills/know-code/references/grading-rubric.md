# Grading rubric (agent-proposed scores)

Agents **propose** scores in `.know-code/grade-proposal.json`. Humans **review** with `know-code grade --review` and attest. Agents never seal `grade` or `pass`.

## Pass bar

Overall score ≥ **0.8** (`PASS_SCORE`). Per-question scores are 0–1.

## Per level

### lite

- Correct high-level intent of the change
- Names the main files or modules touched
- No need for line-by-line detail

### standard

- Explains what changed and why
- Connects answers to design choices from teaching
- Catches incorrect assumptions about behavior

### deep

- Traces data/control flow across modules
- Identifies edge cases and test implications
- Demonstrates understanding of security or migration risks when relevant

## Scoring guidance

| Score | Meaning |
|-------|---------|
| 0.9–1.0 | Complete, accurate, shows real understanding |
| 0.7–0.89 | Mostly correct; minor gaps |
| 0.5–0.69 | Partial; significant gaps |
| &lt; 0.5 | Wrong or empty |

Compute `proposedScore` as the average of per-question scores unless a question is weighted more heavily (note in feedback).

## `grade-proposal.json` (agent writes)

```json
{
  "version": 1,
  "diffHash": "<from know-code hash>",
  "answersDigest": "<from answers.json>",
  "proposedScore": 0.85,
  "passed": true,
  "perQuestion": [
    { "id": "q1", "score": 0.9, "feedback": "Correctly explained …" }
  ],
  "rubricVersion": "1",
  "gradedBy": "agent",
  "gradedAt": "2026-01-01T00:00:00.000Z",
  "level": "standard"
}
```

Use `know-code grade propose --json` for rubric context after `ask`.

## Human handoff

After writing the proposal, tell the human:

```bash
know-code grade --review
know-code pass
know-code commit -m "…"
```
