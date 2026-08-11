import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "./commands/check.js";
import { writeConfig } from "./config.js";
import {
  isGateOpenForShipping,
  pendingCommitMessageHasGroundedTrailer,
  resolveEffectiveQuizState,
  trailerSatisfiesCheck,
} from "./enforcement.js";
import { shouldGate, agentHookBypassesGitHooks } from "./gate-cmd.js";
import { readGate, writeGate } from "./gate.js";
import { computeDiffContext } from "./hash.js";
import {
  hasValidOverrideAllow,
  tryOverrideBypass,
  writeUnsignedOverrideAllow,
  writeSealedOverrideAllow,
} from "./override.js";
import { evaluatePipeline } from "./pipeline.js";
import {
  isSealedRewriteRangeOpen,
  writeRangeSeal,
} from "./range.js";
import { initAttestKey } from "./seal.js";
import {
  git,
  setupOpenGate,
  withTempRepo,
  writeCommitEditMsg,
  writeFile,
  commitAll,
  liteConfig,
} from "./test-helpers.js";
import {
  collectVerifyHashCandidates,
  isGroundedVerifyHash,
} from "./verify-helpers.js";

describe("adversarial bypass attempts", () => {
  it("KNOW_CODE_COMMIT=1 does not open requireTrailer gate", () => {
    const { root, cleanup } = withTempRepo("kc-adv-env-");
    try {
      setupOpenGate(root, { requireTrailer: true });
      process.env.KNOW_CODE_COMMIT = "1";
      assert.equal(runCheck(root).allowed, false);
      delete process.env.KNOW_CODE_COMMIT;
    } finally {
      cleanup();
    }
  });

  it("agent-minted .commit-in-progress is ignored", () => {
    const { root, cleanup } = withTempRepo("kc-adv-token-");
    try {
      setupOpenGate(root, { requireTrailer: true });
      writeFileSync(
        join(root, ".know-code", ".commit-in-progress"),
        JSON.stringify({ pid: 1, createdAt: Date.now() }),
      );
      assert.equal(runCheck(root).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("HEAD trailer alone does not authorize a trailerless pending commit", () => {
    const { root, cleanup } = withTempRepo("kc-adv-head-trail-");
    try {
      const { cfg, hash } = setupOpenGate(root, { requireTrailer: true });
      // Stamp HEAD with grounded trailer
      git(root, [
        "commit",
        "--amend",
        "-m",
        `base\n\nKnow-Code-Verified: ${hash}\n`,
      ]);
      // Re-open gate for post-amend tip hash
      const tipHash = computeDiffContext(root, cfg).diffHash;
      writeGate(root, {
        version: 1,
        diffHash: tipHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: "y",
        headRef: git(root, ["rev-parse", "HEAD"]),
        gatedTreeOid: git(root, ["rev-parse", "HEAD^{tree}"]),
      });

      writeCommitEditMsg(root, "feat: no trailer\n");
      const state = resolveEffectiveQuizState(root, {
        ...cfg,
        requireTrailer: true,
      });
      assert.equal(trailerSatisfiesCheck(root, state), false);
      assert.equal(runCheck(root).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("arbitrary COMMIT_EDITMSG trailer is rejected", () => {
    const { root, cleanup } = withTempRepo("kc-adv-arb-");
    try {
      const { cfg } = setupOpenGate(root, { requireTrailer: true });
      writeCommitEditMsg(
        root,
        `x\n\nKnow-Code-Verified: ${"f".repeat(64)}\n`,
      );
      const state = resolveEffectiveQuizState(root, cfg);
      assert.equal(pendingCommitMessageHasGroundedTrailer(root, state), false);
      assert.equal(runCheck(root).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("unsigned agent-minted override-allow is rejected", () => {
    const { root, cleanup } = withTempRepo("kc-adv-ovr-");
    try {
      setupOpenGate(root);
      writeUnsignedOverrideAllow(root);
      assert.equal(hasValidOverrideAllow(root), false);
      const prev = process.env.KNOW_CODE_OVERRIDE;
      process.env.KNOW_CODE_OVERRIDE = "1";
      delete process.env.KNOW_CODE_HOOK_FORMAT;
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      assert.equal(tryOverrideBypass(root).allowed, false);
      if (prev === undefined) delete process.env.KNOW_CODE_OVERRIDE;
      else process.env.KNOW_CODE_OVERRIDE = prev;
    } finally {
      cleanup();
    }
  });

  it("forged HEAD trailer is not a grounded verify candidate", () => {
    const { root, cleanup } = withTempRepo("kc-adv-verify-");
    try {
      writeFile(root, "f.txt", "x\n");
      const fake = "a".repeat(64);
      commitAll(root, `msg\n\nKnow-Code-Verified: ${fake}\n`);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      assert.equal(isGroundedVerifyHash(root, fake), false);
      const candidates = collectVerifyHashCandidates(root);
      assert.equal(
        candidates.some((c) => c.hash === fake),
        false,
      );
    } finally {
      cleanup();
    }
  });

  it("stale range-seal hash rejected after new commit", () => {
    const { root, cleanup } = withTempRepo("kc-adv-seal-");
    try {
      writeFile(root, "f.txt", "1\n");
      commitAll(root, "base");
      writeFile(root, "f.txt", "2\n");
      commitAll(root, "tip");
      const sealedHead = git(root, ["rev-parse", "HEAD"]);
      const sealHash = "c".repeat(64);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      writeRangeSeal(root, {
        version: 1,
        diffHash: sealHash,
        rangeFromOid: git(root, ["rev-parse", "HEAD~1"]),
        commitCount: 1,
        sealMode: "receipt",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });
      assert.ok(
        collectVerifyHashCandidates(root).some((c) => c.hash === sealHash),
      );
      writeFile(root, "f.txt", "3\n");
      commitAll(root, "after");
      assert.equal(
        collectVerifyHashCandidates(root).some((c) => c.hash === sealHash),
        false,
      );
    } finally {
      cleanup();
    }
  });

  it("post-seal empty commit cannot reopen gate via commitDrift", () => {
    const { root, cleanup } = withTempRepo("kc-adv-seal-head-");
    try {
      writeFile(root, "f.txt", "base\n");
      commitAll(root, "base");
      const fromOid = git(root, ["rev-parse", "HEAD"]);
      const tipHash = "e".repeat(64);
      writeFile(root, "f.txt", "feat\n");
      commitAll(root, `feat\n\nKnow-Code-Verified: ${tipHash}\n`);
      const sealedHead = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({ requireTrailer: false });
      writeConfig(root, cfg);
      writeGate(root, {
        version: 1,
        diffHash: tipHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: fromOid,
        headRef: sealedHead,
        gatedTreeOid: git(root, ["rev-parse", "HEAD^{tree}"]),
        sealedHeadOid: sealedHead,
      });
      writeRangeSeal(root, {
        version: 1,
        diffHash: tipHash,
        rangeFromOid: fromOid,
        commitCount: 1,
        sealMode: "receipt",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });
      // Tree-preserving empty commit with pass-hash trailer after seal
      git(root, [
        "commit",
        "--allow-empty",
        "-m",
        `noop\n\nKnow-Code-Verified: ${tipHash}\n`,
      ]);
      const state = resolveEffectiveQuizState(root, cfg);
      assert.equal(state.commitDrift, true);
      assert.equal(
        isGateOpenForShipping(root, readGate(root), state, cfg.level),
        false,
      );
      assert.equal(runCheck(root, { push: true }).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("deleting range-seal.json does not drop sealedHeadOid gate binding", () => {
    const { root, cleanup } = withTempRepo("kc-adv-seal-rm-");
    try {
      writeFile(root, "f.txt", "base\n");
      commitAll(root, "base");
      const fromOid = git(root, ["rev-parse", "HEAD"]);
      const tipHash = "f".repeat(64);
      writeFile(root, "f.txt", "feat\n");
      commitAll(root, `feat\n\nKnow-Code-Verified: ${tipHash}\n`);
      const sealedHead = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({ requireTrailer: false });
      writeConfig(root, cfg);
      writeGate(root, {
        version: 1,
        diffHash: tipHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: fromOid,
        headRef: sealedHead,
        gatedTreeOid: git(root, ["rev-parse", "HEAD^{tree}"]),
        sealedHeadOid: sealedHead,
      });
      writeRangeSeal(root, {
        version: 1,
        diffHash: tipHash,
        rangeFromOid: fromOid,
        commitCount: 1,
        sealMode: "receipt",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });
      rmSync(join(root, ".know-code", "range-seal.json"));
      git(root, [
        "commit",
        "--allow-empty",
        "-m",
        `noop\n\nKnow-Code-Verified: ${tipHash}\n`,
      ]);
      assert.equal(runCheck(root, { push: true }).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("unsigned sealed-head-binding.json alone does not bind when requireAttest is false (E19)", async () => {
    const { root, cleanup } = withTempRepo("kc-adv-bind-file-");
    try {
      writeFile(root, "f.txt", "base\n");
      commitAll(root, "base");
      const fromOid = git(root, ["rev-parse", "HEAD"]);
      const tipHash = "b".repeat(64);
      writeFile(root, "f.txt", "feat\n");
      commitAll(root, `feat\n\nKnow-Code-Verified: ${tipHash}\n`);
      const sealedHead = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({ requireTrailer: false });
      writeConfig(root, cfg);
      writeGate(root, {
        version: 1,
        diffHash: tipHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: fromOid,
        headRef: sealedHead,
        gatedTreeOid: git(root, ["rev-parse", "HEAD^{tree}"]),
      });
      writeFileSync(
        join(root, ".know-code", "sealed-head-binding.json"),
        `${JSON.stringify({
          version: 1,
          sealedHeadOid: sealedHead,
          boundAt: new Date().toISOString(),
          diffHash: tipHash,
        })}\n`,
      );
      const { sealedHeadBinding } = await import("./range-seal-bind.js");
      // Standalone unsigned binding must not bind HEAD when requireAttest is false.
      assert.equal(sealedHeadBinding(root), null);
    } finally {
      cleanup();
    }
  });

  it("rewrite-open does not allow newly staged work after seal", () => {
    const { root, cleanup } = withTempRepo("kc-adv-rewrite-");
    try {
      writeFile(root, "f.txt", "base\n");
      commitAll(root, "base");
      const fromOid = git(root, ["rev-parse", "HEAD"]);
      const tipHash = "d".repeat(64);
      writeFile(root, "f.txt", "feat\n");
      commitAll(root, `feat\n\nKnow-Code-Verified: ${tipHash}\n`);
      const sealedHead = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ requireTrailer: false }));
      writeGate(root, {
        version: 1,
        diffHash: tipHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: fromOid,
        headRef: sealedHead,
        gatedTreeOid: git(root, ["rev-parse", "HEAD^{tree}"]),
      });
      writeRangeSeal(root, {
        version: 1,
        diffHash: tipHash,
        rangeFromOid: fromOid,
        commitCount: 1,
        sealMode: "rewrite",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });
      // Stale tipHash gate ≠ current tip hash → gate closed; rewrite-open at tip
      assert.equal(isSealedRewriteRangeOpen(root), true);
      assert.equal(runCheck(root).allowed, true);

      // Stage new work — must not stay open for shipping
      writeFile(root, "f.txt", "sneak\n");
      git(root, ["add", "f.txt"]);
      assert.equal(runCheck(root).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("corrupt gate/answers never throw in pipeline or check", () => {
    const { root, cleanup } = withTempRepo("kc-adv-corrupt-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      writeFileSync(join(root, ".know-code", "gate.json"), "{bad");
      writeFileSync(join(root, ".know-code", "answers.json"), "{bad");
      assert.doesNotThrow(() => evaluatePipeline(root));
      assert.doesNotThrow(() => runCheck(root));
      assert.equal(evaluatePipeline(root).allowed, false);
      assert.equal(runCheck(root).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("shouldGate ignores incidental prose mentioning git commit", () => {
    assert.equal(shouldGate('echo "mention git commit"'), false);
    assert.equal(shouldGate("git commit -m x"), true);
    assert.equal(
      shouldGate("git -c core.hooksPath=/dev/null commit -m x"),
      true,
    );
    assert.equal(
      agentHookBypassesGitHooks(
        "git -c core.hooksPath=/dev/null commit -m trailerless",
      ),
      true,
    );
    assert.equal(shouldGate("gh pr create"), true);
  });

  it("stale grounded EDITMSG cannot authorize pre-push without HEAD trailer", () => {
    const { root, cleanup } = withTempRepo("kc-adv-push-editmsg-");
    try {
      const { hash } = setupOpenGate(root, { requireTrailer: true });
      // HEAD has no trailer; forge a distinct grounded EDITMSG
      writeCommitEditMsg(root, `push bait\n\nKnow-Code-Verified: ${hash}\n`);
      assert.equal(runCheck(root).allowed, true); // pre-commit allows pending
      assert.equal(runCheck(root, { push: true }).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("unstaged tracked edits close an otherwise open gate (TOCTOU)", () => {
    const { root, cleanup } = withTempRepo("kc-adv-unstaged-");
    try {
      setupOpenGate(root, { requireTrailer: false });
      writeFile(root, "a.txt", "evil\n");
      assert.equal(runCheck(root).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("amend --no-edit cannot ship stale trailer on changed tree", () => {
    const { root, cleanup } = withTempRepo("kc-adv-amend-tree-");
    try {
      const { cfg, hash } = setupOpenGate(root, { requireTrailer: true });
      git(root, [
        "commit",
        "--amend",
        "-m",
        `base\n\nKnow-Code-Verified: ${hash}\n`,
      ]);
      const tipHash = computeDiffContext(root, cfg).diffHash;
      writeGate(root, {
        version: 1,
        diffHash: tipHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: "y",
        headRef: git(root, ["rev-parse", "HEAD"]),
        gatedTreeOid: git(root, ["rev-parse", "HEAD^{tree}"]),
      });
      writeFile(root, "a.txt", "evil\n");
      git(root, ["add", "a.txt"]);
      git(root, ["commit", "--amend", "--no-edit"]);
      assert.equal(runCheck(root, { push: true }).allowed, false);
    } finally {
      cleanup();
    }
  });

  it("override peek does not consume allow before check", async () => {
    const { root, cleanup } = withTempRepo("kc-adv-ovr-peek-");
    const attestHome = mkdtempSync(join(tmpdir(), "kc-adv-ovr-home-"));
    const prevHome = process.env.KNOW_CODE_ATTEST_HOME;
    const prevPass = process.env.KNOW_CODE_ATTEST_PASSPHRASE;
    const prevOvr = process.env.KNOW_CODE_OVERRIDE;
    const prevHook = process.env.KNOW_CODE_HOOK_FORMAT;
    try {
      process.env.KNOW_CODE_ATTEST_HOME = attestHome;
      process.env.KNOW_CODE_ATTEST_PASSPHRASE = "peek-pass";
      delete process.env.KNOW_CODE_HOOK_FORMAT;
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      setupOpenGate(root, { requireAttest: true });
      initAttestKey(root, "peek-pass");
      await writeSealedOverrideAllow(root, { passphrase: "peek-pass" });
      process.env.KNOW_CODE_OVERRIDE = "1";
      assert.equal(tryOverrideBypass(root, { consume: false }).allowed, true);
      assert.equal(hasValidOverrideAllow(root), true);
      assert.equal(tryOverrideBypass(root, { consume: true }).allowed, true);
      assert.equal(hasValidOverrideAllow(root), false);
    } finally {
      if (prevHome === undefined) delete process.env.KNOW_CODE_ATTEST_HOME;
      else process.env.KNOW_CODE_ATTEST_HOME = prevHome;
      if (prevPass === undefined) delete process.env.KNOW_CODE_ATTEST_PASSPHRASE;
      else process.env.KNOW_CODE_ATTEST_PASSPHRASE = prevPass;
      if (prevOvr === undefined) delete process.env.KNOW_CODE_OVERRIDE;
      else process.env.KNOW_CODE_OVERRIDE = prevOvr;
      if (prevHook === undefined) delete process.env.KNOW_CODE_HOOK_FORMAT;
      else process.env.KNOW_CODE_HOOK_FORMAT = prevHook;
      rmSync(attestHome, { recursive: true, force: true });
      cleanup();
    }
  });
});
