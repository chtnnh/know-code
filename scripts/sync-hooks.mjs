#!/usr/bin/env node
/** Copy root hooks/ (+ LICENSE) into packages/cli for npm publish. */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "hooks");
const dest = join(root, "packages", "cli", "hooks");
const licenseSrc = join(root, "LICENSE");
const licenseDest = join(root, "packages", "cli", "LICENSE");

if (!existsSync(src)) {
  console.error("sync-hooks: missing hooks/ at repo root");
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const name of readdirSync(src)) {
  copyFileSync(join(src, name), join(dest, name));
}
copyFileSync(licenseSrc, licenseDest);
console.log(`sync-hooks: copied ${readdirSync(dest).length} files → packages/cli/hooks`);
