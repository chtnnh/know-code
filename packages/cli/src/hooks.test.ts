import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  gitGateHookIsCurrent,
  gitGateHookScript,
  gitHooksNeedUpgrade,
  installGitHooks,
} from "./hooks.js";
import { gitHooksDir } from "./paths.js";

describe("gitGateHookScript", () => {
  it("distinguishes gate deny from missing CLI", () => {
    const script = gitGateHookScript();
    assert.match(script, /run_check \|\| rc=\$\?/);
    assert.match(script, /rc -eq 127/);
    assert.match(script, /exit "\$rc"/);
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
