import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { findGitRoot, knowCodeDir } from "../paths.js";

const CLEAR_FILES = [
  "answers.json",
  "grade.json",
  "grade-proposal.json",
  "gate.json",
  "taught.json",
  "quiz.json",
  "range.json",
  "override-allow.json",
];

export function cmdReset(opts: { keepAttest?: boolean }): void {
  const repoRoot = findGitRoot();
  const dir = knowCodeDir(repoRoot);
  if (!existsSync(dir)) {
    console.log("know-code: nothing to reset (.know-code/ missing)");
    return;
  }

  let cleared = 0;
  for (const name of CLEAR_FILES) {
    const path = join(dir, name);
    if (existsSync(path)) {
      unlinkSync(path);
      cleared++;
    }
  }

  if (!opts.keepAttest) {
    // range-seal kept by default — user may want it for verify
  }

  console.log(`know-code: cleared ${cleared} artifact(s) in .know-code/`);
  console.log("know-code: attest keys live in ~/.know-code/attest/ (unchanged)");
}
