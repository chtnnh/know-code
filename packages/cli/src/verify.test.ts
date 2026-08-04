import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { computeRangeDiffContext } from "./hash.js";
import { DEFAULT_CONFIG } from "./types.js";
import {
  collectVerifyHashCandidates,
  matchHeadTrailer,
} from "./verify-helpers.js";

const FIXTURE_ROOT = join(tmpdir(), "know-code-verify-test");

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("verify hash candidates", () => {
  it("accepts range hash on HEAD when ahead of base (squash-friendly)", () => {
    const repo = mkdtempSync(join(FIXTURE_ROOT, "squash-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      writeFileSync(
        join(repo, ".know-code", "config.json"),
        JSON.stringify({ ...DEFAULT_CONFIG, level: "lite" }),
      );
      writeFileSync(join(repo, "f.txt"), "base\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "base"]);
      const baseOid = git(repo, ["rev-parse", "HEAD"]);
      writeFileSync(join(repo, "f.txt"), "squashed\n");
      git(repo, ["add", "f.txt"]);
      const cfg = { ...DEFAULT_CONFIG, level: "lite" as const };
      const rangeHash = computeRangeDiffContext(repo, cfg, baseOid).diffHash;
      git(repo, [
        "commit",
        "-m",
        `squashed tip\n\nKnow-Code-Verified: ${rangeHash}\n`,
      ]);

      const candidates = collectVerifyHashCandidates(repo, cfg);
      const match = matchHeadTrailer(repo, "HEAD", candidates);
      assert.ok(match);
      assert.equal(match!.hash, rangeHash);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("index and merge-base..HEAD differ for multi-commit ranges", () => {
    const repo = mkdtempSync(join(FIXTURE_ROOT, "diff-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      writeFileSync(
        join(repo, ".know-code", "config.json"),
        JSON.stringify({ ...DEFAULT_CONFIG, level: "lite" }),
      );
      writeFileSync(join(repo, "f.txt"), "base\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "base"]);
      writeFileSync(join(repo, "f.txt"), "change\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "feature"]);
      const cfg = { ...DEFAULT_CONFIG, level: "lite" as const };
      const candidates = collectVerifyHashCandidates(repo, cfg);
      const index = candidates.find((c) => c.label === "index");
      const range = candidates.find((c) => c.label === "merge-base..HEAD");
      assert.ok(index);
      assert.ok(range);
      assert.notEqual(index!.hash, range!.hash);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
