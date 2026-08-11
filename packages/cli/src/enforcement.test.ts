import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCheck } from "./commands/check.js";
import { writeConfig } from "./config.js";
import {
  isGateOpenForShipping,
  pendingCommitMessageHasGroundedTrailer,
  resolveEffectiveQuizState,
} from "./enforcement.js";
import { computeDiffContext } from "./hash.js";
import { evaluatePipeline } from "./pipeline.js";
import { readGate, writeGate } from "./gate.js";
import { DEFAULT_CONFIG } from "./types.js";
import { cmdStatus } from "./commands/status.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function setupLiteGate(repo: string): { hash: string; cfg: typeof DEFAULT_CONFIG & { level: "lite"; requireTrailer: boolean; requireAttest: boolean } } {
  git(repo, ["init", "-b", "main", "--template="]);
  git(repo, ["config", "user.email", "t@test"]);
  git(repo, ["config", "user.name", "t"]);
  writeFileSync(join(repo, "a.txt"), "1\n");
  git(repo, ["add", "a.txt"]);
  git(repo, ["commit", "-m", "base"]);
  mkdirSync(join(repo, ".know-code"), { recursive: true });
  const cfg = {
    ...DEFAULT_CONFIG,
    level: "lite" as const,
    requireTrailer: true,
    requireAttest: false,
  };
  writeConfig(repo, cfg);
  const hash = computeDiffContext(repo, cfg).diffHash;
  writeGate(repo, {
    version: 1,
    diffHash: hash,
    level: "lite",
    passedAt: new Date().toISOString(),
    commitRange: "x",
    baseRef: "y",
    headRef: git(repo, ["rev-parse", "HEAD"]),
    gatedTreeOid: git(repo, ["rev-parse", "HEAD^{tree}"]),
  });
  return { hash, cfg };
}

describe("enforcement kernel", () => {
  it("KNOW_CODE_COMMIT env does not bypass requireTrailer", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-commit-env-"));
    try {
      setupLiteGate(repo);
      const prev = process.env.KNOW_CODE_COMMIT;
      process.env.KNOW_CODE_COMMIT = "1";
      const r = runCheck(repo);
      if (prev === undefined) delete process.env.KNOW_CODE_COMMIT;
      else process.env.KNOW_CODE_COMMIT = prev;

      assert.equal(r.allowed, false);
      assert.match(r.reason || "", /requireTrailer/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("pending COMMIT_EDITMSG with grounded trailer allows requireTrailer", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-pending-"));
    try {
      const { hash, cfg } = setupLiteGate(repo);
      assert.equal(runCheck(repo).allowed, false);

      const editMsg = git(repo, ["rev-parse", "--git-path", "COMMIT_EDITMSG"]);
      const editPath = join(repo, editMsg);
      writeFileSync(
        editPath,
        `feat: x\n\nKnow-Code-Verified: ${hash}\n`,
      );

      const state = resolveEffectiveQuizState(repo, cfg);
      assert.equal(pendingCommitMessageHasGroundedTrailer(repo, state), true);
      assert.equal(runCheck(repo).allowed, true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("arbitrary trailer in COMMIT_EDITMSG does not satisfy requireTrailer", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-arb-"));
    try {
      const { cfg } = setupLiteGate(repo);
      const editMsg = git(repo, ["rev-parse", "--git-path", "COMMIT_EDITMSG"]);
      writeFileSync(
        join(repo, editMsg),
        `feat: x\n\nKnow-Code-Verified: ${"a".repeat(64)}\n`,
      );
      const state = resolveEffectiveQuizState(repo, cfg);
      assert.equal(pendingCommitMessageHasGroundedTrailer(repo, state), false);
      assert.equal(runCheck(repo).allowed, false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("agent-minted .commit-in-progress is ignored", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-forge-token-"));
    try {
      setupLiteGate(repo);
      writeFileSync(
        join(repo, ".know-code", ".commit-in-progress"),
        JSON.stringify({ pid: 1, createdAt: Date.now() }),
      );
      assert.equal(runCheck(repo).allowed, false);
      assert.match(runCheck(repo).reason || "", /requireTrailer/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("corrupt answers.json becomes pipeline blocker not throw", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-corrupt-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      writeConfig(repo, { ...DEFAULT_CONFIG, requireAttest: false });
      writeFileSync(join(repo, ".know-code", "answers.json"), "{bad");
      const pipeline = evaluatePipeline(repo);
      assert.equal(
        pipeline.blockers.some((b) => b.step === "corrupt"),
        true,
      );
      assert.equal(pipeline.allowed, false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("corrupt gate.json does not throw in resolveEffectiveQuizState or pipeline", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-corrupt-gate-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      writeFileSync(join(repo, "a.txt"), "1\n");
      git(repo, ["add", "a.txt"]);
      git(repo, ["commit", "-m", "base"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      writeConfig(repo, { ...DEFAULT_CONFIG, requireAttest: false });
      writeFileSync(join(repo, ".know-code", "gate.json"), "{bad");
      assert.doesNotThrow(() => resolveEffectiveQuizState(repo));
      const pipeline = evaluatePipeline(repo);
      assert.equal(
        pipeline.blockers.some((b) => b.step === "corrupt"),
        true,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("status does not throw on corrupt taught/answers", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-status-corrupt-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      writeFileSync(join(repo, "a.txt"), "1\n");
      git(repo, ["add", "a.txt"]);
      git(repo, ["commit", "-m", "base"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      writeConfig(repo, { ...DEFAULT_CONFIG, requireAttest: false });
      writeFileSync(join(repo, ".know-code", "taught.json"), "{bad");
      writeFileSync(join(repo, ".know-code", "answers.json"), "{bad");
      const prev = process.cwd();
      const log = console.log;
      console.log = () => {};
      process.chdir(repo);
      try {
        assert.doesNotThrow(() => cmdStatus({ json: true }));
      } finally {
        console.log = log;
        process.chdir(prev);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("isGateOpenForShipping matches tip hash without drift", () => {
    const repo = mkdtempSync(join(tmpdir(), "kc-enf-open-"));
    try {
      git(repo, ["init", "-b", "main", "--template="]);
      git(repo, ["config", "user.email", "t@test"]);
      git(repo, ["config", "user.name", "t"]);
      writeFileSync(join(repo, "a.txt"), "1\n");
      git(repo, ["add", "a.txt"]);
      git(repo, ["commit", "-m", "base"]);
      mkdirSync(join(repo, ".know-code"), { recursive: true });
      const cfg = {
        ...DEFAULT_CONFIG,
        level: "lite" as const,
        requireAttest: false,
      };
      writeConfig(repo, cfg);
      const hash = computeDiffContext(repo, cfg).diffHash;
      writeGate(repo, {
        version: 1,
        diffHash: hash,
        level: "lite",
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: "y",
        headRef: git(repo, ["rev-parse", "HEAD"]),
        gatedTreeOid: git(repo, ["rev-parse", "HEAD^{tree}"]),
      });
      const state = resolveEffectiveQuizState(repo, cfg);
      assert.equal(state.commitDrift, false);
      assert.equal(
        isGateOpenForShipping(repo, readGate(repo), state, "lite"),
        true,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
