#!/usr/bin/env node
/** Refuse to deploy versioned docs that differ from the release tag. */
import { spawnSync } from "node:child_process";

const [releaseRef, deploymentRef] = process.argv.slice(2);
// Versioned docs were introduced in 0.3.1. Older release tags have no
// versioned snapshot, so that first versioned release is their immutable base.
const legacyBaselines = {
  "0.2.0": "ac656578a0667fc483d11847c1e6c97bf6c1aee6",
  "0.3.0": "ac656578a0667fc483d11847c1e6c97bf6c1aee6",
};

if (!releaseRef || !deploymentRef) {
  console.error("Usage: check-release-docs-provenance.mjs <release-ref> <deployment-ref>");
  process.exit(1);
}

const releaseCommit = resolveCommit(releaseRef);
const deploymentCommit = resolveCommit(deploymentRef);
const manifestComparison = spawnSync(
  "git",
  ["diff", "--exit-code", releaseCommit, deploymentCommit, "--", "website/versions.json"],
  { stdio: "inherit" },
);
if (manifestComparison.status !== 0) {
  console.error(`Version manifest at ${deploymentRef} does not match release ${releaseRef}.`);
  process.exit(manifestComparison.status ?? 1);
}
const versions = JSON.parse(showFile(deploymentCommit, "website/versions.json"));

if (!Array.isArray(versions) || versions.some((version) => typeof version !== "string")) {
  console.error(`Invalid website/versions.json at ${deploymentRef}.`);
  process.exit(1);
}
const versionSet = new Set(versions);

for (const version of Object.keys(legacyBaselines)) {
  if (!versionSet.has(version)) {
    console.error(`Version manifest at ${deploymentRef} omits legacy version ${version}.`);
    process.exit(1);
  }
}

const trustedReleaseTags = new Set(releaseTags(releaseCommit));

for (const tag of trustedReleaseTags) {
  const version = tag.slice(1);
  const packageText = tryShowFile(tag, "packages/cli/package.json");
  if (!packageText) continue;
  const packageVersion = JSON.parse(packageText).version;
  if (packageVersion !== version) continue;
  const taggedVersionsText = tryShowFile(tag, "website/versions.json");
  if (!taggedVersionsText) continue;
  const taggedVersions = JSON.parse(taggedVersionsText);
  if (!Array.isArray(taggedVersions) || taggedVersions[0] !== version) continue;
  if (!versionSet.has(version)) {
    console.error(`Version manifest at ${deploymentRef} omits ${version} released by ${tag}.`);
    process.exit(1);
  }
  if (!hasSuffix(versions, taggedVersions)) {
    console.error(`Version history at ${deploymentRef} does not preserve ${tag}.`);
    process.exit(1);
  }
}

for (const version of versions) {
  const versionTag = `v${version}`;
  const baselineRef = legacyBaselines[version] ?? versionTag;
  const baselineCommit = resolveCommit(baselineRef);
  if (!legacyBaselines[version]) {
    if (!trustedReleaseTags.has(versionTag)) {
      console.error(`${versionTag} is not an ancestor of release ${releaseRef}.`);
      process.exit(1);
    }
    const tagVersions = JSON.parse(showFile(baselineCommit, "website/versions.json"));
    if (tagVersions[0] !== version) {
      console.error(`${versionTag} does not declare ${version} as its latest docs version.`);
      process.exit(1);
    }
  }
  const comparison = spawnSync(
    "git",
    [
      "diff",
      "--exit-code",
      baselineCommit,
      deploymentCommit,
      "--",
      `website/versioned_docs/version-${version}`,
      `website/versioned_sidebars/version-${version}-sidebars.json`,
    ],
    { stdio: "inherit" },
  );
  if (comparison.status !== 0) {
    console.error(`Frozen docs for ${version} at ${deploymentRef} do not match ${baselineRef}.`);
    process.exit(1);
  }
}

function resolveCommit(ref) {
  const result = spawnSync("git", ["rev-parse", `${ref}^{commit}`], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function showFile(ref, path) {
  const result = spawnSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function tryShowFile(ref, path) {
  const result = spawnSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : undefined;
}

function releaseTags(commit) {
  const result = spawnSync("git", ["tag", "--merged", commit, "--list", "v*"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.split("\n").filter(Boolean);
}

function hasSuffix(whole, suffix) {
  return JSON.stringify(whole.slice(-suffix.length)) === JSON.stringify(suffix);
}
