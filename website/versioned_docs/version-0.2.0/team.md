# Team onboarding

Each developer has **local** know-code state (`.know-code/` is gitignored).

## New developer checklist

1. Clone repo
2. `npm i -g @chtnnh/know-code` (or use monorepo `npm run know-code --`)
3. `know-code init --agents cursor` (or your IDE)
4. `know-code attest-init` — **per machine** (passphrase seals)
5. `know-code skills` or `know-code skills --global`
6. Align CI: `know-code init --workflow` sets `requireTrailer: true`

## Attest keys

- Private key: `~/.know-code/attest/<repoId>/` (encrypted)
- Never commit attest material
- Rotating: `know-code attest-init --force` invalidates old seals

## Branch protection

Use `scripts/setup-branch-protection.mjs` (see [CI](./ci.md)) to require the know-code workflow on PRs.

## CI vs local

If CI fails but local push works, check `requireTrailer` — the GitHub Action defaults it to `true` when config is missing.

```bash
know-code config set requireTrailer true
know-code doctor
```
