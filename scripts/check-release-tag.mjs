#!/usr/bin/env node
/** Refuse publication when the release tag and CLI package version diverge. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.env.GITHUB_REF_NAME;
const { version } = JSON.parse(readFileSync(join(root, "packages/cli/package.json"), "utf8"));
const expectedTag = `v${version}`;

if (tag !== expectedTag) {
  console.error(`Release tag ${tag ?? "(missing)"} does not match package version ${version}; expected ${expectedTag}.`);
  process.exit(1);
}

console.log(`Release tag ${tag} matches CLI package version ${version}.`);
