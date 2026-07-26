#!/usr/bin/env node
/**
 * Symlink skills/ into harness skill dirs for local dogfooding.
 * Only .agents/skills is committed; Cursor/Claude links are local.
 */
import { existsSync, mkdirSync, symlinkSync, lstatSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skills = ["know-code", "know-code-teach"];
const targets = [
  join(root, ".agents", "skills"),
  join(root, ".cursor", "skills"),
  join(root, ".claude", "skills"),
];

for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  for (const name of skills) {
    const link = join(dir, name);
    const source = join(root, "skills", name);
    if (!existsSync(source)) continue;
    try {
      if (existsSync(link) || lstatSync(link).isSymbolicLink()) {
        unlinkSync(link);
      }
    } catch {
      // missing link
    }
    const rel = relative(dir, source);
    symlinkSync(rel, link);
  }
}
console.log("link-skills: linked know-code + know-code-teach for agents/cursor/claude");
