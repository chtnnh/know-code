import { readConfig } from "../config.js";
import { computeDiffContext } from "../hash.js";
import { findGitRoot } from "../paths.js";

export function cmdHash(json = false): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = computeDiffContext(repoRoot, config);

  if (json) {
    console.log(
      JSON.stringify(
        {
          diffHash: ctx.diffHash,
          baseRef: ctx.baseRef,
          headRef: ctx.headRef,
          commitRange: ctx.commitRange,
          level: config.level,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(ctx.diffHash);
}
