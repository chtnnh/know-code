---
sidebar_position: 3
title: Configuration
---

# Configuration

know-code merges settings from two JSON files (repo wins over home) and a few environment variables.

```bash
know-code config          # human-readable effective settings
know-code config --json   # machine-readable (paths, quiz scope, attest status)
```

## Files

| Path | Committed? | Purpose |
|------|------------|---------|
| `~/.know-code/config.json` | No (your machine) | Optional defaults for all repos |
| `.know-code/config.json` | **No** (gitignored) | Per-developer repo settings; created by `know-code init` |
| `~/.know-code/attest/<repoId>/` | No | Passphrase-encrypted Ed25519 keys + `meta.json` (never in repo config) |

Each developer runs `know-code init` and `know-code attest-init` on their machine. Nothing under `.know-code/` except committed hook scripts should be shared via git.

## Config fields

| Field | Type | Default | Set by `init`? | Description |
|-------|------|---------|----------------|-------------|
| `level` | `lite` \| `standard` \| `deep` | `standard` | `--level` | Quiz difficulty and minimum question count |
| `baseBranch` | string | `main` | `--base-branch` | Branch used for merge-base and CI alignment |
| `requireTrailer` | boolean | `false` | `--require-trailer` | When true, local/CI verify expects `Know-Code-Verified` trailers |
| `rangeMode` | `auto` \| `index` \| `range` | `auto` | manual JSON | How quiz hash scope is chosen (see below) |
| `rangeSeal` | `receipt` \| `rewrite` | `receipt` | manual JSON | Default `range seal` behavior when `--rewrite` omitted |
| `requireAttest` | boolean | `true` | manual JSON | When true, `taught` / `grade` / `pass` / `range seal` need Ed25519 seals |
| `requireGradeProposal` | boolean | `true` | manual JSON | Require agent `grade-proposal.json` before human grade |
| `allowSelfScore` | boolean | `false` | manual JSON | Allow legacy `grade --score` without proposal |
| `enforcePipeline` | boolean | **`true`** (0.3.0) | manual JSON | Require sealed taught (+ quiz flow) before `ask` / pass |

### `rangeMode`

| Value | Quiz hash |
|-------|-----------|
| `auto` | **Range** cumulative hash when `know-code range begin` session is active; otherwise **index** hash (empty-tree → index tree) |
| `index` | Always index hash (single-commit / staged-only workflow) |
| `range` | Always range hash from merge-base (even without an active session) |

### `rangeSeal`

| Value | `know-code range seal` |
|-------|------------------------|
| `receipt` | Writes signed `.know-code/range-seal.json`; HEAD should carry trailer for CI |
| `rewrite` | Same receipt + rewrites commit messages in range with `Know-Code-Verified: <hash>` (requires `git push --force-with-lease`) |

CLI flag `range seal --rewrite` overrides config for that invocation.

### `requireAttest`

When `true` (default), agents cannot forge `taught.json`, `grade.json`, `gate.json`, or `range-seal.json` without your attest passphrase. Set `false` only for local experiments — not recommended for production dogfooding.

## Environment overrides

| Variable | Overrides |
|----------|-----------|
| `KNOW_CODE_LEVEL` | `level` |
| `KNOW_CODE_ATTEST_PASSPHRASE` | Non-interactive attest sealing (human terminal only; denied in agent hooks) |
| `KNOW_CODE_ATTEST_HOME` | Directory for `~/.know-code/attest` (default `~/.know-code/attest`) |
| `KNOW_CODE_HOME` | Directory for home config (default `~/.know-code`) |
| `KNOW_CODE_OVERRIDE=1` | Emergency bypass after `know-code override` on a TTY (denied in agent hooks and CI) |
| `KNOW_CODE_QUIZ_PORT` | Default port for `know-code ask` |
| `KNOW_CODE_QUIZ_TIMEOUT` | Seconds to wait for browser quiz (default `1800`) |

## Example home config

```json
{
  "level": "standard",
  "rangeMode": "auto",
  "rangeSeal": "receipt",
  "requireAttest": true
}
```

## Example repo config (local, gitignored)

```json
{
  "level": "standard",
  "baseBranch": "main",
  "requireTrailer": true,
  "rangeMode": "auto",
  "rangeSeal": "rewrite",
  "requireAttest": true
}
```

## `init` flags

```bash
know-code init \
  --level standard \
  --base-branch main \
  --require-trailer \
  --agents claude,cursor,codex \
  --workflow
```

`init` writes `.know-code/config.json`, updates `.gitignore` to ignore `.know-code/`, and installs git pre-commit/pre-push hooks. It does **not** set `rangeMode`, `rangeSeal`, or `requireAttest` — add those manually or via home config.
