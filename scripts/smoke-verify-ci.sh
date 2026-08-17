#!/usr/bin/env bash
# CI-shaped verify smoke: after a real commit trailer, strip local seal/gate
# artifacts and assert know-code verify still passes (what Actions sees).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SMOKE="$(mktemp -d)"
export KNOW_CODE_ATTEST_PASSPHRASE="ci-smoke-verify-passphrase"
export KNOW_CODE_ATTEST_HOME="$(mktemp -d)"
KC="$ROOT/packages/cli/dist/index.js"
cleanup() { rm -rf "$SMOKE" "$KNOW_CODE_ATTEST_HOME"; }
trap cleanup EXIT

if [[ ! -f "$KC" ]]; then
  echo "smoke-verify-ci: missing $KC — run npm run build first" >&2
  exit 1
fi

cd "$SMOKE"
git init -b main --template= >/dev/null
git config user.email "smoke-verify@test"
git config user.name "smoke-verify"
# Bare origin so merge-base resolution matches CI (origin/main present).
git init --bare "$SMOKE/remote.git" --template= >/dev/null
git remote add origin "$SMOKE/remote.git"

echo "base" > README.md
git add README.md
git -c commit.gpgsign=false commit -m "init" >/dev/null
git push -u origin main >/dev/null

node "$KC" init --level lite --require-trailer
node "$KC" attest-init
node "$KC" range begin

echo "feature" >> README.md
git add README.md

HASH="$(node "$KC" hash)"
node "$KC" taught --hash "$HASH"

ATTEST_JS="$ROOT/packages/cli/dist/attest.js"
node --input-type=module -e "
  const { writeAnswers } = await import(process.argv[1]);
  writeAnswers(process.cwd(), {
    diffHash: process.argv[2],
    level: 'lite',
    answers: [{ id: 'q1', answer: 'smoke verify' }],
    submittedAt: new Date().toISOString()
  });
" "file://${ATTEST_JS}" "$HASH"

DIGEST="$(node -e "const f=require('fs');const a=JSON.parse(f.readFileSync('.know-code/answers.json','utf8'));console.log(a.answersDigest)")"

node --input-type=module -e "
  import { writeFileSync } from 'node:fs';
  writeFileSync('.know-code/grade-proposal.json', JSON.stringify({
    version: 1,
    diffHash: process.argv[1],
    answersDigest: process.argv[2],
    proposedScore: 1,
    passed: true,
    perQuestion: [{ id: 'q1', score: 1, feedback: 'ok' }],
    rubricVersion: '1',
    gradedBy: 'smoke',
    gradedAt: new Date().toISOString(),
    level: 'lite',
  }, null, 2) + '\n');
" "$HASH" "$DIGEST"

node "$KC" grade --accept --hash "$HASH" --level lite --passphrase "$KNOW_CODE_ATTEST_PASSPHRASE"
node "$KC" pass --level lite --hash "$HASH" --passphrase "$KNOW_CODE_ATTEST_PASSPHRASE"

node "$KC" commit -m "feat: smoke verify feature"

# Mimic Actions: no local trust anchors — only public git history.
rm -f \
  .know-code/gate.json \
  .know-code/range-seal.json \
  .know-code/sealed-head-binding.json \
  .know-code/taught.json \
  .know-code/grade.json \
  .know-code/grade-proposal.json \
  .know-code/answers.json \
  .know-code/quiz.json
printf '%s\n' '{' \
  '  "level": "lite",' \
  '  "baseBranch": "main",' \
  '  "requireTrailer": true,' \
  '  "rangeMode": "auto"' \
  '}' > .know-code/config.json

set +e
OUT="$(node "$KC" verify 2>&1)"
code=$?
set -e
echo "$OUT"
test "$code" -eq 0
echo "$OUT" | grep -q "HEAD trailer verified"

BEFORE="$(git rev-parse HEAD^)"
set +e
WALK="$(node "$KC" verify --from "$BEFORE" 2>&1)"
walk=$?
set -e
echo "$WALK"
test "$walk" -eq 0
echo "$WALK" | grep -q "push walk verified"

# Negative: fake trailer must fail.
git -c commit.gpgsign=false commit --amend --no-verify -m "$(cat <<EOF
feat: smoke verify feature

Know-Code-Verified: $(printf 'a%.0s' {1..64})
EOF
)" >/dev/null

set +e
node "$KC" verify >/dev/null 2>&1
bad=$?
set -e
test "$bad" -ne 0

echo "SMOKE VERIFY CI OK"
