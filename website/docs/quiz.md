# Quiz format (`quiz.json`)

The agent writes `.know-code/quiz.json` before `know-code ask`. The human answers in the browser.

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

## Workflow

```bash
know-code questions --json
know-code questions --template > .know-code/quiz.json
# edit prompts
know-code quiz validate
know-code ask
```

## Validation errors

- **Hash mismatch** — re-run `questions` and rewrite quiz for current diff
- **Too few questions** — add questions until `minQuestions` met
- **Missing ids** — every question needs `id` + `prompt`

See also: [grading](./grading.md), [levels](./levels.md).
