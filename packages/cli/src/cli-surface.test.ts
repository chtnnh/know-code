/**
 * Spawned-CLI surface tests: happy/unhappy paths for commands whose logic
 * lives behind process.exit (hash --explain, pass/ask preflight, status
 * staleness detail, range continue, doctor local-cli, version).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeConfig } from "./config.js";
import { readRangeSession, writeRangeSeal } from "./range.js";
import {
  commitAll,
  git,
  liteConfig,
  withTempRepo,
  writeFile,
} from "./test-helpers.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "index.js");

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Spawn the built CLI with isolated HOME/attest so user config can't leak. */
function kc(cwd: string, args: string[]): CliResult {
  const isoHome = mkdtempSync(join(tmpdir(), "kc-home-"));
  try {
    const { KNOW_CODE_OVERRIDE: _o, ...env } = process.env;
    const r = spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      env: {
        ...env,
        HOME: isoHome,
        USERPROFILE: isoHome,
        KNOW_CODE_ATTEST_HOME: join(isoHome, "attest"),
      },
    });
    return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
  } finally {
    rmSync(isoHome, { recursive: true, force: true });
  }
}

function setupRepo(root: string, cfg = liteConfig()) {
  writeFile(root, "base.txt", "base\n");
  commitAll(root, "base");
  mkdirSync(join(root, ".know-code"), { recursive: true });
  writeConfig(root, cfg);
}

describe("cli surface (spawned)", () => {
  it("version matches the release", () => {
    const { root, cleanup } = withTempRepo("kc-cli-ver-");
    try {
      setupRepo(root);
      const r = kc(root, ["version"]);
      assert.equal(r.status, 0);
      assert.match(r.stdout, /0\.3\.0/);
    } finally {
      cleanup();
    }
  });

  it("hash: bare prints 64-hex; --json is parseable; --explain lists files", () => {
    const { root, cleanup } = withTempRepo("kc-cli-hash-");
    try {
      setupRepo(root);
      writeFile(root, "staged.txt", "s\n");
      git(root, ["add", "staged.txt"]);
      writeFile(root, "base.txt", "edited unstaged\n");
      writeFile(root, "untracked.txt", "u\n");

      const bare = kc(root, ["hash"]);
      assert.equal(bare.status, 0);
      assert.match(bare.stdout.trim(), /^[0-9a-f]{64}$/);

      const json = kc(root, ["hash", "--json", "--explain"]);
      assert.equal(json.status, 0);
      const parsed = JSON.parse(json.stdout);
      assert.equal(parsed.diffHash, bare.stdout.trim());
      assert.deepEqual(parsed.stagedFiles, ["staged.txt"]);
      assert.deepEqual(parsed.unstagedTrackedFiles, ["base.txt"]);
      assert.ok(parsed.untrackedFiles.includes("untracked.txt"));

      const explain = kc(root, ["hash", "--explain"]);
      assert.equal(explain.status, 0);
      assert.match(explain.stdout, /\+ staged\.txt/);
      assert.match(explain.stdout, /! base\.txt/);
      assert.match(explain.stdout, /\? untracked\.txt/);
      assert.match(explain.stderr, /unstaged\/untracked files are not in the quiz hash/);
    } finally {
      cleanup();
    }
  });

  it("pass: refuses unstaged tracked edits and mismatched --hash", () => {
    const { root, cleanup } = withTempRepo("kc-cli-pass-");
    try {
      setupRepo(root);
      writeFile(root, "base.txt", "unstaged edit\n");
      const refused = kc(root, ["pass"]);
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /pass refused — unstaged tracked edits/);
      assert.match(refused.stderr, /! base\.txt/);

      git(root, ["add", "base.txt"]);
      const mismatch = kc(root, ["pass", "--hash", "f".repeat(64)]);
      assert.notEqual(mismatch.status, 0);
      assert.match(mismatch.stderr, /provided hash does not match current diff/);
    } finally {
      cleanup();
    }
  });

  it("ask: refuses unstaged edits, then missing quiz.json", () => {
    const { root, cleanup } = withTempRepo("kc-cli-ask-");
    try {
      setupRepo(root);
      writeFile(root, "base.txt", "unstaged edit\n");
      const refused = kc(root, ["ask", "--no-open"]);
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /ask refused — unstaged tracked edits/);

      git(root, ["add", "base.txt"]);
      const noQuiz = kc(root, ["ask", "--no-open"]);
      assert.notEqual(noQuiz.status, 0);
      assert.match(noQuiz.stderr, /Quiz file not found/);
    } finally {
      cleanup();
    }
  });

  it("status --json: stale artifacts carry hash-vs-hash detail with cause", () => {
    const { root, cleanup } = withTempRepo("kc-cli-status-");
    try {
      setupRepo(root);
      const oldHash = "1".repeat(64);
      writeFileSync(
        join(root, ".know-code", "taught.json"),
        JSON.stringify({
          version: 1,
          diffHash: oldHash,
          mode: "taught",
          sealedAt: new Date().toISOString(),
        }),
      );
      writeFile(root, "staged.txt", "s\n");
      git(root, ["add", "staged.txt"]);

      const clean = kc(root, ["status", "--json"]);
      assert.equal(clean.status, 0);
      const p1 = JSON.parse(clean.stdout);
      assert.match(p1.taughtDetail, /^stale 111111111111… vs [0-9a-f]{12}…/);
      assert.match(p1.taughtDetail, /staging\/range changed since artifact/);
      assert.equal(p1.unstagedTrackedEdits, false);

      // With unstaged edits the cause flips to actionable git add advice.
      writeFile(root, "base.txt", "unstaged\n");
      const dirty = kc(root, ["status", "--json"]);
      const p2 = JSON.parse(dirty.stdout);
      assert.match(p2.taughtDetail, /unstaged edits present — git add or stash/);
      assert.equal(p2.unstagedTrackedEdits, true);
    } finally {
      cleanup();
    }
  });

  it("range continue --yes starts the next session at current HEAD", () => {
    const { root, cleanup } = withTempRepo("kc-cli-rangecont-");
    try {
      setupRepo(root, liteConfig({ rangeMode: "range" }));
      const head = git(root, ["rev-parse", "HEAD"]);
      writeRangeSeal(root, {
        version: 1,
        diffHash: "e".repeat(64),
        rangeFromOid: head,
        commitCount: 1,
        sealMode: "receipt",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: head,
      });
      const r = kc(root, ["range", "continue", "--yes"]);
      assert.equal(r.status, 0);
      const session = readRangeSession(root);
      assert.ok(session, "expected a new range session");
      assert.equal(session!.fromOid, head);
    } finally {
      cleanup();
    }
  });

  it("doctor --json flags a stale non-local CLI when repo has its own dist", () => {
    const { root, cleanup } = withTempRepo("kc-cli-doctor-");
    try {
      setupRepo(root);
      // Repo claims to have a local monorepo build the spawned CLI is not.
      mkdirSync(join(root, "packages", "cli", "dist"), { recursive: true });
      writeFileSync(join(root, "packages", "cli", "dist", "index.js"), "");
      const r = kc(root, ["doctor", "--json"]);
      const parsed = JSON.parse(r.stdout);
      const local = parsed.checks.find(
        (c: { name: string }) => c.name === "local-cli",
      );
      assert.ok(local, "expected local-cli check");
      assert.equal(local.ok, false);
      assert.match(local.message, /stale global/);
    } finally {
      cleanup();
    }
  });
});
