import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { computeDiffContext } from "./hash.js";
import { DEFAULT_CONFIG, type Config } from "./types.js";

const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".tmp-test",
);

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("computeDiffContext empty-tree floor", () => {
  let dir: string;
  const config: Config = {
    ...DEFAULT_CONFIG,
    level: "standard",
    requireTrailer: true,
  };

  before(() => {
    mkdirSync(FIXTURE_ROOT, { recursive: true });
    dir = mkdtempSync(join(FIXTURE_ROOT, "hash-"));
    git(dir, ["init", "-b", "main", "--template="]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Test"]);
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(dir, ["add", "a.txt"]);
    git(dir, ["commit", "-m", "init"]);
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("hash is stable for the same index tree", () => {
    const h1 = computeDiffContext(dir, config).diffHash;
    const h2 = computeDiffContext(dir, config).diffHash;
    assert.equal(h1, h2);
    assert.match(h1, /^[0-9a-f]{64}$/);
  });

  it("hash changes when the index tree changes", () => {
    const before = computeDiffContext(dir, config).diffHash;
    writeFileSync(join(dir, "b.txt"), "two\n");
    git(dir, ["add", "b.txt"]);
    const after = computeDiffContext(dir, config).diffHash;
    assert.notEqual(before, after);
  });

  it("commitRange uses empty-tree floor when no ahead-of-base diff", () => {
    // On main tip with no remote, merge-base display may still use empty tree.
    const ctx = computeDiffContext(dir, config);
    assert.ok(ctx.commitRange.includes(".."));
    assert.equal(ctx.diff.length > 0, true);
  });
});

describe("verify HEAD trailer helpers via temp repo", () => {
  let dir: string;

  before(() => {
    mkdirSync(FIXTURE_ROOT, { recursive: true });
    dir = mkdtempSync(join(FIXTURE_ROOT, "verify-"));
    git(dir, ["init", "-b", "main", "--template="]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Test"]);
    mkdirSync(join(dir, ".know-code"), { recursive: true });
    writeFileSync(
      join(dir, ".know-code", "config.json"),
      JSON.stringify({
        ...DEFAULT_CONFIG,
        level: "lite",
        requireTrailer: true,
      }),
    );
    writeFileSync(join(dir, "f.txt"), "v1\n");
    git(dir, ["add", "f.txt"]);
    git(dir, ["commit", "-m", "base"]);
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("HEAD trailer matching uses current hash", () => {
    writeFileSync(join(dir, "f.txt"), "v2\n");
    git(dir, ["add", "f.txt"]);
    const { computeDiffContext: ctxFn } = awaitImport();
    const hash = ctxFn(dir, {
      ...DEFAULT_CONFIG,
      level: "lite",
      requireTrailer: true,
    }).diffHash;
    git(dir, [
      "commit",
      "-m",
      `feat\n\nKnow-Code-Verified: ${hash}\n`,
    ]);
    // After commit, index matches HEAD tree → same hash
    const after = ctxFn(dir, {
      ...DEFAULT_CONFIG,
      level: "lite",
      requireTrailer: true,
    }).diffHash;
    assert.equal(after, hash);
    const msg = git(dir, ["log", "-1", "--format=%B"]);
    assert.match(msg, new RegExp(`Know-Code-Verified:\\s*${hash}`));
  });
});

function awaitImport(): {
  computeDiffContext: typeof computeDiffContext;
} {
  return { computeDiffContext };
}
