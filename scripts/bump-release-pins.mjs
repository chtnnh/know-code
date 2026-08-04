#!/usr/bin/env node
/**
 * Bump version pins after release. Usage: node scripts/bump-release-pins.mjs 0.2.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/bump-release-pins.mjs <version>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  {
    path: join(root, "packages/cli/src/commands/init.ts"),
    replace: [/chtnnh\/know-code\/action@v[\d.]+/g, `chtnnh/know-code/action@v${version}`],
  },
  {
    path: join(root, "action/action.yml"),
    replace: [/default: "\^[\d.]+"/g, `default: "^${version}"`],
  },
  {
    path: join(root, "packages/cli/package.json"),
    replace: [/"version": "[\d.]+"/, `"version": "${version}"`],
  },
  {
    path: join(root, "package.json"),
    replace: [/"version": "[\d.]+"/, `"version": "${version}"`],
  },
];

for (const f of files) {
  let content = readFileSync(f.path, "utf8");
  for (const [re, sub] of f.replace) {
    content = content.replace(re, sub);
  }
  writeFileSync(f.path, content);
  console.log(`Updated ${f.path}`);
}
