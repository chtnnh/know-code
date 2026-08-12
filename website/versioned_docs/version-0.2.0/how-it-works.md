---
sidebar_position: 2
title: How it works
---

# How it works

```text
attest-init → range begin → teach → taught (seal) → questions → ask
  → grade (seal) → pass (seal) → commit(s) → range seal → push → CI
```

## Hash scope

| Mode | When | Hash covers |
|------|------|-------------|
| **Index** | `rangeMode: index`, or `auto` without active session | Empty-tree → current index (staged + HEAD tree) |
| **Range** | `range begin` active, or `rangeMode: range` | Cumulative diff `fromOid...HEAD` + staged |

Use `know-code hash` and `know-code config --json` to see the active scope.

## Range mode

`know-code range begin` pins merge-base. **One quiz** covers every commit until `range seal`.

| `rangeSeal` | Behavior |
|-------------|----------|
| `receipt` (default) | Signed `.know-code/range-seal.json`; HEAD should carry trailer for CI |
| `rewrite` | `range seal --rewrite` stamps `Know-Code-Verified: <hash>` on every commit in range (`git push --force-with-lease`) |

After `range seal --rewrite`, `check` allows push when the sealed range + gate match. CI uses default `know-code verify`, which accepts a range-hash trailer on HEAD even when the index hash differs — no rewrite required for squash workflows.

Use `verify --require-range-trailers` only when every commit in a batch must carry the same trailer (strict, non-squash teams).

## Attestation

`attest-init` creates a passphrase key under `~/.know-code/attest/<repoId>/`. Public key lives in `meta.json` beside the encrypted private key — **not** in repo config.

`taught`, `grade`, `pass`, and `range seal` produce Ed25519 signatures agents cannot forge without the passphrase.

## Question quota

`know-code questions` computes the minimum quiz size from level, lines/files changed, commit count, languages, and sensitive paths. `ask` rejects under-sized quizzes.

## Configuration

See the dedicated [Configuration](config.md) page for all fields, defaults, env overrides, and examples.

Quick summary:

- `~/.know-code/config.json` — optional user defaults
- `.know-code/config.json` — local repo settings (gitignored; from `know-code init`)
- `know-code config` — effective merged settings

## Git hooks

Pre-commit and pre-push run `know-code check`. In this monorepo, hooks prefer `packages/cli/dist/index.js` over a global `know-code` on PATH so dogfooding uses the built CLI.
