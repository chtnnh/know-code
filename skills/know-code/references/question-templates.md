# Question templates

Adapt to the real diff. Replace placeholders. Cite actual paths.

## Behavior

- In `path`, what is the new behavior of `symbol` when `condition`?
- Which call sites outside the touched files are affected by the signature change in `symbol`?

## Architecture

- Why was this logic placed in `moduleA` instead of `moduleB`?
- What ownership or layering rule does this change reinforce or break?

## Trade-offs

- What simpler approach was available, and what cost does the chosen approach buy?
- What complexity does this add for future readers of `path`?

## Risk

- How can this fail in production, and what would the user/ops see?
- If deploy stops halfway, what state could the system be left in?

## Security / data

- What trust boundary does this cross? What is validated vs trusted?
- What data is newly persisted, logged, or sent over the network?

## Tests

- Which failure mode in the diff is not covered by the new/updated tests?
- What fixture or mock would be required to regression-test this change?
