/** Release pins and publish preflight must agree on the shipped CLI version. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function runTagCheck(tag?: string) {
  return spawnSync(process.execPath, ["scripts/check-release-tag.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GITHUB_REF_NAME: tag },
  });
}

function runDocsProvenanceCheck(
  releaseRef: string,
  deploymentRef: string,
  cwd: string,
  scriptPath = join(root, "scripts/check-release-docs-provenance.mjs"),
) {
  return spawnSync(
    process.execPath,
    [scriptPath, releaseRef, deploymentRef],
    { cwd, encoding: "utf8" },
  );
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

describe("release contract", () => {
  it("keeps current release pins aligned and rejects a mismatched release tag", () => {
    const rootPackage = JSON.parse(read("package.json")) as { version: string };
    const cliPackage = JSON.parse(read("packages/cli/package.json")) as {
      version: string;
    };
    const version = cliPackage.version;

    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.equal(rootPackage.version, version);
    const lockfile = JSON.parse(read("package-lock.json")) as {
      version: string;
      packages: Record<string, { version: string }>;
    };
    assert.equal(lockfile.version, version);
    assert.equal(lockfile.packages[""].version, version);
    assert.equal(lockfile.packages["packages/cli"].version, version);
    assert.ok(read("action/action.yml").includes(`default: "^${version}"`));
    assert.ok(read("packages/cli/src/commands/init.ts").includes(`action@v${version}`));
    assert.ok(read("action/README.md").includes(`action@v${version}`));
    assert.ok(read("action/README.md").includes(`version: "^${version}"`));
    assert.ok(read("website/docs/ci.md").includes(`action@v${version}`));
    assert.ok(read("website/docs/ci.md").includes(`^${version}`));
    assert.ok(read(`website/versioned_docs/version-${version}/ci.md`).includes(`action@v${version}`));
    assert.equal(JSON.parse(read("website/versions.json"))[0], version);
    assert.ok(read("CHANGELOG.md").includes(`## ${version}`));

    assert.equal(runTagCheck(`v${version}`).status, 0);
    const mismatch = runTagCheck("v0.0.0");
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /does not match package version/);

    const workflow = read(".github/workflows/release.yml");
    assert.match(workflow, /Verify release tag matches CLI package version/);
    assert.match(workflow, /node scripts\/check-release-tag\.mjs/);
    assert.match(workflow, /Verify main contains and declares this release/);
    assert.ok(workflow.indexOf("Verify main contains and declares this release") < workflow.indexOf("npm publish --provenance --access public"));
    assert.match(workflow, /Reverify main immediately before publication/);
    assert.ok(workflow.indexOf("Reverify main immediately before publication") < workflow.indexOf("npm publish --provenance --access public"));
    assert.match(workflow, /git merge-base --is-ancestor "\$\{GITHUB_SHA\}" origin\/main/);
    const frozenDocsGuard = `node scripts/check-release-docs-provenance.mjs "\${GITHUB_SHA}" origin/main`;
    assert.equal(workflow.split(frozenDocsGuard).length - 1, 2);
    assert.ok(workflow.indexOf("node scripts/check-release-tag.mjs") < workflow.indexOf("npm publish --provenance --access public"));
    assert.match(workflow, /npm view "@chtnnh\/know-code@\$\{PACKAGE_VERSION\}" gitHead/);
    assert.match(workflow, /EXPECTED_GIT_HEAD="\$\(git rev-parse "\$\{GITHUB_SHA\}\^\{commit\}"\)"/);
    assert.match(workflow, /PUBLISHED_GIT_HEAD.*EXPECTED_GIT_HEAD/);
    assert.match(workflow, /grep -q "E404" \/tmp\/know-code-version\.err/);
    assert.match(workflow, /npm publish --provenance --access public/);
    assert.match(workflow, /npm view "@chtnnh\/know-code@\$\{PACKAGE_VERSION\}" dist\.attestations --json/);
    assert.match(workflow, /value\.provenance\.predicateType !== "https:\/\/slsa\.dev\/provenance\/v1"/);
    assert.equal((workflow.match(/\|\| return 1/g) ?? []).length, 6);
    assert.match(workflow, /\(cd "\$\{VERIFY_DIR\}" && npm init --yes/);
    assert.match(workflow, /npm audit signatures --prefix "\$\{VERIFY_DIR\}" --json/);
    assert.match(workflow, /for attempt in \{1\.\.12\}; do/);
    assert.match(workflow, /gh api --include "repos\/\$\{GITHUB_REPOSITORY\}\/releases\/tags\/\$\{TAG\}"/);
    assert.match(workflow, /head -n 1 \/tmp\/know-code-release\.response \| grep -Eq '\^HTTP\/\[\^ \]\+ 404\( \|\$\)'/);
    assert.match(workflow, /gh release edit "\$TAG"/);
    assert.match(workflow, /gh release create "\$TAG" --verify-tag/);
    assert.equal(
      workflow.split(`git fetch origin "+refs/tags/\${GITHUB_REF_NAME}:refs/know-code/release-tag"`).length - 1,
      1,
    );
    assert.match(workflow, /git fetch origin "\+refs\/tags\/\$\{TAG\}:refs\/know-code\/release-tag"/);
    const docsWorkflow = read(".github/workflows/docs.yml");
    assert.doesNotMatch(docsWorkflow, /^concurrency:/m);
    assert.match(docsWorkflow, /npm view "@chtnnh\/know-code@\$\{VERSION\}" gitHead/);
    assert.match(docsWorkflow, /npm view "@chtnnh\/know-code@\$\{VERSION\}" dist\.attestations --json/);
    assert.match(docsWorkflow, /\(cd "\$\{VERIFY_DIR\}" && npm init --yes/);
    assert.match(docsWorkflow, /npm audit signatures --prefix "\$\{VERIFY_DIR\}" --json/);
    assert.match(docsWorkflow, /TAG_GIT_HEAD="\$\(git rev-parse "v\$\{VERSION\}\^\{commit\}"\)"/);
    assert.match(docsWorkflow, /PUBLISHED_GIT_HEAD.*TAG_GIT_HEAD/);
    assert.match(docsWorkflow, /deploy:[\s\S]*?concurrency:\n {6}group: pages\n {6}cancel-in-progress: false\n {6}queue: max/);
    assert.match(workflow, /deploy-docs:[\s\S]*?concurrency:\n {6}group: pages\n {6}cancel-in-progress: false\n {6}queue: max/);
    assert.doesNotMatch(workflow, /Upload frozen release docs artifact/);
    assert.match(workflow, /name: github-pages-\$\{\{ github\.run_attempt \}\}/);
    assert.match(workflow, /artifact_name: github-pages-\$\{\{ github\.run_attempt \}\}/);
    assert.ok(workflow.indexOf("Upload current docs artifact") < workflow.indexOf("Confirm main did not advance before deployment"));
    assert.ok(workflow.indexOf("Confirm main did not advance before deployment") < workflow.indexOf("Deploy frozen release docs"));
    assert.doesNotMatch(docsWorkflow, /paths:/);
    assert.match(docsWorkflow, /node scripts\/check-release-docs-provenance\.mjs "v\$\{VERSION\}" "\$\{GITHUB_SHA\}"/);
    assert.match(workflow, /node scripts\/check-release-docs-provenance\.mjs "\$\{GITHUB_REF_NAME\}" HEAD/);
    assert.match(workflow, /ref: main\n {10}fetch-depth: 0/);
  });

  it("rejects a later release that rewrites an older frozen docs snapshot", () => {
    const fixture = mkdtempSync(join(tmpdir(), "kc-release-docs-"));
    const scriptFixture = mkdtempSync(join(tmpdir(), "kc-release-provenance-"));
    try {
      git(fixture, "init", "-b", "main", "--template=");
      git(fixture, "config", "user.email", "release-test@example.com");
      git(fixture, "config", "user.name", "Release Test");
      writeFileSync(join(fixture, "legacy.md"), "legacy docs before versioning\n");
      git(fixture, "add", ".");
      git(fixture, "commit", "-m", "legacy release");
      git(fixture, "tag", "v0.3.0");
      mkdirSync(join(fixture, "packages/cli"), { recursive: true });
      mkdirSync(join(fixture, "website/versioned_docs/version-0.3.1"), {
        recursive: true,
      });
      mkdirSync(join(fixture, "website/versioned_docs/version-0.3.0"), {
        recursive: true,
      });
      mkdirSync(join(fixture, "website/versioned_docs/version-0.2.0"), {
        recursive: true,
      });
      mkdirSync(join(fixture, "website/versioned_sidebars"), { recursive: true });
      writeFileSync(join(fixture, "website/versioned_docs/version-0.3.0/old.md"), "old docs\n");
      writeFileSync(join(fixture, "website/versioned_docs/version-0.2.0/old.md"), "older docs\n");
      writeFileSync(join(fixture, "website/versioned_docs/version-0.3.1/new.md"), "new docs\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.3.0-sidebars.json"), "{}\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.2.0-sidebars.json"), "{}\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.3.1-sidebars.json"), "{}\n");
      writeFileSync(join(fixture, "website/versions.json"), '["0.3.1", "0.3.0", "0.2.0"]\n');
      writeFileSync(join(fixture, "packages/cli/package.json"), '{"version":"0.3.1"}\n');
      git(fixture, "add", ".");
      git(fixture, "commit", "-m", "first versioned release");
      git(fixture, "tag", "v0.3.1");
      const provenanceScript = join(scriptFixture, "check-release-docs-provenance.mjs");
      writeFileSync(
        provenanceScript,
        read("scripts/check-release-docs-provenance.mjs").replaceAll(
          "ac656578a0667fc483d11847c1e6c97bf6c1aee6",
          git(fixture, "rev-parse", "HEAD").trim(),
        ),
      );
      assert.equal(runDocsProvenanceCheck("v0.3.1", "HEAD", fixture, provenanceScript).status, 0);

      git(fixture, "checkout", "-b", "failed-release-tag");
      mkdirSync(join(fixture, "website/versioned_docs/version-0.9.0"), {
        recursive: true,
      });
      writeFileSync(join(fixture, "website/versioned_docs/version-0.9.0/new.md"), "failed docs\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.9.0-sidebars.json"), "{}\n");
      writeFileSync(join(fixture, "website/versions.json"), '["0.9.0", "0.3.1", "0.3.0", "0.2.0"]\n');
      writeFileSync(join(fixture, "packages/cli/package.json"), '{"version":"0.9.0"}\n');
      git(fixture, "add", ".");
      git(fixture, "commit", "-m", "failed release tag");
      git(fixture, "tag", "v0.9.0");
      git(fixture, "checkout", "main");
      const unrelatedTag = runDocsProvenanceCheck("v0.3.1", "HEAD", fixture, provenanceScript);
      assert.equal(unrelatedTag.status, 0, unrelatedTag.stderr);

      git(fixture, "checkout", "-b", "malicious-manifest");
      mkdirSync(join(fixture, "website/versioned_docs/version-0.9.0"), {
        recursive: true,
      });
      writeFileSync(join(fixture, "website/versioned_docs/version-0.9.0/new.md"), "failed docs\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.9.0-sidebars.json"), "{}\n");
      writeFileSync(join(fixture, "website/versions.json"), '["0.9.0", "0.3.1", "0.3.0", "0.2.0"]\n');
      writeFileSync(join(fixture, "packages/cli/package.json"), '{"version":"0.9.0"}\n');
      git(fixture, "add", ".");
      git(fixture, "commit", "-m", "attempt to include failed release docs");
      const maliciousManifest = runDocsProvenanceCheck("HEAD", "HEAD", fixture, provenanceScript);
      assert.notEqual(maliciousManifest.status, 0);
      assert.match(maliciousManifest.stderr, /v0\.9\.0 is not an ancestor of release HEAD/);
      git(fixture, "checkout", "main");

      mkdirSync(join(fixture, "website/versioned_docs/version-0.3.2"), {
        recursive: true,
      });
      writeFileSync(join(fixture, "website/versioned_docs/version-0.3.2/new.md"), "newer docs\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.3.2-sidebars.json"), "{}\n");
      rmSync(join(fixture, "website/versioned_docs/version-0.3.0"), { recursive: true });
      rmSync(join(fixture, "website/versioned_sidebars/version-0.3.0-sidebars.json"));
      writeFileSync(join(fixture, "website/versions.json"), '["0.3.2", "0.3.1", "0.2.0"]\n');
      writeFileSync(join(fixture, "packages/cli/package.json"), '{"version":"0.3.2"}\n');
      git(fixture, "add", ".");
      git(fixture, "commit", "-m", "later release dropping frozen docs");
      git(fixture, "tag", "v0.3.2");
      const deletion = runDocsProvenanceCheck("v0.3.2", "HEAD", fixture, provenanceScript);
      assert.notEqual(deletion.status, 0);
      assert.match(deletion.stderr, /omits legacy version 0\.3\.0/);

      git(fixture, "checkout", "-b", "rewrite-release", "v0.3.1");
      mkdirSync(join(fixture, "website/versioned_docs/version-0.3.0"), {
        recursive: true,
      });
      writeFileSync(join(fixture, "website/versioned_docs/version-0.3.0/old.md"), "changed old docs\n");
      mkdirSync(join(fixture, "website/versioned_docs/version-0.3.3"), {
        recursive: true,
      });
      writeFileSync(join(fixture, "website/versioned_docs/version-0.3.3/new.md"), "latest docs\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.3.3-sidebars.json"), "{}\n");
      writeFileSync(join(fixture, "website/versioned_sidebars/version-0.3.0-sidebars.json"), "{}\n");
      writeFileSync(join(fixture, "website/versions.json"), '["0.3.3", "0.3.1", "0.3.0", "0.2.0"]\n');
      writeFileSync(join(fixture, "packages/cli/package.json"), '{"version":"0.3.3"}\n');
      git(fixture, "add", ".");
      git(fixture, "commit", "-m", "later release with rewritten frozen docs");
      git(fixture, "tag", "v0.3.3");
      const mismatch = runDocsProvenanceCheck("v0.3.3", "HEAD", fixture, provenanceScript);
      assert.notEqual(mismatch.status, 0);
      assert.match(mismatch.stderr, /Frozen docs for 0\.3\.0 at HEAD do not match [0-9a-f]{40}/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(scriptFixture, { recursive: true, force: true });
    }
  });

  it("updates every current release pin in an isolated fixture", () => {
    const fixture = mkdtempSync(join(tmpdir(), "kc-release-pins-"));
    try {
      for (const relativePath of [
        "scripts",
        "packages/cli/src/commands",
        "action",
        "website/docs",
      ]) {
        mkdirSync(join(fixture, relativePath), { recursive: true });
      }
      copyFileSync(
        join(root, "scripts/bump-release-pins.mjs"),
        join(fixture, "scripts/bump-release-pins.mjs"),
      );
      const pins: Record<string, string> = {
        "packages/cli/src/commands/init.ts": "chtnnh/know-code/action@v0.3.0\n",
        "action/action.yml": 'default: "^0.3.0"\n',
        "action/README.md": "chtnnh/know-code/action@v0.3.0\n`^0.3.0`\nversion: \"^0.3.0\"\n",
        "website/docs/ci.md": "chtnnh/know-code/action@v0.3.0\n`^0.3.0`\n",
        "packages/cli/package.json": '{"version": "0.3.0"}\n',
        "package.json": '{"version": "0.3.0"}\n',
        "package-lock.json": [
          '{\n  "name": "know-code-monorepo",\n  "version": "0.3.0",',
          '"": {\n      "name": "know-code-monorepo",\n      "version": "0.3.0",',
          '"packages/cli": {\n      "name": "@chtnnh/know-code",\n      "version": "0.3.0",',
        ].join("\n"),
      };
      for (const [relativePath, content] of Object.entries(pins)) {
        writeFileSync(join(fixture, relativePath), content);
      }

      const result = spawnSync(process.execPath, ["scripts/bump-release-pins.mjs", "4.5.6"], {
        cwd: fixture,
        encoding: "utf8",
      });

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Updated .*package-lock\.json/);
      assert.equal(
        readFileSync(join(fixture, "packages/cli/src/commands/init.ts"), "utf8").trim(),
        "chtnnh/know-code/action@v4.5.6",
      );
      assert.equal(
        readFileSync(join(fixture, "action/action.yml"), "utf8").trim(),
        'default: "^4.5.6"',
      );
      assert.equal(
        readFileSync(join(fixture, "action/README.md"), "utf8"),
        'chtnnh/know-code/action@v4.5.6\n`^4.5.6`\nversion: "^4.5.6"\n',
      );
      assert.equal(
        readFileSync(join(fixture, "website/docs/ci.md"), "utf8"),
        "chtnnh/know-code/action@v4.5.6\n`^4.5.6`\n",
      );
      assert.equal(readFileSync(join(fixture, "packages/cli/package.json"), "utf8"), '{"version": "4.5.6"}\n');
      assert.equal(readFileSync(join(fixture, "package.json"), "utf8"), '{"version": "4.5.6"}\n');
      assert.doesNotMatch(readFileSync(join(fixture, "package-lock.json"), "utf8"), /0\.3\.0/);

      const second = spawnSync(process.execPath, ["scripts/bump-release-pins.mjs", "4.5.6"], {
        cwd: fixture,
        encoding: "utf8",
      });
      assert.equal(second.status, 0, second.stderr);

      const beforeInvalid = readFileSync(join(fixture, "package.json"), "utf8");
      const invalid = spawnSync(process.execPath, ["scripts/bump-release-pins.mjs", "4.5.6-beta.1"], {
        cwd: fixture,
        encoding: "utf8",
      });
      assert.notEqual(invalid.status, 0);
      assert.match(invalid.stderr, /stable-semver/);
      assert.equal(readFileSync(join(fixture, "package.json"), "utf8"), beforeInvalid);

      const lockfilePath = join(fixture, "package-lock.json");
      const validLockfile = readFileSync(lockfilePath, "utf8");
      writeFileSync(lockfilePath, "missing required lockfile pins\n");
      const beforeLateFailure = Object.fromEntries(
        Object.keys(pins)
          .filter((relativePath) => relativePath !== "package-lock.json")
          .map((relativePath) => [
            relativePath,
            readFileSync(join(fixture, relativePath), "utf8"),
          ]),
      );
      const lateFailure = spawnSync(process.execPath, ["scripts/bump-release-pins.mjs", "5.6.7"], {
        cwd: fixture,
        encoding: "utf8",
      });
      assert.notEqual(lateFailure.status, 0);
      for (const [relativePath, content] of Object.entries(beforeLateFailure)) {
        assert.equal(readFileSync(join(fixture, relativePath), "utf8"), content);
      }

      writeFileSync(
        lockfilePath,
        validLockfile.replaceAll("4.5.6", "5.6.6"),
      );
      const beforeWriteFailure = Object.fromEntries(
        Object.keys(pins).map((relativePath) => [
          relativePath,
          readFileSync(join(fixture, relativePath), "utf8"),
        ]),
      );
      const writeFailure = spawnSync(process.execPath, ["scripts/bump-release-pins.mjs", "5.6.7"], {
        cwd: fixture,
        encoding: "utf8",
        env: { ...process.env, KNOW_CODE_TEST_BUMP_FAIL_AFTER: "1" },
      });
      assert.notEqual(writeFailure.status, 0);
      for (const [relativePath, content] of Object.entries(beforeWriteFailure)) {
        assert.equal(readFileSync(join(fixture, relativePath), "utf8"), content);
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
