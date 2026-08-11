import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  bundledHooksDir,
  gitGateHookIsCurrent,
  gitGateHookScript,
  gitHooksNeedUpgrade,
  installGitHooks,
} from "./hooks.js";
import { gitHooksDir } from "./paths.js";

describe("check-shell.sh (agent hooks)", () => {
  it("passes --push to know-code check for git push commands", () => {
    const script = readFileSync(
      join(bundledHooksDir(), "check-shell.sh"),
      "utf8",
    );
    assert.match(script, /is_push_only_ship_cmd/);
    assert.match(script, /compound_ship_cmd/);
    assert.match(script, /git_config_env_set/);
    assert.ok(script.includes("gh[[:space:]]+pr[[:space:]]+create"));
    assert.ok(script.includes("glab[[:space:]]+mr[[:space:]]+create"));
    assert.match(script, /check_args\+=\(--push\)/);
    assert.match(script, /\$\{check_args\[@\]\}/);
    assert.match(script, /bypasses_git_hooks/);
    assert.match(script, /amends_commit/);
    assert.match(script, /auto_stages_commit/);
    assert.match(script, /compound_add_commit/);
    assert.match(script, /commit_has_pathspec/);
    assert.match(script, /reuses_message/);
    assert.match(script, /commit_only/);
    assert.match(script, /fixup_squash/);
    assert.match(script, /adds_files/);
    assert.match(script, /implicit_commit/);
    assert.match(script, /stash_mutate/);
    assert.match(script, /reset_hard/);
    assert.ok(script.includes("hooksPath"));
    assert.match(script, /hook bypass/);
  });
});

describe("gitGateHookScript", () => {
  it("distinguishes gate deny from missing CLI and unsets KNOW_CODE_COMMIT", () => {
    const script = gitGateHookScript();
    assert.match(script, /run_check \|\| rc=\$\?/);
    assert.match(script, /rc -eq 127/);
    assert.match(script, /exit "\$rc"/);
    assert.match(script, /unset KNOW_CODE_COMMIT/);
    assert.match(script, /--push/);
    assert.match(script, /pre-push/);
    assert.match(script, /\$\{#CHECK_ARGS\[@\]\}/);
  });

  it("detects outdated hooks that always print CLI not found", () => {
    const outdated = `#!/usr/bin/env bash
# know-code gate
if run_check; then exit 0; fi
echo "know-code: CLI not found"
exit 1
`;
    assert.equal(gitGateHookIsCurrent(outdated), false);
    assert.equal(gitGateHookIsCurrent(gitGateHookScript()), true);
  });
});

describe("installGitHooks", () => {
  it("writes current hooks and upgrade check passes", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-hooks-install-"));
    try {
      execFileSync("git", ["init", "-b", "main", "--template="], {
        cwd: repo,
        stdio: "ignore",
      });
      const hooksDir = gitHooksDir(repo);
      assert.equal(gitHooksNeedUpgrade(repo), true);
      installGitHooks(repo);
      assert.equal(gitHooksNeedUpgrade(repo), false);
      const prePush = readFileSync(join(hooksDir, "pre-push"), "utf8");
      assert.equal(gitGateHookIsCurrent(prePush), true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
