import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "./hash.js";
import { isGateValid } from "./gate.js";
import type { GateReceipt } from "./types.js";

describe("sha256", () => {
  it("is stable", () => {
    assert.equal(
      sha256("hello"),
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("isGateValid", () => {
  const base: GateReceipt = {
    version: 1,
    diffHash: "abc",
    level: "standard",
    passedAt: new Date().toISOString(),
    commitRange: "a..b",
    baseRef: "main",
    headRef: "HEAD",
  };

  it("rejects missing receipt", () => {
    assert.equal(isGateValid(null, "abc", "lite"), false);
  });

  it("rejects hash mismatch", () => {
    assert.equal(isGateValid(base, "other", "lite"), false);
  });

  it("allows higher level than required", () => {
    assert.equal(isGateValid(base, "abc", "lite"), true);
    assert.equal(isGateValid(base, "abc", "standard"), true);
    assert.equal(isGateValid(base, "abc", "deep"), false);
  });
});
