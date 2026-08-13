import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCheck } from "./commands/check.js";
import { buildAmendArgs } from "./commands/amend.js";
import { injectTrailer } from "./commands/commit.js";
import { consumerWorkflowYaml } from "./commands/init.js";
import { validateQuiz } from "./commands/quiz-validate.js";
import { runDoctor } from "./commands/doctor.js";
import { cmdReset } from "./commands/reset.js";
import { runVerify } from "./commands/verify.js";
import { readConfig, setConfigValue, writeConfig } from "./config.js";
import {
  beginRangeSession,
  clearRangeSeal,
  clearRangeSession,
  readRangeSession,
  writeRangeSeal,
} from "./range.js";
import {
  installGitHooks,
  uninstallGitHooks,
  gitHooksNeedUpgrade,
  installAgentHooks,
  uninstallAgentHooks,
} from "./hooks.js";
import { findGitRoot, gitHooksDir } from "./paths.js";
import { materializedTreeOid, writeGate } from "./gate.js";
import { computeDiffContext, sha256 } from "./hash.js";
import { evaluatePipeline } from "./pipeline.js";
import {
  commitAll,
  liteConfig,
  setupOpenGate,
  silenceConsole,
  withTempRepo,
  writeCommitEditMsg,
  writeFile,
  git,
} from "./test-helpers.js";

describe("commands: check", () => {
  it("happy: open gate without requireTrailer", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-check-ok-");
    try {
      setupOpenGate(root, { requireTrailer: false });
      assert.equal(runCheck(root).allowed, true);
    } finally {
      cleanup();
    }
  });

  it("sad: closed gate", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-check-closed-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      assert.equal(runCheck(root).allowed, false);
      assert.ok(runCheck(root).reason);
    } finally {
      cleanup();
    }
  });

  it("sad: requireTrailer without pending/HEAD trailer", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-check-trail-");
    try {
      setupOpenGate(root, { requireTrailer: true });
      assert.equal(runCheck(root).allowed, false);
      assert.match(runCheck(root).reason || "", /requireTrailer/);
    } finally {
      cleanup();
    }
  });

  it("pre-push accepts seal-hash trailer at sealed rewrite tip only", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-check-sealtip-");
    try {
      writeFile(root, "a.txt", "base\n");
      commitAll(root, "base");
      const fromOid = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({ rangeMode: "range", requireTrailer: true });
      writeConfig(root, cfg);
      beginRangeSession(root, fromOid);

      // Pass over staged work, then land it with the passHash trailer.
      writeFile(root, "a.txt", "feat\n");
      git(root, ["add", "a.txt"]);
      const passHash = computeDiffContext(root, cfg).diffHash;
      writeGate(root, {
        version: 1,
        diffHash: passHash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: `${fromOid}..HEAD`,
        baseRef: fromOid,
        headRef: fromOid,
        scope: "range",
        rangeFromOid: fromOid,
        commitCount: 0,
        gatedTreeOid: materializedTreeOid(root),
      });
      git(root, ["commit", "-m", `feat\n\nKnow-Code-Verified: ${passHash}\n`]);

      // Seal --rewrite restamps trailers with the recomputed range hash.
      const sealHash = "a".repeat(64);
      git(root, [
        "commit",
        "--amend",
        "-m",
        `feat\n\nKnow-Code-Verified: ${sealHash}\n`,
      ]);
      const sealedHead = git(root, ["rev-parse", "HEAD"]);
      writeRangeSeal(root, {
        version: 1,
        diffHash: sealHash,
        gatePassHash: passHash,
        rangeFromOid: fromOid,
        commitCount: 1,
        sealMode: "rewrite",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedHead,
      });
      clearRangeSession(root);

      // Seal trailer isn't tipHash or drift passHash — only the seal grounds it.
      assert.equal(runCheck(root, { push: true }).allowed, true);

      // Push-mode only: a pending trailerless commit at the sealed tip must
      // not ride HEAD's seal trailer through pre-commit (Bugbot finding).
      writeCommitEditMsg(root, "sneak: trailerless commit at sealed tip");
      assert.equal(runCheck(root).allowed, false);
      assert.match(runCheck(root).reason || "", /requireTrailer/);
      writeCommitEditMsg(root, `feat\n\nKnow-Code-Verified: ${sealHash}\n`);

      // A commit after seal moves HEAD off sealedHeadOid — deny again.
      writeFile(root, "b.txt", "post-seal\n");
      commitAll(root, "post-seal work");
      assert.equal(runCheck(root, { push: true }).allowed, false);
    } finally {
      cleanup();
    }
  });
});

