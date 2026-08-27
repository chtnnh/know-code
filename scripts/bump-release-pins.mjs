#!/usr/bin/env node
/**
 * Bump all current release pins. Usage: node scripts/bump-release-pins.mjs 0.3.1
 */
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  console.error("Usage: node scripts/bump-release-pins.mjs <stable-semver>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  {
    path: join(root, "packages/cli/src/commands/init.ts"),
    replace: [[/chtnnh\/know-code\/action@v[\d.]+/g, `chtnnh/know-code/action@v${version}`]],
  },
  {
    path: join(root, "action/action.yml"),
    replace: [[/default: "\^[\d.]+"/g, `default: "^${version}"`]],
  },
  {
    path: join(root, "action/README.md"),
    replace: [
      [/chtnnh\/know-code\/action@v[\d.]+/g, `chtnnh/know-code/action@v${version}`],
      [/`\^[\d.]+`/g, `\`^${version}\``],
      [/version: "\^[\d.]+"/g, `version: "^${version}"`],
    ],
  },
  {
    path: join(root, "website/docs/ci.md"),
    replace: [
      [/chtnnh\/know-code\/action@v[\d.]+/g, `chtnnh/know-code/action@v${version}`],
      [/`\^[\d.]+`/g, `\`^${version}\``],
    ],
  },
  {
    path: join(root, "packages/cli/package.json"),
    replace: [[/"version": "[\d.]+"/, `"version": "${version}"`]],
  },
  {
    path: join(root, "package.json"),
    replace: [[/"version": "[\d.]+"/, `"version": "${version}"`]],
  },
  {
    path: join(root, "package-lock.json"),
    replace: [
      [/("name": "know-code-monorepo",\n {2}"version": ")[\d.]+"/, `$1${version}"`],
      [/("": \{\n {6}"name": "know-code-monorepo",\n {6}"version": ")[\d.]+"/, `$1${version}"`],
      [/("packages\/cli": \{\n {6}"name": "@chtnnh\/know-code",\n {6}"version": ")[\d.]+"/, `$1${version}"`],
    ],
  },
];

const updates = files.map((f, index) => {
  let content = readFileSync(f.path, "utf8");
  for (const [re, sub] of f.replace) {
    if (!re.test(content)) {
      throw new Error(`Expected release pin was not found in ${f.path}: ${re}`);
    }
    re.lastIndex = 0;
    content = content.replace(re, sub);
  }
  return {
    path: f.path,
    content,
    backupPath: `${f.path}.know-code-bump-${process.pid}-${index}.bak`,
    tempPath: `${f.path}.know-code-bump-${process.pid}-${index}.tmp`,
  };
});
const failAfter = Number(process.env.KNOW_CODE_TEST_BUMP_FAIL_AFTER);

let rollbackFailed = false;
try {
  for (const f of updates) {
    writeFileSync(f.tempPath, f.content);
    copyFileSync(f.path, f.backupPath);
  }
  for (const [index, f] of updates.entries()) {
    if (index === failAfter) {
      throw new Error("Injected release-pin write failure");
    }
    renameSync(f.tempPath, f.path);
    console.log(`Updated ${f.path}`);
  }
} catch (error) {
  const rollbackFailures = [];
  for (const f of updates) {
    try {
      renameSync(f.backupPath, f.path);
    } catch (rollbackError) {
      // A backup is absent when staging failed before this file was copied.
      if (existsSync(f.backupPath)) {
        rollbackFailed = true;
        rollbackFailures.push({ path: f.backupPath, error: rollbackError });
      }
    }
  }
  if (rollbackFailures.length > 0) {
    throw new AggregateError(rollbackFailures, "Release pin rollback failed; backups retained");
  }
  throw error;
} finally {
  for (const f of updates) {
    rmSync(f.tempPath, { force: true });
    if (!rollbackFailed) rmSync(f.backupPath, { force: true });
  }
}
