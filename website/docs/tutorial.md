# 5-minute first gated commit

Assumes a git repo with at least one commit on `main`.

## 1. Install

```bash
npm i -g @chtnnh/know-code
know-code init
know-code attest-init
know-code skills
```

## 2. Make a change

Edit a file, then:

```bash
git add .
```

## 3. Teach + seal

After the agent explains the change:

```bash
know-code taught
```

## 4. Quiz

```bash
know-code questions --template > .know-code/quiz.json
# edit prompts in quiz.json
know-code quiz validate
know-code ask
```

Answer in the **browser tab** that opens.

## 5. Grade + pass

Agent writes `grade-proposal.json`. Then:

```bash
know-code grade --review
know-code pass
```

## 6. Commit

```bash
know-code commit -m "docs: my first gated commit"
```

## 7. Verify

```bash
know-code status
know-code doctor
git push    # if remote configured
```

Expected: `commit/push allowed: yes` after pass; `doctor` exits 0 when ready.

## Stuck?

```bash
know-code status --json
```

See [troubleshooting](./troubleshooting.md).
