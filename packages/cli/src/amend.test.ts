import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAmendArgs } from "./commands/amend.js";

describe("buildAmendArgs", () => {
  const hash = "b".repeat(64);

  it("without -m keeps --amend and preserves HEAD subject", () => {
    const out = buildAmendArgs([], hash, "feat: prior subject\n\nbody\n");
    assert.equal(out[0], "--amend");
    assert.equal(out[1], "-m");
    assert.match(out[2], /^feat: prior subject/);
    assert.match(out[2], new RegExp(`Know-Code-Verified: ${hash}`));
  });

  it("with -m keeps --amend and injects trailer", () => {
    const out = buildAmendArgs(["-m", "new msg"], hash, "ignored");
    assert.equal(out[0], "--amend");
    assert.equal(out[1], "-m");
    assert.match(out[2], /new msg/);
    assert.match(out[2], new RegExp(`Know-Code-Verified: ${hash}`));
  });

  it("--no-trailer keeps --amend without injecting", () => {
    const out = buildAmendArgs(["--no-trailer"], hash, "prior");
    assert.deepEqual(out, ["--amend"]);
  });
});
