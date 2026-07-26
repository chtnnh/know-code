# Quiz levels

Pick the level from config / env / human override. Apply the matching section only.

## lite

- **Count:** 2–3 questions
- **Focus:** What changed — name main files, summarize behavior deltas, identify the user-visible or API-visible effect
- **Avoid:** Deep architecture debate, speculative future work
- **Pass bar:** ≥80% solidly correct (e.g. 2/2 or 2/3)
- **Example angles:** “Which files implement X?”, “What happens when Y is called after this change?”, “What bug or feature does this address?”

## standard

- **Count:** 4–6 questions
- **Focus:** Architecture impact, why this approach, trade-offs vs obvious alternatives, how modules interact after the change
- **Include:** At least one “why not the simpler alternative?” and one “what breaks if assumption Z is wrong?”
- **Pass bar:** ≥80% solidly correct
- **Example angles:** dependency direction, API contracts, state ownership, migration/compat, test gaps

## deep

- **Count:** 7–10 questions
- **Focus:** Failure modes, alternatives rejected, security/privacy, performance, migrations/rollbacks, concurrency, edge cases, observability
- **Include:** At least one security-or-abuse question if the diff touches auth, input, network, or secrets; at least one rollback/migration question if schema or persisted data changes
- **Pass bar:** ≥80% solidly correct; vague hand-waving fails even if keywords match
- **Example angles:** TOCTOU, partial failure, idempotency, privilege boundaries, load amplification, data loss paths

## Grading guide

- **Correct:** Accurate relative to the diff; may omit minor details
- **Retry-eligible:** Partial / confused but engaged — one hint, one retry
- **Wrong:** Contradicts the diff, invents files/behavior, or is empty/boilerplate
- Hints may point at a file or concept, never the full answer
- If the human clearly used pasted agent answers without understanding, fail the quiz and say so briefly
