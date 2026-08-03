#!/usr/bin/env bash
# Isolated end-to-end enforcement smoke (mirrors CI). Safe to run locally.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SMOKE="$(mktemp -d)"
export KNOW_CODE_ATTEST_PASSPHRASE="ci-smoke-attest-passphrase"
export KNOW_CODE_ATTEST_HOME="$(mktemp -d)"
KC="$ROOT/packages/cli/dist/index.js"
cleanup() { rm -rf "$SMOKE" "$KNOW_CODE_ATTEST_HOME"; }
trap cleanup EXIT

cd "$SMOKE"
git init -b main --template= >/dev/null
git config user.email "smoke@test"
git config user.name "smoke"
echo "hi" > README.md
git add README.md
git -c commit.gpgsign=false commit -m "init" >/dev/null

node "$KC" init --level lite
node "$KC" attest-init
node "$KC" range begin

echo "feature" >> README.md
git add README.md
git -c commit.gpgsign=false commit --no-verify -m "feat: smoke feature" >/dev/null

set +e
node "$KC" check
code=$?
set -e
test "$code" -eq 2

node "$KC" questions --json >/dev/null
HASH="$(node "$KC" hash)"
node "$KC" taught --hash "$HASH"

ATTEST_JS="$ROOT/packages/cli/dist/attest.js"
node --input-type=module -e "
  const { writeAnswers } = await import(process.argv[1]);
  writeAnswers(process.cwd(), {
    diffHash: process.argv[2],
    level: 'lite',
    answers: [{ id: 'q1', answer: 'smoke' }],
    submittedAt: new Date().toISOString()
  });
" "file://${ATTEST_JS}" "$HASH"

node --input-type=module -e "
  import { writeFileSync } from 'node:fs';
  const hash = process.argv[1];
  writeFileSync('.know-code/gate.json', JSON.stringify({
    version: 1,
    diffHash: hash,
    level: 'lite',
    passedAt: new Date().toISOString(),
    commitRange: 'x',
    baseRef: 'y',
    headRef: 'z',
  }, null, 2) + '\n');
" "$HASH"

set +e
node "$KC" check
forge=$?
set -e
test "$forge" -eq 2
rm -f .know-code/gate.json

node "$KC" grade --score 1 --hash "$HASH" --level lite
node "$KC" pass --level lite --hash "$HASH"
node "$KC" check
node "$KC" range seal

set +e
KNOW_CODE_HOOK_FORMAT=cursor node "$KC" taught --skip
hook=$?
set -e
test "$hook" -ne 0

echo "SMOKE OK"
