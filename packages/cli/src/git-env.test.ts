import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  configValueBypassesHooks,
  gitConfigEnvOverridesSet,
  sanitizedGitProcessEnv,
} from "./git-env.js";
import { hasStagedChanges, knowCodeGitEnv } from "./git.js";
import { materializedTreeOid } from "./gate.js";
import { git, withTempRepo, writeFile } from "./test-helpers.js";

describe("git-env", () => {
  it("configValueBypassesHooks detects hooksPath and include.path", () => {
    assert.equal(configValueBypassesHooks("core.hooksPath=/dev/null"), true);
    assert.equal(configValueBypassesHooks("include.path=/tmp/x"), true);
    assert.equal(configValueBypassesHooks("user.name=x"), false);
  });

  it("sanitizedGitProcessEnv strips GIT_CONFIG_* overrides", () => {
    const env = sanitizedGitProcessEnv({
      PATH: "/bin",
      GIT_CONFIG_GLOBAL: "/tmp/x",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      HOME: "/home/u",
    });
    assert.equal(env.PATH, "/bin");
    assert.equal(env.HOME, "/home/u");
    assert.equal(env.GIT_CONFIG_GLOBAL, undefined);
    assert.equal(env.GIT_CONFIG_COUNT, undefined);
    assert.equal(env.GIT_CONFIG_KEY_0, undefined);
  });

  it("gitConfigEnvOverridesSet detects live overrides", () => {
    assert.equal(
      gitConfigEnvOverridesSet({ GIT_CONFIG_SYSTEM: "/tmp/x", PATH: "/bin" }),
      true,
    );
    assert.equal(gitConfigEnvOverridesSet({ PATH: "/bin" }), false);
  });

  it("knowCodeGitEnv drops GIT_INDEX_FILE only", () => {
    const env = knowCodeGitEnv({ PATH: "/bin", GIT_INDEX_FILE: "/tmp/idx" });
    assert.equal(env.GIT_INDEX_FILE, undefined);
    assert.equal(env.PATH, "/bin");
    const untouched = { PATH: "/bin" };
    assert.equal(knowCodeGitEnv(untouched), untouched);
  });

  it("kernel ignores GIT_INDEX_FILE temp index during partial commits", () => {
    const { root, cleanup } = withTempRepo("kc-idxfile-");
    const prev = process.env.GIT_INDEX_FILE;
    try {
      writeFile(root, "base.txt", "base\n");
      git(root, ["add", "base.txt"]);
      git(root, ["commit", "-m", "base"]);

      // Stage a two-file batch (the gated tree).
      writeFile(root, "slice-a.txt", "a\n");
      writeFile(root, "slice-b.txt", "b\n");
      git(root, ["add", "slice-a.txt", "slice-b.txt"]);
      const fullTree = materializedTreeOid(root);

      // Simulate git's partial-commit hook env: temp index = HEAD + slice-a only.
      const tempIndex = join(root, ".git", "kc-temp-index");
      const hookEnv = { ...process.env, GIT_INDEX_FILE: tempIndex };
      execFileSync("git", ["read-tree", "HEAD"], { cwd: root, env: hookEnv });
      execFileSync("git", ["add", "slice-a.txt"], { cwd: root, env: hookEnv });
      const sliceTree = execFileSync("git", ["write-tree"], {
        cwd: root,
        env: hookEnv,
        encoding: "utf8",
      }).trim();
      assert.notEqual(sliceTree, fullTree);

      // With GIT_INDEX_FILE exported (as in a pre-commit hook), the kernel
      // must still see the real index, not the slice.
      process.env.GIT_INDEX_FILE = tempIndex;
      assert.equal(materializedTreeOid(root), fullTree);
      assert.equal(hasStagedChanges(root), true);

      // During the commit git also holds .git/index.lock — write-tree must
      // still resolve the real tree (temp-copy fallback).
      const lockPath = join(root, ".git", "index.lock");
      execFileSync("touch", [lockPath]);
      try {
        assert.equal(materializedTreeOid(root), fullTree);
      } finally {
        execFileSync("rm", ["-f", lockPath]);
      }
    } finally {
      if (prev === undefined) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = prev;
      cleanup();
    }
  });
});
