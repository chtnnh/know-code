# Changelog

## Unreleased

### CI verify on push (stacked-run walker)
- **`know-code verify --from <oid>`** walks `from..HEAD`, splits by `Know-Code-Verified` hash, and checks each run as a historical tree-pair (parent-of-first tree → last non-merge). Trailerless merges attach to the run but are not the hash tip, so a GitHub merge commit still matches after `main` moved. Linear commits without a trailer fail closed. One-non-merge runs also accept the empty-tree (index) hash of that feature tip.
- **Workflow + `init --workflow` + composite action** trigger on `push` to the base branch and pass `github.event.before`. PR verify is unchanged (`head.sha`, no `--from`). All-zeros `before` skips the walk.
- **Docs** describe the push walk and stop claiming verify cannot run after merge.

## 0.3.0

### Security — comprehensive exploit hardening (E01–E28)

Major release closing agent TOCTOU and hook-bypass classes discovered after 0.2.1.

#### Kernel
- **Unstaged tracked edits close the gate** — index-only hashing no longer leaves the gate open while working-tree edits await `git add` / `-a`
- **`gatedTreeOid` mandatory** — legacy `gate.json` without it never opens for shipping; re-run `know-code pass` after upgrade
- **Shipping requires index tree === `gatedTreeOid`** — blocks partial commits and post-pass tree drift before push
- **Push requires `HEAD^{tree}` === `gatedTreeOid`** — amend/`--no-edit` with a stale trailer cannot ship a new tree
- **Cleanliness via `git diff --quiet`** — never porcelain through `git().trim()` (which corrupted ` M file` status lines)
- **`know-code commit` / `amend` reject pathspecs** — except gated slices: `know-code commit -m "…" -- <files>` is allowed only while the index tree still equals `gatedTreeOid` (see Sliced batches below)

