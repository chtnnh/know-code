import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeConfig } from "./config.js";
import { writeGate } from "./gate.js";
import { initAttestKey, sealPayload } from "./seal.js";
import { writeRangeSeal } from "./range.js";
import { headMatchesRangeSeal, sealedHeadBinding } from "./range-seal-bind.js";
import { DEFAULT_CONFIG } from "./types.js";
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
});