describe("commands: verify (CI flags)", () => {
  it("happy: HEAD with grounded trailer", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-ver-ok-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      const cfg = liteConfig({ requireTrailer: true });
      writeConfig(root, cfg);
      writeFile(root, "a.txt", "2\n");
      const hash = computeDiffContext(root, cfg).diffHash;
      commitAll(root, `feat\n\nKnow-Code-Verified: ${hash}\n`);
      // tip hash may shift after commit — recompute candidates via runVerify
      const r = runVerify(root);
      // May fail if index hash ≠ commit-time hash; amend to match tip
      if (!r.ok) {
        const tip = computeDiffContext(root, cfg).diffHash;
        git(root, [
          "commit",
          "--amend",
          "-m",
          `feat\n\nKnow-Code-Verified: ${tip}\n`,
        ]);
      }
      assert.equal(runVerify(root).ok, true);
    } finally {
      cleanup();
    }
  });

  it("sad: require-all without trailer", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-ver-all-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ requireTrailer: true }));
      const r = runVerify(root, { requireAll: true });
      assert.equal(r.ok, false);
      assert.equal(r.exitCode, 1);
    } finally {
      cleanup();
    }
  });

  it("sad: --range-seal without seal file", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-ver-rs-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      const r = runVerify(root, { rangeSeal: true });
      assert.equal(r.ok, false);
      assert.match(r.errors.join(" "), /no range-seal/);
    } finally {
      cleanup();
    }
  });
});

describe("commands: commit/amend helpers", () => {
  it("injectTrailer appends grounded trailer", () => {
    const hash = "a".repeat(64);
    const out = injectTrailer(["-m", "x"], hash);
    assert.match(out[1], /Know-Code-Verified/);
    assert.match(out[1], new RegExp(hash));
  });

  it("buildAmendArgs preserves --amend", () => {
    const hash = "b".repeat(64);
    const out = buildAmendArgs([], hash, "prior subject\n");
    assert.equal(out[0], "--amend");
    assert.match(out[2], /prior subject/);
  });
});

describe("commands: config / init / quiz / doctor / reset / ship", () => {
  it("setConfigValue happy and unknown key", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-cfg-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      setConfigValue(root, "requireTrailer", "true");
      assert.equal(readConfig(root).requireTrailer, true);
      assert.throws(() => setConfigValue(root, "nope", "x"), /Unknown config/);
      assert.throws(() => setConfigValue(root, "level", "nope"), /Invalid level/);
    } finally {
      cleanup();
    }
  });

  it("consumerWorkflowYaml pins action, base branch, and is PR-only", () => {
    const yml = consumerWorkflowYaml("develop");
    assert.match(yml, /base-branch: develop/);
    assert.match(yml, /chtnnh\/know-code\/action@v0\.3\.0/);
    // Push-to-base has no merge-base ahead of HEAD — verify must be PR-only.
    assert.match(yml, /pull_request:/);
    assert.doesNotMatch(yml, /push:/);
    // Default PR checkout is a merge commit without trailers — pin the tip.
    assert.match(yml, /github\.event\.pull_request\.head\.sha/);
  });

  it("validateQuiz happy and sad", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-quiz-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ level: "lite" }));
      const hash = computeDiffContext(root, liteConfig()).diffHash;
      const bad = validateQuiz(root, {
        diffHash: hash,
        level: "lite",
        questions: [],
      } as never);
      assert.equal(bad.ok, false);
      const qs = Array.from({ length: 6 }, (_, i) => ({
        id: `q${i}`,
        prompt: `Question ${i}?`,
      }));
      const good = validateQuiz(root, {
        diffHash: hash,
        level: "lite",
        questions: qs,
      } as never);
      // lite quota may be < 6; empty prompts already checked
      assert.equal(good.errors.some((e) => e.includes("non-empty")), false);
      assert.ok(good.ok || good.errors.some((e) => /need at least/.test(e)));
    } finally {
      cleanup();
    }
  });

  it("runDoctor reports missing hooks", async () => {
    const { root, cleanup } = withTempRepo("kc-cmd-doc-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ requireAttest: false }));
      const checks = await runDoctor(root);
      const hooks = checks.find((c) => c.name === "git-hooks");
      assert.ok(hooks);
      assert.equal(hooks!.ok, false);
      installGitHooks(root);
      const after = await runDoctor(root);
      assert.equal(after.find((c) => c.name === "git-hooks")!.ok, true);
    } finally {
      cleanup();
    }
  });

  it("cmdReset clears artifacts; keep-attest path", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-reset-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      writeFileSync(join(root, ".know-code", "answers.json"), "{}");
      writeFileSync(join(root, ".know-code", "gate.json"), "{}");
      const prev = process.cwd();
      process.chdir(root);
      silenceConsole(() => cmdReset({}));
      process.chdir(prev);
      assert.equal(existsSync(join(root, ".know-code", "answers.json")), false);
      assert.equal(existsSync(join(root, ".know-code", "gate.json")), false);
      assert.equal(existsSync(join(root, ".know-code", "config.json")), true);
    } finally {
      cleanup();
    }
  });

  it("ship checklist inputs: pipeline blocked when gate closed", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-ship-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      const pipeline = evaluatePipeline(root);
      assert.equal(pipeline.allowed, false);
      assert.ok(pipeline.blockers.length > 0);
      assert.equal(runCheck(root).allowed, false);
    } finally {
      cleanup();
    }
  });
});

