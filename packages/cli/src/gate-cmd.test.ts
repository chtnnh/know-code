import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MATCHER, shouldGate } from "./gate-cmd.js";

describe("shouldGate", () => {
  it("gates real git commit/push", () => {
    assert.equal(shouldGate("git commit -m 'x'"), true);
    assert.equal(shouldGate("git push origin HEAD"), true);
    assert.equal(shouldGate("cd foo && git commit -am 'x'"), true);
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
    // When only the parsed command is passed (not raw stdin), a write that
    // embeds the words should not match if the outer command is not gated.
    const cmd = `cat <<'EOF'
Answer: use git commit after the quiz
EOF`;
    assert.equal(shouldGate(cmd), false);
  });
});

describe("CURSOR_MATCHER", () => {
  it("is a usable JS regex", () => {
    const re = new RegExp(CURSOR_MATCHER);
    assert.equal(re.test("git commit -m x"), true);
    assert.equal(re.test("git push"), true);
    assert.equal(re.test("echo 'git commit'"), false);
    assert.equal(re.test("gitstatus"), false);
  });
});
