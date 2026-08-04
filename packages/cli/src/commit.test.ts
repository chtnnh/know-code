import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { injectTrailer } from "./commands/commit.js";

describe("injectTrailer", () => {
  const hash = "a".repeat(64);

  it("appends trailer to -m message", () => {
    const out = injectTrailer(["-m", "fix: thing"], hash);
    assert.deepEqual(out, [
      "-m",
      `fix: thing\n\nKnow-Code-Verified: ${hash}\n`,
    ]);
  });

  it("appends trailer to -F message file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kc-commit-"));
    const file = join(dir, "msg.txt");
    writeFileSync(file, "fix: thing\n");
    const out = injectTrailer(["-F", file], hash);
    assert.equal(out[0], "-m");
    assert.match(out[1], /fix: thing/);
    assert.match(out[1], /Know-Code-Verified/);
  });

  it("preserves other git commit flags", () => {
    const out = injectTrailer(["-m", "msg", "--no-verify"], hash);
    assert.equal(out[0], "-m");
    assert.match(out[1], /Know-Code-Verified/);
    assert.equal(out[2], "--no-verify");
  });
});