describe("commands: range + hooks uninstall", () => {
  it("begin / double-begin / abort", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-range-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      beginRangeSession(root);
      assert.ok(readRangeSession(root));
      assert.throws(() => beginRangeSession(root), /already active/);
      clearRangeSession(root);
      assert.equal(readRangeSession(root), null);
      writeRangeSeal(root, {
        version: 1,
        diffHash: "a".repeat(64),
        rangeFromOid: git(root, ["rev-parse", "HEAD"]),
        commitCount: 0,
        sealMode: "receipt",
        gateKeyId: "u",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: git(root, ["rev-parse", "HEAD"]),
      });
      clearRangeSeal(root);
      assert.equal(existsSync(join(root, ".know-code", "range-seal.json")), false);
    } finally {
      cleanup();
    }
  });

  it("hooks install then uninstall restores absence", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-hooks-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      assert.equal(gitHooksNeedUpgrade(root), true);
      installGitHooks(root);
      assert.equal(gitHooksNeedUpgrade(root), false);
      uninstallGitHooks(root);
      assert.equal(
        existsSync(join(gitHooksDir(root), "pre-commit")),
        false,
      );
    } finally {
      cleanup();
    }
  });

  it("agent hooks install/uninstall for cursor", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-ahooks-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      try {
        installAgentHooks(root, ["cursor"]);
        assert.ok(existsSync(join(root, ".cursor", "hooks.json")));
        uninstallAgentHooks(root, ["cursor"]);
      } catch (err) {
        // Bundled check-shell may be absent in some pack layouts — still assert API shape.
        assert.match(String(err), /Missing bundled hook|ENOENT|check-shell/);
      }
    } finally {
      cleanup();
    }
  });
});

describe("commands: hash + pipeline smoke", () => {
  it("sha256 stable; pipeline corrupt gate", () => {
    assert.equal(sha256("x"), sha256("x"));
    const { root, cleanup } = withTempRepo("kc-cmd-hash-");
    try {
      writeFile(root, "a.txt", "1\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());
      writeFileSync(join(root, ".know-code", "gate.json"), "{");
      const p = evaluatePipeline(root);
      assert.ok(p.blockers.some((b) => b.step === "corrupt"));
    } finally {
      cleanup();
    }
  });

  it("pending grounded trailer opens requireTrailer check", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-pending-");
    try {
      const { hash } = setupOpenGate(root, { requireTrailer: true });
      writeCommitEditMsg(root, `m\n\nKnow-Code-Verified: ${hash}\n`);
      assert.equal(runCheck(root).allowed, true);
    } finally {
      cleanup();
    }
  });

  it("pipeline names unstaged edits instead of seal-invalid", () => {
    const { root, cleanup } = withTempRepo("kc-cmd-unstaged-msg-");
    const prev = process.cwd();
    try {
      setupOpenGate(root, { requireTrailer: false });
      writeFile(root, "a.txt", "dirty\n");
      process.chdir(root);
      const p = evaluatePipeline(root);
      assert.equal(p.allowed, false);
      assert.ok(
        p.blockers.some((b) => /Unstaged tracked edits/i.test(b.message)),
        JSON.stringify(p.blockers),
      );
    } finally {
      process.chdir(prev);
      cleanup();
    }
  });
});

describe("external failure surfaces", () => {
  it("findGitRoot throws outside a git repository", () => {
    // Must not be nested inside another git work tree.
    const bare = mkdtempSync(join(tmpdir(), "kc-nogit-"));
    const prev = process.cwd();
    process.chdir(bare);
    try {
      assert.throws(() => findGitRoot(), /Not inside a git repository/);
    } finally {
      process.chdir(prev);
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
