import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeConfig } from "./config.js";
import { materializedTreeOid, writeGate } from "./gate.js";
import { computeRangeDiffContext } from "./hash.js";
import {
  isSealedRewriteRangeOpen,
  writeRangeSeal,
  writeRangeSession,
} from "./range.js";
import { DEFAULT_CONFIG } from "./types.js";
import {
  collectVerifyHashCandidates,
  matchHeadTrailer,
} from "./verify-helpers.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("verify hash candidates", () => {
  it("accepts range hash on HEAD when ahead of base (squash-friendly)", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-verify-squash-"));
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
      git(repo, ["commit", "-m", "squashed tip"]);
      const cfg = { ...DEFAULT_CONFIG, level: "lite" as const };
      // Tip range hash with clean index (squash / single-commit CI case).
      const rangeHash = computeRangeDiffContext(repo, cfg, baseOid).diffHash;
      git(repo, [
        "commit",
        "--amend",
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

  it("pass-time range trailer matches merge-base..HEAD without commit-drift", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-verify-stable-pass-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      const cfg = {
        ...DEFAULT_CONFIG,
        level: "lite" as const,
        rangeMode: "range" as const,
        requireAttest: false,
      };
      writeConfig(repo, cfg);
      writeFileSync(join(repo, "f.txt"), "base\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "base"]);
      const fromOid = git(repo, ["rev-parse", "HEAD"]);
      writeRangeSession(repo, {
        version: 1,
        fromOid,
        fromRef: fromOid,
        startedAt: new Date().toISOString(),
        startHead: fromOid,
      });
      writeFileSync(join(repo, "f.txt"), "staged\n");
      git(repo, ["add", "f.txt"]);
      const passHash = computeRangeDiffContext(repo, cfg, fromOid).diffHash;
      const gatedTreeOid = materializedTreeOid(repo);
      writeGate(repo, {
        version: 1,
        diffHash: passHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: `${fromOid}..HEAD`,
        baseRef: "main",
        headRef: fromOid,
        scope: "range",
        rangeFromOid: fromOid,
        gatedTreeOid,
      });
      git(repo, [
        "commit",
        "-m",
        `feat\n\nKnow-Code-Verified: ${passHash}\n`,
      ]);

      const candidates = collectVerifyHashCandidates(repo, cfg);
      // Tree-canonical: no commit-drift needed — tip hash equals pass hash.
      assert.equal(
        candidates.find((c) => c.label === "commit-drift"),
        undefined,
      );
      const range = candidates.find((c) => c.label === "merge-base..HEAD");
      assert.ok(range);
      assert.equal(range!.hash, passHash);
      const match = matchHeadTrailer(repo, "HEAD", candidates);
      assert.ok(match);
      assert.equal(match!.hash, passHash);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("rejects arbitrary HEAD trailer without grounded candidate", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-verify-fake-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      writeFileSync(
        join(repo, ".know-code", "config.json"),
        JSON.stringify({ ...DEFAULT_CONFIG, level: "lite" }),
      );
      writeFileSync(join(repo, "f.txt"), "x\n");
      git(repo, ["add", "f.txt"]);
      const fake = "f".repeat(64);
      git(repo, [
        "commit",
        "-m",
        `msg\n\nKnow-Code-Verified: ${fake}\n`,
      ]);
      const cfg = { ...DEFAULT_CONFIG, level: "lite" as const };
      const candidates = collectVerifyHashCandidates(repo, cfg);
      assert.equal(
        candidates.some((c) => c.label === "head-trailer"),
        false,
      );
      assert.equal(
        candidates.some((c) => c.hash === fake),
        false,
      );
      const match = matchHeadTrailer(repo, "HEAD", candidates);
      assert.equal(match, null);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("range-seal hashes only accepted at sealedHeadOid", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-verify-seal-head-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      const cfg = { ...DEFAULT_CONFIG, level: "lite" as const, requireAttest: false };
      writeConfig(repo, cfg);
      writeFileSync(join(repo, "f.txt"), "base\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "base"]);
      writeFileSync(join(repo, "f.txt"), "tip\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "tip"]);
      const sealedHead = git(repo, ["rev-parse", "HEAD"]);
      const sealHash = "c".repeat(64);
      writeRangeSeal(repo, {
        version: 1,
        diffHash: sealHash,
        rangeFromOid: git(repo, ["rev-parse", "HEAD~1"]),
        commitCount: 1,
        sealMode: "receipt",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });

      let candidates = collectVerifyHashCandidates(repo, cfg);
      assert.ok(candidates.some((c) => c.label === "range-seal"));
      assert.ok(candidates.some((c) => c.hash === sealHash));

      // New commit moves HEAD — stale seal hash must not be a candidate.
      writeFileSync(join(repo, "f.txt"), "after\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "after seal"]);
      candidates = collectVerifyHashCandidates(repo, cfg);
      assert.equal(
        candidates.some((c) => c.hash === sealHash),
        false,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("verify rejects stale seal hash after tree-preserving post-seal commit", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-verify-seal-drift-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      const cfg = { ...DEFAULT_CONFIG, level: "lite" as const, requireAttest: false };
      writeConfig(repo, cfg);
      writeFileSync(join(repo, "f.txt"), "base\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "base"]);
      const fromOid = git(repo, ["rev-parse", "HEAD"]);
      writeFileSync(join(repo, "f.txt"), "feat\n");
      git(repo, ["add", "f.txt"]);
      const tipHash = "e".repeat(64);
      git(repo, [
        "commit",
        "-m",
        `feat\n\nKnow-Code-Verified: ${tipHash}\n`,
      ]);
      const sealedHead = git(repo, ["rev-parse", "HEAD"]);
      writeRangeSeal(repo, {
        version: 1,
        diffHash: tipHash,
        rangeFromOid: fromOid,
        commitCount: 1,
        sealMode: "receipt",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });
      git(repo, [
        "commit",
        "--allow-empty",
        "-m",
        `noop\n\nKnow-Code-Verified: ${tipHash}\n`,
      ]);
      const candidates = collectVerifyHashCandidates(repo, cfg);
      assert.equal(
        candidates.some((c) => c.label === "range-seal" && c.hash === tipHash),
        false,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("sealed rewrite open only while HEAD equals sealedHeadOid", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-sealed-rewrite-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      const cfg = {
        ...DEFAULT_CONFIG,
        level: "lite" as const,
        requireAttest: false,
        requireTrailer: false,
      };
      writeConfig(repo, cfg);
      writeFileSync(join(repo, "f.txt"), "base\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "base"]);
      const fromOid = git(repo, ["rev-parse", "HEAD"]);
      writeFileSync(join(repo, "f.txt"), "feat\n");
      git(repo, ["add", "f.txt"]);
      const tipHash = "d".repeat(64);
      git(repo, [
        "commit",
        "-m",
        `feat\n\nKnow-Code-Verified: ${tipHash}\n`,
      ]);
      const sealedHead = git(repo, ["rev-parse", "HEAD"]);
      writeGate(repo, {
        version: 1,
        diffHash: tipHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: `${fromOid}..HEAD`,
        baseRef: fromOid,
        headRef: sealedHead,
        gatedTreeOid: git(repo, ["rev-parse", "HEAD^{tree}"]),
      });
      writeRangeSeal(repo, {
        version: 1,
        diffHash: tipHash,
        rangeFromOid: fromOid,
        commitCount: 1,
        sealMode: "rewrite",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });
      assert.equal(isSealedRewriteRangeOpen(repo), true);

      // Staged tree change at sealed HEAD still closes rewrite-open.
      writeFileSync(join(repo, "f.txt"), "tampered\n");
      git(repo, ["add", "f.txt"]);
      assert.equal(isSealedRewriteRangeOpen(repo), false);
      git(repo, ["reset", "HEAD", "f.txt"]);

      // Empty commit after seal closes rewrite-open.
      git(repo, [
        "commit",
        "--allow-empty",
        "-m",
        `empty\n\nKnow-Code-Verified: ${tipHash}\n`,
      ]);
      assert.equal(isSealedRewriteRangeOpen(repo), false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("index and merge-base..HEAD differ for multi-commit ranges", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-verify-diff-"));
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

  it("range hash is stable across staged → committed (CI dogfood)", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-verify-stable-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      writeFileSync(
        join(repo, ".know-code", "config.json"),
        JSON.stringify({
          ...DEFAULT_CONFIG,
          level: "lite",
          rangeMode: "range",
        }),
      );
      writeFileSync(join(repo, "f.txt"), "base\n");
      git(repo, ["add", "f.txt"]);
      git(repo, ["commit", "-m", "base"]);
      const fromOid = git(repo, ["rev-parse", "HEAD"]);

      writeFileSync(join(repo, "g.txt"), "feature\n");
      git(repo, ["add", "g.txt"]);
      const stagedHash = computeRangeDiffContext(
        repo,
        { ...DEFAULT_CONFIG, level: "lite", rangeMode: "range" },
        fromOid,
      ).diffHash;

      git(repo, [
        "commit",
        "-m",
        `feat\n\nKnow-Code-Verified: ${stagedHash}\n`,
      ]);

      const committedHash = computeRangeDiffContext(
        repo,
        { ...DEFAULT_CONFIG, level: "lite", rangeMode: "range" },
        fromOid,
      ).diffHash;
      assert.equal(committedHash, stagedHash);

      // CI has no seal artifacts — only grounded candidates.
      const candidates = collectVerifyHashCandidates(repo, {
        ...DEFAULT_CONFIG,
        level: "lite",
      });
      assert.ok(
        candidates.some((c) => c.hash === stagedHash),
        "pass-time trailer must be among CI verify candidates",
      );
      const match = matchHeadTrailer(repo, "HEAD", candidates);
      assert.ok(match);
      assert.equal(match!.hash, stagedHash);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