#### Sliced batches & DevEx
- **Sliced batch commits** — quiz once, then land a staged batch as multiple `know-code commit -m "…" -- <files>` slices; the gate stays open under commit drift while the index tree matches `gatedTreeOid` and no unstaged tracked edits exist
- **`pass` / `ask` preflight** — refuse to run over unstaged tracked edits (quizzing work that isn't in the hash)
- **`know-code hash --explain`** — shows which staged files feed the hash and which unstaged/untracked files are excluded
- **`status` staleness detail** — stale artifacts show `artifact hash vs current hash` plus the likely cause instead of a bare "stale"
- **`doctor` local-cli check** — warns when bare `know-code` on PATH is a stale global instead of the local monorepo build
- **Actionable gate messages** — "Gate seal invalid" split into real causes (unstaged edits, staged tree differs, HEAD moved after seal)
- **`kc` bin alias** — every `know-code` command is also available as `kc` (`kc status`, `kc commit -m "…"`); no popular CLI ships a `kc` binary, and user shell aliases (e.g. `alias kc=kubectl`) shadow it harmlessly

#### Hook-safe partial commits (three git-interaction bugs)
- **`GIT_INDEX_FILE` stripped from kernel git subprocesses** — during `git commit -- <paths>` git exports a temp slice-only index to hooks; the pre-commit check now always hashes the real index (also kills an env-spoofing vector)
- **`write-tree` lock fallback** — git holds `.git/index.lock` mid-commit; `materializedTreeOid` retries against a temp copy of the index instead of silently returning the empty tree
- **`COMMIT_EDITMSG` pre-written by `know-code commit`** — git only writes it *after* the pre-commit hook, so the grounded pending-trailer check could never pass on the first commit after `pass`
- **Pre-push accepts the seal-hash trailer** — after `range seal --rewrite`, HEAD trailers carry the seal hash; `check --push` now accepts it at exactly `sealedHeadOid` with a grounded seal — and only in push mode: the seal never authorizes a new pending commit through pre-commit
- **Fresh `pass` consumes superseded range seals** — a seal/binding from a previous batch permanently blocked any later non-range commit from shipping (with attest on, nothing else ever cleared it); a successful human pass now removes seal artifacts pinned to a non-HEAD commit or to a tip already reachable from `origin/<baseBranch>` (push happened, seal consumed) — only a just-sealed *unpushed* tip at HEAD stays rewrite-open

#### CI & release
- **`know-code` verify workflow is PR-only** — on a push to the base branch there is no merge-base ahead of HEAD, so grounded verification is impossible by construction; `init --workflow` generates PR-only triggers
- **Docs deploy on release tags only** — the site always matches a published CLI version

#### Agent hooks (`check-shell.sh` + `gate-cmd.ts`)
Deny in agent context (humans stage/commit outside the agent; agents use `know-code commit` / `amend`):

| Denied | Reason |
|--------|--------|
| `git commit --amend` | Stale trailer / tree rewrite |
| `git commit -a/--all/-u/--update` | Auto-stage TOCTOU |
| `git commit` with pathspecs / `-C` / `--reuse-message` / `--fixup` / `--squash` | Stale trailer or silent stage |
| `git add` | Stage unreviewed work |
| `git add && git commit` | Compound TOCTOU |
| `git push --no-verify` / hooksPath on push | Skip pre-push |
| `git merge` / `cherry-pick` / `revert` / `rebase` | Implicit commits |
| `git stash apply/pop/branch` | Reintroduce unreviewed trees |
| `git reset --hard` | Rewrite working tree |

#### Artifacts & config
- **`enforcePipeline` defaults to `true`** — teaching + quiz pipeline required before pass
- **Unsigned `sealed-head-binding.json` ignored** when `requireAttest: false` (cannot bind HEAD alone)
- **`doctor --strict`** — fails when git hooks outdated/missing or agent hooks absent; warns on `requireAttest: false` and legacy gates
- **`ship` runs `doctor --strict` first**

#### Tests
- Table-driven **exploit matrix** (`exploit-matrix.test.ts`) covering E01–E28 helpers + kernel cases
- **Sliced-commit e2e through real hooks** — pathspec commits with git's temp index and held `index.lock` against an installed pre-commit hook
- **Adversarial suite** — forged trailers, agent-minted tokens, stale seals, post-seal drift

### Breaking changes
1. Re-run **`know-code pass`** once if `gate.json` lacks `gatedTreeOid`
2. Agents cannot use raw `git add` / `git merge` / etc. — use know-code workflow
3. **`enforcePipeline: true`** by default
4. Prefer **`know-code doctor --strict`** in CI / before ship
5. **Verify workflow triggers on `pull_request` only** — remove `push: branches` from existing `.github/workflows/know-code.yml` (grounded verification has no merge-base on pushes to the base branch)

## 0.2.1

### Enforcement kernel (security)
- **Unified shipping checks** — `check` / `commit` / `amend` / `range seal` / `pipeline` share `enforcement.ts` (`isGateOpenForShipping`, trailer policy, tree stability)
- **Verify no longer accepts arbitrary HEAD trailers** — candidates are grounded (index, merge-base..HEAD, range-seal, local commit-drift with valid `gate.json` + `gatedTreeOid`)
- **`KNOW_CODE_COMMIT` env bypass removed** — pre-commit `requireTrailer` accepts a grounded trailer in `.git/COMMIT_EDITMSG` (no forgeable `.know-code` token); git hooks `unset KNOW_CODE_COMMIT`
- **Pending commit ≠ HEAD** — HEAD trailer alone cannot authorize a trailerless next commit while `COMMIT_EDITMSG` differs
- **`check --push`** — pre-push ignores `COMMIT_EDITMSG`; only HEAD trailers authorize push
- **`amend` preserves `--amend`** and HEAD message when `-m` omitted
- **`range-seal` bound to `sealedHeadOid`** — verify and rewrite-open ignore stale seals after new commits; rewrite-open requires a clean index (no new staged work)
- **Override-allow must be Ed25519-sealed** — agent-minted unsigned `.know-code/override-allow.json` is rejected; `know-code commit` peeks without double-consuming before pre-commit
- **`range seal` receipt mode** hard-fails if HEAD lacks a valid trailer; stores `gatePassHash` when sealing under commit drift
- **`--require-range-trailers`** rejects uniform trailer hashes that do not match a computed diff hash
- **Corrupt JSON** in pipeline/status/commit/amend/range surfaces as blockers (no crash)
- **Legacy commit-drift** without `gatedTreeOid` removed — re-run `know-code pass` once after upgrading
- **`ship`** lists `range seal` before `git push`
- **Test coverage** — adversarial bypass suite, e2e workflows, command happy/sad paths (`runVerify`, hooks, config, quiz, doctor, reset, range)
- **Agent `check-shell.sh`** — `git push`, `gh pr create`, and `glab mr create` run `know-code check --push` (HEAD trailers only)

## 0.2.0

### Agent-proposed grading (flagship)
- **`grade-proposal.json`** — agent scores answers after `ask`; human reviews with **`know-code grade --review`**
- **`know-code grade propose --json`** — rubric context for agents
- Sealed **`grade.json`** binds `proposalDigest`, `humanAdjusted`, `finalScore`
- **`allowSelfScore`** config (default false); deprecates honor-system `grade --score`
- Skill reference: `grading-rubric.md`

### Guided UX
- **`know-code doctor`** — attest, hooks, pipeline, port checks
- **`status --next`** — `nextStep` + `blockers[]` in status output
- **`know-code ship`** — checklist before push
- **`know-code range continue --yes`** — start new range after seal (prompt, not silent auto)

### CLI robustness
- **`know-code quiz validate`** · **`questions --template`**
- **`config set <key> <value>`** · expanded **`init`** flags
- **`commit -F`** / **`--message`** · **`know-code amend`**
- **`know-code reset`** · **`range abort --keep-seal`**
- **`hooks install`** · **`hooks uninstall`** — refresh or remove git/agent hooks
- **`verify --range-seal`** · **`requireTrailer`** wired in check
- **Git hooks** — pre-commit/pre-push preserve `know-code check` exit code (no false "CLI not found" on gate deny); `doctor` flags outdated hooks
- **Commit drift** — gate stays valid after `know-code commit` when tree unchanged (`gatedTreeOid`); verify accepts `head-trailer` hash; **`range seal`** and **`range status`** honor commit drift like `check`
- Better deny messages with suggested next command
- Corrupt JSON errors for gate/taught/grade/answers

### Docs
- New: quiz, grading, workflows, hooks, team, tutorial pages
- Expanded troubleshooting

### CI / action
- Action input **`require-range-trailers`**
- Docs build in main CI
- `action/README.md` · `scripts/bump-release-pins.mjs`

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

### Fixes (post-release)
- **`verify --require-range-trailers`** reads `range-seal.json` after `range seal --rewrite`
- **`check`** prefers current gate over stale sealed range; honors sealed rewrite for push
- **Git hooks** resolve monorepo `packages/cli/dist/index.js` before global `know-code`
- **`commit -m`** parsing forwards `-m` flag correctly
- **Docs:** config reference page, aligned CLI/skills/CI/troubleshooting across site and READMEs

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
