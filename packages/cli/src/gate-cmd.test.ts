import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_MATCHER,
  agentHookAddsFiles,
  agentHookAmendsCommit,
  agentHookAutoStagesCommit,
  agentHookBypassesGitHooks,
  agentHookCommitHasPathspec,
  agentHookFixupSquash,
  agentHookImplicitCommit,
  agentHookResetHard,
  agentHookReusesMessage,
  agentHookStashMutate,
  gitCommitArgsBypassHooks,
  gitCommitArgsHavePathspec,
  isCompoundAddCommit,
  isCompoundShipCommand,
  isPushOnlyShipCmd,
  shouldGate,
} from "./gate-cmd.js";

describe("shouldGate", () => {
  it("gates real git commit/push", () => {
    assert.equal(shouldGate("git commit -m 'x'"), true);
    assert.equal(shouldGate("git push origin HEAD"), true);
    assert.equal(shouldGate("cd foo && git commit -am 'x'"), true);
    assert.equal(
      shouldGate("git -c core.hooksPath=/dev/null commit -m x"),
      true,
    );
    assert.equal(
      shouldGate("GIT_CONFIG_GLOBAL=/tmp/x git commit -m x"),
      true,
    );
  });

  it("gates add / implicit commits / stash / reset --hard", () => {
    assert.equal(shouldGate("git add ."), true);
    assert.equal(shouldGate("git pull origin main"), true);
    assert.equal(shouldGate("git merge feature"), true);
    assert.equal(shouldGate("git cherry-pick abc"), true);
    assert.equal(shouldGate("git rebase main"), true);
    assert.equal(shouldGate("git stash apply"), true);
    assert.equal(shouldGate("git reset --hard HEAD"), true);
  });

  it("push-only vs compound ship commands", () => {
    assert.equal(isPushOnlyShipCmd("git push origin HEAD"), true);
    assert.equal(isPushOnlyShipCmd("git commit -m x && git push"), false);
    assert.equal(isCompoundShipCommand("git commit -m x && git push"), true);
    assert.equal(isCompoundShipCommand("git commit -m x"), false);
    assert.equal(isCompoundAddCommit("git add . && git commit -m x"), true);
    assert.equal(isCompoundAddCommit("git commit -m x"), false);
  });

  it("gates gh/glab PR creation", () => {
    assert.equal(shouldGate("gh pr create --title t"), true);
    assert.equal(shouldGate("glab mr create"), true);
  });

  it("does not gate incidental substrings in unrelated commands", () => {
    assert.equal(
      shouldGate('node -e "console.log(\'mention git commit in text\')"'),
      false,
    );
    assert.equal(shouldGate("echo gitcommit"), false);
    assert.equal(shouldGate("cat quiz.json"), false);
    assert.equal(shouldGate(""), false);
  });

  it("does not treat prose-only heredoc content as the command", () => {
    const cmd = `cat <<'EOF'
Answer: use git commit after the quiz
EOF`;
    assert.equal(shouldGate(cmd), false);
  });
});

describe("agentHookBypassesGitHooks", () => {
  it("denies --no-verify and -n on git commit", () => {
    assert.equal(agentHookBypassesGitHooks("git commit --no-verify -m x"), true);
    assert.equal(agentHookBypassesGitHooks("git commit -n -m x"), true);
    assert.equal(agentHookBypassesGitHooks("git commit -an 'x'"), true);
    assert.equal(
      agentHookBypassesGitHooks('git commit -m "x" --no-verify'),
      true,
    );
    assert.equal(agentHookBypassesGitHooks('git commit -m "x" -n'), true);
    assert.equal(
      agentHookBypassesGitHooks(
        "git -c core.hooksPath=/dev/null commit -m trailerless",
      ),
      true,
    );
    assert.equal(
      agentHookBypassesGitHooks("GIT_CONFIG_GLOBAL=/tmp/x git commit -m x"),
      true,
    );
    assert.equal(
      agentHookBypassesGitHooks(
        "git -c include.path=/tmp/evil.conf commit -m x",
      ),
      true,
    );
  });

  it("denies --no-verify on git push", () => {
    assert.equal(
      agentHookBypassesGitHooks("git push --no-verify origin HEAD"),
      true,
    );
    assert.equal(
      agentHookBypassesGitHooks(
        "git -c core.hooksPath=/tmp/empty push origin HEAD",
      ),
      true,
    );
  });

  it("allows normal git commit and unrelated commands", () => {
    assert.equal(agentHookBypassesGitHooks("git commit -m x"), false);
    assert.equal(agentHookBypassesGitHooks("git push"), false);
    assert.equal(
      agentHookBypassesGitHooks('git commit -m "mentions --no-verify in msg"'),
      false,
    );
  });
});

