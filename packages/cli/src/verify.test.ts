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
import { trailerHashFromMessage } from "./trailers.js";
import { DEFAULT_CONFIG } from "./types.js";
import {
  collectVerifyHashCandidates,
  matchHeadTrailer,
} from "./verify-helpers.js";
import { runVerify } from "./commands/verify.js";

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

/** CI workflow writes requireTrailer: true and resolves merge-base via origin/main. */
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

function pinOriginMain(repo: string, oid: string): void {
  const remotes = git(repo, ["remote"]);
  if (!remotes.split("\n").filter(Boolean).includes("origin")) {
    git(repo, ["remote", "add", "origin", "https://example.invalid/repo.git"]);
  }
  git(repo, ["update-ref", "refs/remotes/origin/main", oid]);
}

function parentOids(repo: string, rev = "HEAD"): string[] {
  return git(repo, ["rev-list", "--parents", "-n", "1", rev]).split(" ").slice(1);
}

/**
 * GitHub default merge-message shapes (new-repo presets:
 * squash COMMIT_OR_PR_TITLE + COMMIT_MESSAGES, merge MERGE_MESSAGE + PR_TITLE).
 * Local git only — these strings are fixtures, not a live API.
 */
function githubPullMergeRefMessage(headOid: string, baseOid: string): string {
  return `Merge ${headOid} into ${baseOid}`;
}

function githubSquashSingleMessage(
  title: string,
  pr: number,
  hash: string,
): string {
  return `${title} (#${pr})\n\nKnow-Code-Verified: ${hash}\n\nCo-authored-by: know-code-lab <lab@know-code.test>`;
}

function githubSquashMultiMessage(
  title: string,
  pr: number,
  subjects: string[],
  hash: string,
): string {
  const bullets = subjects.map((s) => `* ${s}`).join("\n\n");
  return `${title} (#${pr})\n\n${bullets}\n\nKnow-Code-Verified: ${hash}\n\n---------\n\nCo-authored-by: know-code-lab <lab@know-code.test>`;
}

