import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  inferUniformRangeTrailerHash,
  trailerHashFromMessage,
} from "./trailers.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("trailers", () => {
  it("trailerHashFromMessage parses Know-Code-Verified", () => {
    const hash = "a".repeat(64);
    assert.equal(
      trailerHashFromMessage(`feat: x\n\nKnow-Code-Verified: ${hash}\n`),
      hash,
    );
    assert.equal(trailerHashFromMessage("no trailer"), null);
  });

  it("inferUniformRangeTrailerHash requires same hash on every commit", () => {
    const dir = mkdtempSync(join(tmpdir(), "kc-trailers-"));
    try {
      git(dir, ["init", "-b", "main"]);
      git(dir, ["config", "user.email", "t@test"]);
      git(dir, ["config", "user.name", "t"]);
      git(dir, ["commit", "--allow-empty", "-m", "base"]);
      const base = git(dir, ["rev-parse", "HEAD"]);
      const hash = "b".repeat(64);
      git(dir, [
        "commit",
        "--allow-empty",
        "-m",
        `one\n\nKnow-Code-Verified: ${hash}`,
      ]);
      git(dir, [
        "commit",
        "--allow-empty",
        "-m",
        `two\n\nKnow-Code-Verified: ${hash}`,
      ]);
      assert.equal(inferUniformRangeTrailerHash(dir, base), hash);
      git(dir, [
        "commit",
        "--allow-empty",
        "-m",
        `three\n\nKnow-Code-Verified: ${"c".repeat(64)}`,
      ]);
      assert.equal(inferUniformRangeTrailerHash(dir, base), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
