# Changelog

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
