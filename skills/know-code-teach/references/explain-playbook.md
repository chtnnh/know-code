# Explain playbook

Keep each beat to a few sentences. Cite real paths when known.

## 1. Intent

State the user-visible or system-visible outcome. Example: “We need webhook retries so failed deliveries recover without duplicate charges.”

## 2. Touch map

List modules/files likely to change and their roles. Flag areas you will avoid.

## 3. Approach

Describe the design as a story: data flow, control flow, ownership. Mention interfaces you will add or change.

## 4. Trade-offs

Name 1–3 alternatives (simpler hack, different library, bigger rewrite). For each: cost vs benefit. Be honest about complexity you are introducing.

## 5. Risks

Call out failure modes, security/privacy, migrations, backward compatibility, and how you will validate (tests, manual check, metrics).

## 6. Checkpoint

Ask for a decision only when it matters. Examples:

- Sync vs async?
- Persist in DB vs cache?
- Break API now vs compat shim?

## While coding

After each coherent chunk (not every tiny edit):

- What just changed
- Why that order
- What is next
- Anything surprising you discovered in the code

If plans change, say so immediately and update the touch map / risks.

## Anti-patterns

- Dumping a full design doc before any code when a short brief would do
- Explaining language basics the human already knows
- Hiding trade-offs to avoid debate
- Teaching and then refusing to adjust when the human redirects
