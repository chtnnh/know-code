import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeConfig } from "./config.js";
import { runVerify } from "./commands/verify.js";
import {
  computeRangeDiffContext,
  computeTreePairHash,
  EMPTY_TREE,
} from "./hash.js";
import { applyTrailerToRange } from "./trailers.js";
import { DEFAULT_CONFIG } from "./types.js";
import {
  partitionPushWalk,
  groundedHashesForSegment,
} from "./verify-walk.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  }).trim();
}

function ciVerifyConfig() {
  return {
    ...DEFAULT_CONFIG,
    level: "lite" as const,
    baseBranch: "main",
    requireTrailer: true,
    requireAttest: false,
    enforcePipeline: false,
  };
}

function initLab(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  git(repo, ["init", "-b", "main", "--template="]);
  git(repo, ["config", "user.email", "t@test"]);
  git(repo, ["config", "user.name", "t"]);
  mkdirSync(join(repo, ".know-code"), { recursive: true });
  writeConfig(repo, ciVerifyConfig());
  return repo;
}

function commitFile(
  repo: string,
  file: string,
  body: string,
  message: string,
): string {
  writeFileSync(join(repo, file), body);
  git(repo, ["add", file]);
  git(repo, ["commit", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

function stampTrailer(repo: string, hash: string, subject: string): string {
  git(repo, ["commit", "--amend", "-m", `${subject}\n\nKnow-Code-Verified: ${hash}\n`]);
  return git(repo, ["rev-parse", "HEAD"]);
}

function pinOriginMain(repo: string, oid: string): void {
  const remotes = git(repo, ["remote"]);
  if (!remotes.split("\n").filter(Boolean).includes("origin")) {
    git(repo, ["remote", "add", "origin", "https://example.invalid/repo.git"]);
  }
  git(repo, ["update-ref", "refs/remotes/origin/main", oid]);
}

describe("computeTreePairHash", () => {
  it("matches a clean-index range hash and ignores a dirty index", () => {
    const repo = initLab("kc-tree-pair-");
    try {
      const base = commitFile(repo, "a.txt", "base\n", "base");
      commitFile(repo, "a.txt", "feat\n", "feat");
      const cfg = ciVerifyConfig();
      const range = computeRangeDiffContext(repo, cfg, base).diffHash;
      const pair = computeTreePairHash(repo, base, git(repo, ["rev-parse", "HEAD"]));
      assert.equal(pair, range);

      writeFileSync(join(repo, "dirty.txt"), "staged\n");
      git(repo, ["add", "dirty.txt"]);
      assert.equal(
        computeTreePairHash(repo, base, git(repo, ["rev-parse", "HEAD"])),
        pair,
      );
      assert.notEqual(
        computeRangeDiffContext(repo, cfg, base).diffHash,
        pair,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("partitionPushWalk", () => {
  it("splits stacked trailer hashes into independent runs", () => {
    const repo = initLab("kc-part-stack-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "a.txt", "1\n", "one");
      const s1 = stampTrailer(repo, "a".repeat(64), "one");
      commitFile(repo, "a.txt", "2\n", "two");
      const s2 = stampTrailer(repo, "b".repeat(64), "two");

      const part = partitionPushWalk(repo, base, s2);
      assert.equal(part.ok, true);
      if (!part.ok) return;
      assert.equal(part.segments.length, 2);
      assert.equal(part.segments[0].trailerHash, "a".repeat(64));
      assert.equal(part.segments[0].oids.length, 1);
      assert.equal(part.segments[1].trailerHash, "b".repeat(64));
      assert.equal(part.segments[0].fromOid, base);
      assert.equal(part.segments[1].fromOid, s1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("fails closed on a linear commit without a trailer", () => {
    const repo = initLab("kc-part-linear-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      const head = commitFile(repo, "a.txt", "1\n", "no trailer");
      const part = partitionPushWalk(repo, base, head);
      assert.equal(part.ok, false);
      if (part.ok) return;
      assert.match(part.error, /no Know-Code-Verified trailer/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("attaches a trailerless merge to the current run", () => {
    const repo = initLab("kc-part-merge-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      git(repo, ["checkout", "-b", "feat"]);
      commitFile(repo, "feat.txt", "f\n", "feat");
      const tip = stampTrailer(repo, "c".repeat(64), "feat");
      git(repo, ["checkout", "main"]);
      git(repo, ["merge", "--no-ff", tip, "-m", "Merge pull request #1 from owner/feat"]);
      const merge = git(repo, ["rev-parse", "HEAD"]);

      const part = partitionPushWalk(repo, base, merge);
      assert.equal(part.ok, true);
      if (!part.ok) return;
      assert.equal(part.segments.length, 1);
      assert.equal(part.segments[0].oids.length, 2);
      assert.equal(part.segments[0].toOid, merge);
      assert.equal(part.segments[0].fromOid, base);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("fails when a merge has no current run to attach to", () => {
    const repo = initLab("kc-part-orphan-merge-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      git(repo, ["checkout", "-b", "feat"]);
      commitFile(repo, "feat.txt", "f\n", "feat");
      const tip = stampTrailer(repo, "c".repeat(64), "feat");
      git(repo, ["checkout", "main"]);
      git(repo, ["merge", "--no-ff", tip, "-m", "Merge pull request #1 from owner/feat"]);
      const merge = git(repo, ["rev-parse", "HEAD"]);

      const part = partitionPushWalk(repo, tip, merge);
      assert.equal(part.ok, false);
      if (part.ok) return;
      assert.match(part.error, /not attached to a verified run/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("verify --from walk", () => {
  it("exits 0 when --from is HEAD or the zero SHA", () => {
    const repo = initLab("kc-walk-empty-");
    try {
      commitFile(repo, "a.txt", "0\n", "base");
      const head = git(repo, ["rev-parse", "HEAD"]);
      const same = runVerify(repo, { from: head });
      assert.equal(same.ok, true, same.errors.join("\n"));
      assert.equal(same.exitCode, 0);
      assert.match((same.warnings ?? []).join("\n"), /warning — --from is HEAD/);

      const zero = runVerify(repo, { from: "0".repeat(40) });
      assert.equal(zero.ok, true, zero.errors.join("\n"));
      assert.match(zero.messages.join("\n"), /zero SHA/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("fails closed when --from is not an ancestor or not a commit", () => {
    const repo = initLab("kc-walk-anc-");
    try {
      commitFile(repo, "a.txt", "0\n", "base");
      git(repo, ["checkout", "-b", "side"]);
      const side = commitFile(repo, "side.txt", "s\n", "side");
      git(repo, ["checkout", "main"]);
      commitFile(repo, "main.txt", "m\n", "main moves");

      const missing = runVerify(repo, { from: "a".repeat(40) });
      assert.equal(missing.ok, false);
      assert.match(missing.errors.join("\n"), /not a commit/);

      const diverged = runVerify(repo, { from: side });
      assert.equal(diverged.ok, false);
      assert.match(diverged.errors.join("\n"), /not an ancestor/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("accepts a single landing against the tree-pair or the index hash", () => {
    const repo = initLab("kc-walk-one-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "a.txt", "hotfix\n", "hotfix");
      const head = git(repo, ["rev-parse", "HEAD"]);
      const rangeHash = computeTreePairHash(repo, base, head);
      const indexHash = computeTreePairHash(repo, EMPTY_TREE, head);
      assert.notEqual(rangeHash, indexHash);

      stampTrailer(repo, rangeHash, "hotfix");
      const viaRange = runVerify(repo, { from: base });
      assert.equal(viaRange.ok, true, viaRange.errors.join("\n"));
      assert.equal(viaRange.matched?.label, "push-walk");
      assert.match(viaRange.messages.join("\n"), /tree-pair/);

      stampTrailer(repo, indexHash, "hotfix");
      const viaIndex = runVerify(repo, { from: base });
      assert.equal(viaIndex.ok, true, viaIndex.errors.join("\n"));
      assert.match(viaIndex.messages.join("\n"), /index/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("verifies stacked ranges independently (combined patch is not a candidate)", () => {
    const repo = initLab("kc-walk-stack-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "r1.txt", "one\n", "one");
      let s1 = git(repo, ["rev-parse", "HEAD"]);
      const h1 = computeTreePairHash(repo, base, s1);
      s1 = stampTrailer(repo, h1, "one");

      commitFile(repo, "r2.txt", "two\n", "two");
      let s2 = git(repo, ["rev-parse", "HEAD"]);
      const h2 = computeTreePairHash(repo, s1, s2);
      s2 = stampTrailer(repo, h2, "two");

      const combined = computeTreePairHash(repo, base, s2);
      assert.notEqual(combined, h1);
      assert.notEqual(combined, h2);

      const result = runVerify(repo, { from: base });
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.match(result.messages.join("\n"), /2 runs/);
      const part = partitionPushWalk(repo, base, s2);
      assert.equal(part.ok, true);
      if (!part.ok) return;
      assert.equal(part.segments.length, 2);
      assert.equal(groundedHashesForSegment(repo, part.segments[0]).rangeHash, h1);
      assert.equal(groundedHashesForSegment(repo, part.segments[1]).rangeHash, h2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("accepts a merge landing whose feature commit carries the tree-pair trailer", () => {
    const repo = initLab("kc-walk-merge-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      git(repo, ["checkout", "-b", "feat"]);
      commitFile(repo, "feat.txt", "f\n", "feat");
      let tip = git(repo, ["rev-parse", "HEAD"]);
      const h = computeTreePairHash(repo, base, tip);
      tip = stampTrailer(repo, h, "feat");
      git(repo, ["checkout", "main"]);
      git(repo, [
        "merge",
        "--no-ff",
        tip,
        "-m",
        "Merge pull request #1 from owner/feat\n\nfeat",
      ]);
      const result = runVerify(repo, { from: base });
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.match(result.messages.join("\n"), /push walk verified/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("rejects a forged trailer and ignores a dirty index", () => {
    const repo = initLab("kc-walk-forge-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "a.txt", "feat\n", "feat");
      stampTrailer(repo, "d".repeat(64), "feat");
      const forged = runVerify(repo, { from: base });
      assert.equal(forged.ok, false);
      assert.match(forged.errors.join("\n"), /does not match tree pair/);

      const head = git(repo, ["rev-parse", "HEAD"]);
      const h = computeTreePairHash(repo, base, head);
      stampTrailer(repo, h, "feat");
      writeFileSync(join(repo, "dirty.txt"), "nope\n");
      git(repo, ["add", "dirty.txt"]);
      const dirty = runVerify(repo, { from: base });
      assert.equal(dirty.ok, true, dirty.errors.join("\n"));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("fails closed on a receipt-style range (trailer only on the tip)", () => {
    const repo = initLab("kc-walk-receipt-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "a.txt", "1\n", "mid");
      commitFile(repo, "a.txt", "2\n", "tip");
      const tip = git(repo, ["rev-parse", "HEAD"]);
      const h = computeTreePairHash(repo, base, tip);
      stampTrailer(repo, h, "tip");
      const result = runVerify(repo, { from: base });
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /no Know-Code-Verified trailer/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("treats a rewrite range (same trailer on every commit) as one run", () => {
    const repo = initLab("kc-walk-rewrite-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "d.txt", "d\n", "d");
      commitFile(repo, "e.txt", "e\n", "e");
      const tip = git(repo, ["rev-parse", "HEAD"]);
      const h = computeTreePairHash(repo, base, tip);
      applyTrailerToRange(repo, base, h);
      const head = git(repo, ["rev-parse", "HEAD"]);
      const part = partitionPushWalk(repo, base, head);
      assert.equal(part.ok, true);
      if (!part.ok) return;
      assert.equal(part.segments.length, 1);
      assert.equal(part.segments[0].oids.length, 2);
      const result = runVerify(repo, { from: base });
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.match(result.messages.join("\n"), /1 run/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("rejects an index hash on a multi-commit run", () => {
    const repo = initLab("kc-walk-idx-multi-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "d.txt", "d\n", "d");
      commitFile(repo, "e.txt", "e\n", "e");
      const tip = git(repo, ["rev-parse", "HEAD"]);
      const indexHash = computeTreePairHash(repo, EMPTY_TREE, tip);
      applyTrailerToRange(repo, base, indexHash);
      const result = runVerify(repo, { from: base });
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /does not match tree pair/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("accepts an index-hash hotfix after a trailerless merge attaches", () => {
    const repo = initLab("kc-walk-idx-merge-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      git(repo, ["checkout", "-b", "feat"]);
      commitFile(repo, "feat.txt", "f\n", "feat");
      let tip = git(repo, ["rev-parse", "HEAD"]);
      const indexHash = computeTreePairHash(repo, EMPTY_TREE, tip);
      tip = stampTrailer(repo, indexHash, "feat");
      git(repo, ["checkout", "main"]);
      git(repo, ["merge", "--no-ff", tip, "-m", "Merge pull request #1 from owner/feat"]);
      const result = runVerify(repo, { from: base });
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.match(result.messages.join("\n"), /index/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("bare verify fails on the base tip while --from still passes", () => {
    const repo = initLab("kc-walk-base-tip-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "a.txt", "land\n", "land");
      let head = git(repo, ["rev-parse", "HEAD"]);
      const h = computeTreePairHash(repo, base, head);
      head = stampTrailer(repo, h, "land");
      pinOriginMain(repo, head);
      const bare = runVerify(repo, {});
      assert.equal(bare.ok, false);
      assert.match(bare.messages.join("\n"), /on base tip/);
      const walk = runVerify(repo, { from: base });
      assert.equal(walk.ok, true, walk.errors.join("\n"));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("ignores an indented trailer (column-0 only)", () => {
    const repo = initLab("kc-walk-indent-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "a.txt", "1\n", "feat");
      const head = git(repo, ["rev-parse", "HEAD"]);
      const h = computeTreePairHash(repo, base, head);
      git(repo, [
        "commit",
        "--amend",
        "-m",
        `feat\n\n  Know-Code-Verified: ${h}\n`,
      ]);
      const result = runVerify(repo, { from: base });
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /no Know-Code-Verified trailer/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("matches a cumulative range hash when --from is a later landing (second push)", () => {
    const repo = initLab("kc-walk-second-push-");
    try {
      const base = commitFile(repo, "a.txt", "0\n", "base");
      commitFile(repo, "d.txt", "d\n", "first landing");
      let first = git(repo, ["rev-parse", "HEAD"]);
      first = stampTrailer(repo, computeTreePairHash(repo, base, first), "first landing");

      commitFile(repo, "e.txt", "e\n", "second landing");
      let second = git(repo, ["rev-parse", "HEAD"]);
      const cumulative = computeTreePairHash(repo, base, second);
      const incremental = computeTreePairHash(repo, first, second);
      assert.notEqual(cumulative, incremental);
      second = stampTrailer(repo, cumulative, "second landing");

      const result = runVerify(repo, { from: first });
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.match(result.messages.join("\n"), /tree-pair/);

      stampTrailer(repo, computeTreePairHash(repo, base, first), "second landing");
      const copied = runVerify(repo, { from: first });
      assert.equal(copied.ok, false);
      assert.match(copied.errors.join("\n"), /does not match tree pair/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
