---
sidebar_position: 2
title: How it works
---

# How it works

```text
attest-init → range begin → teach → taught (seal) → questions → ask
  → grade (seal) → pass (seal) → range seal → commit / push → CI
```

## Range mode

`know-code range begin` pins merge-base. **One quiz** covers the cumulative diff `fromOid...HEAD` (+ staged). Human seals once; `range seal` finishes the session.

| `rangeSeal` | Behavior |
|-------------|----------|
| `receipt` (default) | Signed `range-seal.json`; HEAD should carry trailer for CI |
| `rewrite` | `range seal --rewrite` stamps every commit (force-push) |

## Attestation

`attest-init` creates a passphrase key under `~/.know-code/attest/`. `taught`, `grade`, `pass`, and `range seal` produce Ed25519 signatures agents cannot forge without the passphrase.

## Question quota

`know-code questions` computes the minimum quiz size from level, lines/files changed, commit count, languages, and sensitive paths. `ask` rejects under-sized quizzes.

## Config

- `~/.know-code/config.json` — optional user defaults
- `.know-code/config.json` — local repo settings (gitignored; each developer runs `know-code init`)
- `~/.know-code/attest/` — passphrase-encrypted attest keys (never committed)
- `know-code config` — show merged effective settings
