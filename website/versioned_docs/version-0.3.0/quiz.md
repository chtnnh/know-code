# Quiz format (`quiz.json`)

The **agent** writes `.know-code/quiz.json`. **You** answer in the browser when the agent runs `know-code ask`. You do not write quiz questions yourself unless you're working without an agent.

## Who does what

| Task | Who |
|------|-----|
| `know-code questions` (quota) | Agent |
| Write / edit `quiz.json` | Agent |
| `quiz validate` | Agent |
| `know-code ask` (opens browser) | Agent runs it · **you** submit answers |
| Read `answers.json` | Agent (for grade proposal) |

## Schema

```json
{
  "diffHash": "<64-hex from know-code hash>",
  "level": "lite | standard | deep",
  "title": "optional title",
  "questions": [
    {
      "id": "q1",
      "prompt": "What does this change do and why?",
      "expectedPoints": ["optional rubric hints for agent grading"],
      "type": "text",
      "choices": []
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `diffHash` | yes | Must match current `know-code hash` |
| `level` | yes | Usually matches config level |
| `questions` | yes | At least `minQuestions` from `know-code questions` |
| `questions[].id` | yes | Unique stable ids (`q1`, `q2`, …) |
| `questions[].prompt` | yes | Shown in browser |
| `expectedPoints` | no | Helps agent scoring |
| `type` | no | `text` (default) or `mcq` |
| `choices` | mcq only | Array of strings |

## Agent workflow

```bash
know-code questions --json                    # agent: read minQuestions + context
know-code questions --template > .know-code/quiz.json   # agent: starting skeleton
# agent edits prompts to match the real diff
know-code quiz validate
know-code ask                               # you: answer in browser tab
```

`ask` rejects quizzes that are too short, missing ids, or bound to a stale hash.

## Validation errors

- **Hash mismatch** — diff changed; agent re-runs `questions` and rewrites the quiz
- **Too few questions** — agent adds questions until `minQuestions` met
- **Missing ids** — every question needs `id` + `prompt`

See also: [Grading](grading.md) · [Levels](levels.md) · [Tutorial](tutorial.md)
