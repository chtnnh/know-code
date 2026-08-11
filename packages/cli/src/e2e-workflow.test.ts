import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./commands/check.js";
import { injectTrailer } from "./commands/commit.js";
import { runVerify } from "./commands/verify.js";
import { writeConfig } from "./config.js";
import { writeGate, materializedTreeOid } from "./gate.js";
import { computeDiffContext, resolveQuizContext } from "./hash.js";
import { installGitHooks, gitGateHookIsCurrent } from "./hooks.js";
import { gitHooksDir } from "./paths.js";
import { evaluatePipeline } from "./pipeline.js";
import {
  beginRangeSession,
  clearRangeSession,
  readRangeSession,
  writeRangeSeal,
} from "./range.js";
import {
  git,
  withTempRepo,
  writeFile,
  commitAll,
  liteConfig,
  writeCommitEditMsg,
} from "./test-helpers.js";
import { messageWithTrailer } from "./trailers.js";
import { readFileSync } from "node:fs";
import {
  collectVerifyHashCandidates,
  primaryVerifyCandidate,
} from "./verify-helpers.js";

describe("e2e workflows", () => {
  it("index flow: open gate + grounded pending trailer → check allows", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-index-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({ requireTrailer: true });
      writeConfig(root, cfg);
      writeFile(root, "a.txt", "2\n");
      git(root, ["add", "a.txt"]);
      const hash = computeDiffContext(root, cfg).diffHash;
      writeGate(root, {
        version: 1,
        diffHash: hash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: "y",
        headRef: git(root, ["rev-parse", "HEAD"]),
        gatedTreeOid: materializedTreeOid(root),
      });
      assert.equal(runCheck(root).allowed, false);
      const msg = injectTrailer(["-m", "feat: change"], hash)[1];
      writeCommitEditMsg(root, msg);
      assert.equal(runCheck(root).allowed, true);
    } finally {
      cleanup();
    }
  });

  it("range begin → commits → verify grounded tip trailer", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-range-");
    try {
      writeFile(root, "a.txt", "base\n");
      commitAll(root, "base");
      // Keep baseBranch behind HEAD so verify sees merge-base..HEAD.
      const baseOid = git(root, ["rev-parse", "HEAD"]);
      git(root, ["branch", "trunk", baseOid]);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({
        rangeMode: "range",
        baseBranch: "trunk",
      });
      writeConfig(root, cfg);
      const session = beginRangeSession(root, baseOid);
      assert.ok(readRangeSession(root));

      writeFile(root, "a.txt", "feat\n");
      commitAll(root, "feat: work");
      // Stamp the grounded verify candidate (merge-base..HEAD).
      const primary = primaryVerifyCandidate(
        collectVerifyHashCandidates(root, cfg),
      );
      git(root, [
        "commit",
        "--amend",
        "-m",
        messageWithTrailer("feat: work", primary.hash),
      ]);

      const verify = runVerify(root, {});
      assert.equal(verify.ok, true, verify.errors.join("\n"));

      clearRangeSession(root);
      assert.equal(readRangeSession(root), null);
    } finally {
      cleanup();
    }
  });

  it("hooks install → script current → pre-commit invokes check path", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-hooks-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      installGitHooks(root);
      const pre = readFileSync(join(gitHooksDir(root), "pre-commit"), "utf8");
      assert.equal(gitGateHookIsCurrent(pre), true);
      assert.match(pre, /unset KNOW_CODE_COMMIT/);
      assert.match(pre, /know-code.*check|index\.js" check/);
    } finally {
      cleanup();
    }
  });

  it("pipeline blockers order: taught before quiz before answers", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-pipe-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ requireAttest: false }));
      const p = evaluatePipeline(root);
      assert.equal(p.allowed, false);
      const steps = p.blockers.map((b) => b.step);
      assert.ok(steps.includes("taught"));
      assert.ok(steps.includes("quiz") || steps.includes("answers"));
    } finally {
      cleanup();
    }
  });

  it("CI-shaped verify --require-all fails without trailer", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-ci-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      writeFile(root, "a.txt", "2\n");
      commitAll(root, "feat without trailer");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ requireTrailer: true }));
      const r = runVerify(root, { requireAll: true });
      assert.equal(r.ok, false);
      assert.equal(r.exitCode, 1);
      assert.ok(r.errors.some((e) => /require-all|no matching/i.test(e)));
    } finally {
      cleanup();
    }
  });

  it("verify --require-range-trailers rejects ungrounded uniform hash", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-rrt-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      const from = git(root, ["rev-parse", "HEAD"]);
      const fake = "e".repeat(64);
      writeFile(root, "a.txt", "2\n");
      commitAll(root, messageWithTrailer("c1", fake));
      writeFile(root, "a.txt", "3\n");
      commitAll(root, messageWithTrailer("c2", fake));
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ rangeMode: "range" }));
      beginRangeSession(root, from);
      // Force session fromOid to base
      writeFileSync(
        join(root, ".know-code", "range.json"),
        JSON.stringify({
          version: 1,
          fromOid: from,
          fromRef: from,
          startedAt: new Date().toISOString(),
          startHead: from,
        }),
      );
      writeRangeSeal(root, {
        version: 1,
        diffHash: fake,
        rangeFromOid: from,
        commitCount: 2,
        sealMode: "rewrite",
        gateKeyId: "u",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: git(root, ["rev-parse", "HEAD"]),
      });
      const r = runVerify(root, { requireRangeTrailers: true });
      // seal hash is accepted as candidate only at sealedHead — but fake may not match computed
      // If seal is at HEAD, range-seal candidate is added — then range trailers match seal hash
      // For ungrounded: clear seal and rely on inferred fake
      writeFileSync(join(root, ".know-code", "range-seal.json"), "");
      const r2 = runVerify(root, { requireRangeTrailers: true });
      assert.equal(r2.ok, false);
      void r;
    } finally {
      cleanup();
    }
  });

  it("sliced know-code commit survives real pre-commit hook (temp index + index.lock)", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-slice-hook-");
    try {
      writeFile(root, "base.txt", "base\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({ rangeMode: "range", requireTrailer: true });
      writeConfig(root, cfg);
      installGitHooks(root);

      // Point the hook's preferred CLI path at the real local build so the
      // test never falls back to a global/npx know-code.
      const realIndex = join(dirname(fileURLToPath(import.meta.url)), "index.js");
      mkdirSync(join(root, "packages", "cli", "dist"), { recursive: true });
      writeFileSync(
        join(root, "packages", "cli", "dist", "index.js"),
        `const { spawnSync } = require("node:child_process");\n` +
          `const r = spawnSync(process.execPath, [${JSON.stringify(realIndex)}, ...process.argv.slice(2)], { stdio: "inherit" });\n` +
          `process.exit(r.status ?? 1);\n`,
      );

      const fromOid = git(root, ["rev-parse", "HEAD"]);
      beginRangeSession(root, fromOid);
      writeFile(root, "slice-a.txt", "a\n");
      writeFile(root, "slice-b.txt", "b\n");
      git(root, ["add", "slice-a.txt", "slice-b.txt"]);

      const ctx = resolveQuizContext(root, cfg);
      writeGate(root, {
        version: 1,
        diffHash: ctx.diffHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: ctx.commitRange,
        baseRef: ctx.baseRef,
        headRef: ctx.headRef,
        scope: "range",
        rangeFromOid: fromOid,
        commitCount: ctx.commitCount,
        gatedTreeOid: materializedTreeOid(root),
      });

      const kc = (args: string[]) =>
        execFileSync(process.execPath, [realIndex, ...args], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      // Partial commits: git exports GIT_INDEX_FILE (temp slice index) and
      // holds .git/index.lock while the pre-commit hook runs know-code check.
      kc(["commit", "-m", "feat: slice a", "--", "slice-a.txt"]);
      kc(["commit", "-m", "feat: slice b", "--", "slice-b.txt"]);

      const trailers = git(root, [
        "log",
        "-2",
        "--format=%(trailers:key=Know-Code-Verified,valueonly)",
      ])
        .split("\n")
        .filter(Boolean);
      assert.deepEqual(trailers, [ctx.diffHash, ctx.diffHash]);
      assert.equal(git(root, ["log", "--oneline", `${fromOid}..HEAD`]).split("\n").length, 2);
      assert.equal(git(root, ["diff", "--name-only"]), "");
    } finally {
      cleanup();
    }
  });

  it("resolveQuizContext switches to range when session active", () => {
    const { root, cleanup } = withTempRepo("kc-e2e-scope-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ rangeMode: "auto" }));
      assert.equal(resolveQuizContext(root).scope, "index");
      beginRangeSession(root);
      writeFile(root, "a.txt", "2\n");
      git(root, ["add", "a.txt"]);
      assert.equal(resolveQuizContext(root).scope, "range");
    } finally {
      cleanup();
    }
  });
});
