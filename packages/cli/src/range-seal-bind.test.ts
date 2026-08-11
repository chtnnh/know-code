import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeConfig } from "./config.js";
import { writeGate } from "./gate.js";
import { initAttestKey, sealPayload } from "./seal.js";
import { readRangeSeal, writeRangeSeal } from "./range.js";
import {
  clearSupersededSealArtifacts,
  headMatchesRangeSeal,
  sealedHeadBinding,
} from "./range-seal-bind.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { RangeSealReceipt } from "./types.js";
import { git, withTempRepo, writeFile, commitAll } from "./test-helpers.js";

describe("sealed head binding trust", () => {
  it("ignores unsigned forged range-seal when requireAttest is true", async () => {
    const attestHome = mkdtempSync(join(tmpdir(), "kc-bind-home-"));
    const prevHome = process.env.KNOW_CODE_ATTEST_HOME;
    const prevPass = process.env.KNOW_CODE_ATTEST_PASSPHRASE;
    const { root, cleanup } = withTempRepo("kc-bind-forge-");
    try {
      process.env.KNOW_CODE_ATTEST_HOME = attestHome;
      process.env.KNOW_CODE_ATTEST_PASSPHRASE = "bind-pass";
      initAttestKey(root, "bind-pass");
      writeFile(root, "f.txt", "base\n");
      commitAll(root, "base");
      const sealedHead = git(root, ["rev-parse", "HEAD"]);
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, {
        ...DEFAULT_CONFIG,
        level: "lite",
        requireAttest: true,
      });
      const gateUnsigned = {
        version: 1 as const,
        diffHash: "a".repeat(64),
        level: "lite" as const,
        passedAt: new Date().toISOString(),
        commitRange: "x",
        baseRef: "y",
        headRef: sealedHead,
        gatedTreeOid: git(root, ["rev-parse", "HEAD^{tree}"]),
        sealedHeadOid: sealedHead,
      };
      const sealedGate = (await sealPayload(
        root,
        gateUnsigned as unknown as Record<string, unknown>,
        { passphrase: "bind-pass" },
      )) as typeof gateUnsigned & { keyId: string; sig: string };
      writeGate(root, sealedGate);

      git(root, ["commit", "--allow-empty", "-m", "after seal"]);
      const movedHead = git(root, ["rev-parse", "HEAD"]);
      writeRangeSeal(root, {
        version: 1,
        diffHash: "a".repeat(64),
        rangeFromOid: git(root, ["rev-parse", "HEAD~1"]),
        commitCount: 1,
        sealMode: "receipt",
        gateKeyId: "unsigned",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: movedHead,
      });

      assert.equal(sealedHeadBinding(root), sealedHead);
      assert.equal(headMatchesRangeSeal(root), false);
    } finally {
      if (prevHome === undefined) delete process.env.KNOW_CODE_ATTEST_HOME;
      else process.env.KNOW_CODE_ATTEST_HOME = prevHome;
      if (prevPass === undefined) delete process.env.KNOW_CODE_ATTEST_PASSPHRASE;
      else process.env.KNOW_CODE_ATTEST_PASSPHRASE = prevPass;
      rmSync(attestHome, { recursive: true, force: true });
      cleanup();
    }
  });

  it("fresh pass consumes stale seal artifacts; active tip binding is kept", async () => {
    const attestHome = mkdtempSync(join(tmpdir(), "kc-bind-home-"));
    const prevHome = process.env.KNOW_CODE_ATTEST_HOME;
    const prevPass = process.env.KNOW_CODE_ATTEST_PASSPHRASE;
    const { root, cleanup } = withTempRepo("kc-bind-consume-");
    try {
      process.env.KNOW_CODE_ATTEST_HOME = attestHome;
      process.env.KNOW_CODE_ATTEST_PASSPHRASE = "bind-pass";
      initAttestKey(root, "bind-pass");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, {
        ...DEFAULT_CONFIG,
        level: "lite",
        requireAttest: true,
      });

      // Sealed batch tip A: signed range-seal + signed standalone binding.
      writeFile(root, "f.txt", "base\n");
      commitAll(root, "sealed batch tip");
      const sealedTip = git(root, ["rev-parse", "HEAD"]);
      const sealUnsigned = {
        version: 1 as const,
        diffHash: "b".repeat(64),
        rangeFromOid: sealedTip,
        commitCount: 1,
        sealMode: "rewrite" as const,
        gateKeyId: "k",
        sealedAt: new Date().toISOString(),
        sealedHeadOid: sealedTip,
      };
      const sealSigned = (await sealPayload(
        root,
        sealUnsigned as unknown as Record<string, unknown>,
        { passphrase: "bind-pass" },
      )) as unknown as RangeSealReceipt;
      writeRangeSeal(root, sealSigned);
      const { writeFileSync } = await import("node:fs");
      const bindingSigned = await sealPayload(
        root,
        {
          version: 1,
          sealedHeadOid: sealedTip,
          boundAt: new Date().toISOString(),
        },
        { passphrase: "bind-pass" },
      );
      const bindingPath = join(root, ".know-code", "sealed-head-binding.json");
      const writeBinding = () =>
        writeFileSync(bindingPath, `${JSON.stringify(bindingSigned, null, 2)}\n`);
      writeBinding();

      // Unpushed sealed tip at HEAD is pending its force-push — kept.
      assert.deepEqual(clearSupersededSealArtifacts(root), []);
      assert.equal(readRangeSeal(root)?.sealedHeadOid, sealedTip);
      assert.equal(existsSync(bindingPath), true);

      // Sealed tip reaches origin/<base>: the authorized push happened, the
      // seal is consumed — cleared even though HEAD still sits at the tip
      // (the normal start of the next batch).
      const branch = git(root, ["symbolic-ref", "--short", "HEAD"]);
      writeConfig(root, {
        ...DEFAULT_CONFIG,
        level: "lite",
        requireAttest: true,
        baseBranch: branch,
      });
      const remote = mkdtempSync(join(tmpdir(), "kc-bind-remote-"));
      try {
        git(root, ["init", "--bare", remote]);
        git(root, ["remote", "add", "origin", remote]);
        git(root, ["push", "origin", branch]);

        let cleared = clearSupersededSealArtifacts(root);
        assert.deepEqual(cleared.sort(), [
          "range-seal.json",
          "sealed-head-binding.json",
        ]);
        assert.equal(readRangeSeal(root), null);
        assert.equal(existsSync(bindingPath), false);

        // The incident shape: HEAD moved past the sealed tip before the fresh
        // pass. Stale artifacts blocked shipping forever — cleared.
        writeRangeSeal(root, sealSigned);
        writeBinding();
        writeFile(root, "g.txt", "release\n");
        commitAll(root, "release commit after sealed range");
        assert.equal(headMatchesRangeSeal(root), false);

        cleared = clearSupersededSealArtifacts(root);
        assert.deepEqual(cleared.sort(), [
          "range-seal.json",
          "sealed-head-binding.json",
        ]);
        assert.equal(headMatchesRangeSeal(root), true);
      } finally {
        rmSync(remote, { recursive: true, force: true });
      }
    } finally {
      if (prevHome === undefined) delete process.env.KNOW_CODE_ATTEST_HOME;
      else process.env.KNOW_CODE_ATTEST_HOME = prevHome;
      if (prevPass === undefined) delete process.env.KNOW_CODE_ATTEST_PASSPHRASE;
      else process.env.KNOW_CODE_ATTEST_PASSPHRASE = prevPass;
      rmSync(attestHome, { recursive: true, force: true });
      cleanup();
    }
  });
});