function githubMergeLandingMessage(
  pr: number,
  headRef: string,
  prTitle: string,
): string {
  return `Merge pull request #${pr} from owner/${headRef}\n\n${prTitle}`;
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

  it("verify still matches after GitHub Update branch (merge main into feat)", () => {
    const repo = initLab("kc-verify-gh-update-branch-");
    const cfg = ciVerifyConfig();
    try {
      writeFileSync(join(repo, "readme.txt"), "base\n");
      git(repo, ["add", "readme.txt"]);
      git(repo, ["commit", "-m", "base"]);

      git(repo, ["checkout", "-b", "feat/merge-update"]);
      writeFileSync(join(repo, "feat.txt"), "pr\n");
      git(repo, ["add", "feat.txt"]);
      const fromOid = git(repo, ["rev-parse", "main"]);
      const passHash = computeRangeDiffContext(repo, cfg, fromOid).diffHash;
      git(repo, [
        "commit",
        "-m",
        `merge-update feat\n\nKnow-Code-Verified: ${passHash}\n`,
      ]);

      git(repo, ["checkout", "main"]);
      writeFileSync(join(repo, "unrelated.txt"), "main\n");
      git(repo, ["add", "unrelated.txt"]);
      git(repo, ["commit", "-m", "main moves"]);
      const movedMain = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["checkout", "feat/merge-update"]);
      git(repo, ["merge", "main", "-m", "Merge branch 'main' into feat/merge-update"]);

      assert.equal(parentOids(repo).length, 2, "HEAD must be a merge commit");
      const headMsg = git(repo, ["log", "-1", "--format=%B", "HEAD"]);
      assert.equal(trailerHashFromMessage(headMsg), null);
      pinOriginMain(repo, movedMain);

      const result = runVerify(repo, {});
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.equal(result.matched?.label, "merge-base..HEAD");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("verify matches GitHub pull/N/merge (Actions github.sha) via range trailers", () => {
    const repo = initLab("kc-verify-gh-pull-merge-ref-");
    const cfg = ciVerifyConfig();
    try {
      writeFileSync(join(repo, "readme.txt"), "base\n");
      git(repo, ["add", "readme.txt"]);
      git(repo, ["commit", "-m", "base"]);

      git(repo, ["checkout", "-b", "feat"]);
      writeFileSync(join(repo, "feat.txt"), "pr\n");
      git(repo, ["add", "feat.txt"]);
      const fromOid = git(repo, ["rev-parse", "main"]);
      const passHash = computeRangeDiffContext(repo, cfg, fromOid).diffHash;
      git(repo, [
        "commit",
        "-m",
        `feat\n\nKnow-Code-Verified: ${passHash}\n`,
      ]);
      const headOid = git(repo, ["rev-parse", "HEAD"]);

      git(repo, ["checkout", "main"]);
      writeFileSync(join(repo, "unrelated.txt"), "main\n");
      git(repo, ["add", "unrelated.txt"]);
      git(repo, ["commit", "-m", "main moves"]);
      const baseOid = git(repo, ["rev-parse", "HEAD"]);
      git(repo, [
        "merge",
        "--no-ff",
        "feat",
        "-m",
        githubPullMergeRefMessage(headOid, baseOid),
      ]);

      const parents = parentOids(repo);
      assert.equal(parents.length, 2);
      assert.equal(parents[0], baseOid);
      assert.equal(parents[1], headOid);
      const headMsg = git(repo, ["log", "-1", "--format=%B", "HEAD"]);
      assert.equal(trailerHashFromMessage(headMsg), null);
      pinOriginMain(repo, baseOid);

      const result = runVerify(repo, {});
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.equal(result.matched?.label, "merge-base..HEAD");
      assert.match(result.messages.join("\n"), /verified \(range/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("verify matches GitHub squash of a single-commit PR (COMMIT_OR_PR_TITLE)", () => {
    const repo = initLab("kc-verify-gh-squash-single-");
    const cfg = ciVerifyConfig();
    try {
      writeFileSync(join(repo, "readme.txt"), "base\n");
      git(repo, ["add", "readme.txt"]);
      git(repo, ["commit", "-m", "base"]);

      git(repo, ["checkout", "-b", "feat/squash-single"]);
      writeFileSync(join(repo, "squash-single.txt"), "one\n");
      git(repo, ["add", "squash-single.txt"]);
      const originalMain = git(repo, ["rev-parse", "main"]);
      const passHash = computeRangeDiffContext(repo, cfg, originalMain).diffHash;
      git(repo, [
        "commit",
        "-m",
        `squash single\n\nKnow-Code-Verified: ${passHash}\n`,
      ]);

      git(repo, ["checkout", "main"]);
      writeFileSync(join(repo, "unrelated.txt"), "main\n");
      git(repo, ["add", "unrelated.txt"]);
      git(repo, ["commit", "-m", "main moves"]);
      const movedMain = git(repo, ["rev-parse", "HEAD"]);

      git(repo, ["checkout", "feat/squash-single"]);
      pinOriginMain(repo, movedMain);
      const onPr = runVerify(repo, {});
      assert.equal(onPr.ok, true, onPr.errors.join("\n"));

      git(repo, ["checkout", "-B", "squash-land", movedMain]);
      git(repo, ["merge", "--squash", "feat/squash-single"]);
      git(repo, [
        "commit",
        "-m",
        githubSquashSingleMessage("squash single", 1, passHash),
      ]);
      assert.equal(parentOids(repo).length, 1);
      const landingMsg = git(repo, ["log", "-1", "--format=%B", "HEAD"]);
      assert.equal(trailerHashFromMessage(landingMsg), passHash);
      pinOriginMain(repo, movedMain);
      const vsParent = runVerify(repo, {});
      assert.equal(vsParent.ok, true, vsParent.errors.join("\n"));
      assert.equal(vsParent.matched?.label, "merge-base..HEAD");

      const landed = git(repo, ["rev-parse", "HEAD"]);
      pinOriginMain(repo, landed);
      const onMain = runVerify(repo, {});
      assert.equal(onMain.ok, false);
      assert.match(onMain.messages.join("\n"), /on base tip/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("verify matches GitHub squash of a multi-commit PR (COMMIT_MESSAGES + hoisted trailer)", () => {
    const repo = initLab("kc-verify-gh-squash-multi-");
    const cfg = ciVerifyConfig();
    try {
      writeFileSync(join(repo, "readme.txt"), "base\n");
      git(repo, ["add", "readme.txt"]);
      git(repo, ["commit", "-m", "base"]);
      const originalMain = git(repo, ["rev-parse", "HEAD"]);

      git(repo, ["checkout", "-b", "feat/squash-multi"]);
      writeFileSync(join(repo, "squash-a.txt"), "a\n");
      git(repo, ["add", "squash-a.txt"]);
      git(repo, ["commit", "-m", "wip"]);
      writeFileSync(join(repo, "squash-b.txt"), "b\n");
      git(repo, ["add", "squash-b.txt"]);
      const passHash = computeRangeDiffContext(repo, cfg, originalMain).diffHash;
      git(repo, [
        "commit",
        "-m",
        `squash multi tip\n\nKnow-Code-Verified: ${passHash}\n`,
      ]);

      git(repo, ["checkout", "main"]);
      writeFileSync(join(repo, "unrelated.txt"), "main\n");
      git(repo, ["add", "unrelated.txt"]);
      git(repo, ["commit", "-m", "main moves"]);
      const movedMain = git(repo, ["rev-parse", "HEAD"]);

      git(repo, ["checkout", "feat/squash-multi"]);
      pinOriginMain(repo, movedMain);
      const onPr = runVerify(repo, {});
      assert.equal(onPr.ok, true, onPr.errors.join("\n"));

      git(repo, ["checkout", "-B", "squash-land", movedMain]);
      git(repo, ["merge", "--squash", "feat/squash-multi"]);
      git(repo, [
        "commit",
        "-m",
        githubSquashMultiMessage(
          "squash multi commit",
          2,
          ["wip", "squash multi tip"],
          passHash,
        ),
      ]);
      assert.equal(parentOids(repo).length, 1);
      const landingMsg = git(repo, ["log", "-1", "--format=%B", "HEAD"]);
      assert.match(landingMsg, /^\* wip$/m);
      assert.match(landingMsg, /^---------$/m);
      assert.equal(trailerHashFromMessage(landingMsg), passHash);
      pinOriginMain(repo, movedMain);
      const vsParent = runVerify(repo, {});
      assert.equal(vsParent.ok, true, vsParent.errors.join("\n"));
      const headMatch = matchHeadTrailer(
        repo,
        "HEAD",
        collectVerifyHashCandidates(repo, cfg),
      );
      assert.ok(headMatch);
      assert.equal(headMatch!.hash, passHash);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("verify still matches after GitHub rebase-and-merge onto an unrelated main update", () => {
    const repo = initLab("kc-verify-gh-rebase-");
    const cfg = ciVerifyConfig();
    try {
      writeFileSync(join(repo, "readme.txt"), "base\n");
      git(repo, ["add", "readme.txt"]);
      git(repo, ["commit", "-m", "base"]);

      git(repo, ["checkout", "-b", "feat/rebase"]);
      writeFileSync(join(repo, "rebase.txt"), "rebased\n");
      git(repo, ["add", "rebase.txt"]);
      const fromOid = git(repo, ["rev-parse", "main"]);
      const passHash = computeRangeDiffContext(repo, cfg, fromOid).diffHash;
      git(repo, [
        "commit",
        "-m",
        `rebase feat\n\nKnow-Code-Verified: ${passHash}\n`,
      ]);

      git(repo, ["checkout", "main"]);
      writeFileSync(join(repo, "unrelated.txt"), "main\n");
      git(repo, ["add", "unrelated.txt"]);
      git(repo, ["commit", "-m", "main moves"]);
      const movedMain = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["checkout", "feat/rebase"]);
      git(repo, ["rebase", "main"]);

      assert.equal(parentOids(repo).length, 1, "rebased tip must not be a merge");
      const headMsg = git(repo, ["log", "-1", "--format=%B", "HEAD"]);
      assert.equal(trailerHashFromMessage(headMsg), passHash);
      pinOriginMain(repo, movedMain);

      const result = runVerify(repo, {});
      assert.equal(result.ok, true, result.errors.join("\n"));
      const headMatch = matchHeadTrailer(
        repo,
        "HEAD",
        collectVerifyHashCandidates(repo, cfg),
      );
      assert.ok(headMatch);
      assert.equal(headMatch!.hash, passHash);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("verify matches a GitHub merge-commit landing (MERGE_MESSAGE + PR_TITLE)", () => {
    const repo = initLab("kc-verify-gh-merge-landing-");
    const cfg = ciVerifyConfig();
    try {
      writeFileSync(join(repo, "readme.txt"), "base\n");
      git(repo, ["add", "readme.txt"]);
      git(repo, ["commit", "-m", "base"]);

      git(repo, ["checkout", "-b", "feat/merge-update"]);
      writeFileSync(join(repo, "merge-update.txt"), "merged\n");
      git(repo, ["add", "merge-update.txt"]);
      const fromOid = git(repo, ["rev-parse", "main"]);
      const passHash = computeRangeDiffContext(repo, cfg, fromOid).diffHash;
      git(repo, [
        "commit",
        "-m",
        `merge-update feat\n\nKnow-Code-Verified: ${passHash}\n`,
      ]);

      git(repo, ["checkout", "main"]);
      writeFileSync(join(repo, "unrelated.txt"), "main\n");
      git(repo, ["add", "unrelated.txt"]);
      git(repo, ["commit", "-m", "main moves"]);
      git(repo, ["checkout", "feat/merge-update"]);
      git(repo, ["merge", "main", "-m", "Merge branch 'main' into feat/merge-update"]);
      const featHead = git(repo, ["rev-parse", "HEAD"]);

      git(repo, ["checkout", "main"]);
      const mainBefore = git(repo, ["rev-parse", "HEAD"]);
      git(repo, [
        "merge",
        "--no-ff",
        featHead,
        "-m",
        githubMergeLandingMessage(4, "feat/merge-update", "merge update branch"),
      ]);
      const parents = parentOids(repo);
      assert.equal(parents.length, 2);
      assert.equal(parents[0], mainBefore);
      const landingMsg = git(repo, ["log", "-1", "--format=%B", "HEAD"]);
      assert.equal(trailerHashFromMessage(landingMsg), null);
      pinOriginMain(repo, mainBefore);

      const result = runVerify(repo, {});
      assert.equal(result.ok, true, result.errors.join("\n"));
      assert.equal(result.matched?.label, "merge-base..HEAD");
      assert.match(result.messages.join("\n"), /verified \(range/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