describe("agentHookAmendsCommit", () => {
  it("denies raw git commit --amend", () => {
    assert.equal(agentHookAmendsCommit("git commit --amend --no-edit"), true);
    assert.equal(agentHookAmendsCommit("git commit -m x"), false);
    assert.equal(
      agentHookAmendsCommit('git commit -m "mentions --amend in prose"'),
      false,
    );
  });
});

describe("agentHookAutoStagesCommit", () => {
  it("denies git commit -a/--all/-u/--update (auto-stage TOCTOU)", () => {
    assert.equal(agentHookAutoStagesCommit("git commit -a -m x"), true);
    assert.equal(agentHookAutoStagesCommit("git commit -am x"), true);
    assert.equal(agentHookAutoStagesCommit("git commit --all -m x"), true);
    assert.equal(agentHookAutoStagesCommit("git commit -u -m x"), true);
    assert.equal(agentHookAutoStagesCommit("git commit --update -m x"), true);
    assert.equal(agentHookAutoStagesCommit("git commit -m x"), false);
  });
});

describe("agentHook pathspec / reuse / fixup", () => {
  it("detects pathspecs", () => {
    assert.equal(agentHookCommitHasPathspec("git commit -m x -- f.txt"), true);
    assert.equal(agentHookCommitHasPathspec("git commit -m x"), false);
    assert.equal(gitCommitArgsHavePathspec(["-m", "msg", "f.txt"]), true);
    assert.equal(gitCommitArgsHavePathspec(["-m", "msg"]), false);
  });

  it("detects reuse-message and fixup/squash", () => {
    assert.equal(agentHookReusesMessage("git commit -C HEAD"), true);
    assert.equal(agentHookFixupSquash("git commit --fixup=abc"), true);
    assert.equal(agentHookFixupSquash("git commit --squash HEAD"), true);
  });

  it("detects add / implicit / stash / reset", () => {
    assert.equal(agentHookAddsFiles("git add -A"), true);
    assert.equal(agentHookImplicitCommit("git merge x"), true);
    assert.equal(agentHookStashMutate("git stash pop"), true);
    assert.equal(agentHookResetHard("git reset --hard"), true);
  });
});

describe("gitCommitArgsBypassHooks", () => {
  it("detects hook-bypass flags in argv arrays", () => {
    assert.equal(gitCommitArgsBypassHooks(["-m", "x", "--no-verify"]), true);
    assert.equal(gitCommitArgsBypassHooks(["-an", "x"]), true);
    assert.equal(
      gitCommitArgsBypassHooks(["-c", "core.hooksPath=/dev/null", "-m", "x"]),
      true,
    );
    assert.equal(
      gitCommitArgsBypassHooks(["-c", "include.path=/tmp/x", "-m", "x"]),
      true,
    );
    assert.equal(gitCommitArgsBypassHooks(["-m", "x"]), false);
  });
});

describe("CURSOR_MATCHER", () => {
  it("is a usable JS regex covering expanded surface", () => {
    const re = new RegExp(CURSOR_MATCHER);
    assert.equal(re.test("git commit -m x"), true);
    assert.equal(re.test("git push"), true);
    assert.equal(re.test("git add ."), true);
    assert.equal(re.test("git merge x"), true);
    assert.equal(re.test("FOO=bar git commit -m x"), true);
    assert.equal(re.test("echo 'git commit'"), false);
    assert.equal(re.test("gitstatus"), false);
  });
});
