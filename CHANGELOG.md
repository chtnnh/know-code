# Changelog

## 0.1.4

### Range workflow (less cumbersome)
- **`know-code range begin`** — pin merge-base; one quiz covers all commits until `range seal`
- **`know-code range seal`** — default receipt mode (no history rewrite); optional **`--rewrite`** stamps `Know-Code-Verified` on every commit in range (force-push required)
- Cumulative **range hash** (`fromOid...HEAD` + staged) used when a range session is active
- Config: `rangeMode` (`auto`|`index`|`range`), `rangeSeal` (`receipt`|`rewrite`)

### Question quota
- **`know-code questions`** — agent runs before writing `quiz.json`; `ask` enforces minimum count from diff size, languages, commit count, and level

### Config layering
- **`~/.know-code/config.json`** — user defaults (optional)
- **`.know-code/config.json`** — per-developer repo settings (gitignored; created by `know-code init`)
- Attest keys live under **`~/.know-code/attest/`** only (never committed)
- **`know-code config`** — show merged effective settings

### Enforcement (from earlier 0.1.4 work)
- Human **Ed25519 attest seals** on `taught` / `grade` / `pass` / `range-seal` (`requireAttest: true` default)
- `know-code pass` requires taught + answers + grade; `KNOW_CODE_OVERRIDE` needs TTY `know-code override`

## 0.1.3

### Package
- Add `packages/cli/README.md` so the npm package page has documentation
- `know-code skills [--global]` wraps `npx skills add chtnnh/know-code` for project or user-global skill install
- Release workflow uses npm Trusted Publishing (OIDC) — no `NPM_TOKEN`

### Docs
- Document global skill install (`--global` / harness home dirs)

## 0.1.2

### Package
- Published as **`@chtnnh/know-code`** (unscoped `know-code` is blocked by npm as too similar to `knowcode`). Binary remains `know-code`.

### CLI
- `know-code commit` remains the supported path for `Know-Code-Verified` trailers
- `know-code init --workflow` writes a consumer GitHub Actions workflow using `chtnnh/know-code/action@v0.1.2`
- `know-code ask --timeout <seconds>` (default 1800) exits if the browser form is not submitted
- `know-code verify` checks the HEAD trailer first; skips full-history scans when on the base tip
- Clearer init next-steps pointing at https://kc.chtnnhfoundation.org

### Hooks
- Tighter Cursor `beforeShellExecution` matcher (requires a real `git`/`gh`/`glab` invocation)
- `check-shell.sh` gates only the parsed command field (no raw-stdin substring false positives)
- `KNOW_CODE_OVERRIDE=1` appends to `.know-code/override.log` (gitignored; CI still requires trailers)

### Action & CI
- Composite action accepts `version` input (default `^0.1.2`)
- Dogfood workflow continues to build the in-repo CLI
- Tag-triggered `release` workflow prepares npm publish + GitHub Release (`NPM_TOKEN`)

### Docs
- Docusaurus site for https://kc.chtnnhfoundation.org (GitHub Pages)
- README rewritten around teach → quiz → `know-code commit` → CI

### Tooling
- `scripts/setup-branch-protection.mjs` to require `ci` + `know-code` checks on `main`
- Tests for gate matching, hash stability, and trailer verification helpers

## 0.1.0

- Initial CLI, skills, hooks, browser quiz, and CI trailer verification
