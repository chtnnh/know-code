import { readConfig } from "../config.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot } from "../paths.js";

export function cmdHash(json = false): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);

  if (json) {
    console.log(
      JSON.stringify(
        {
          diffHash: ctx.diffHash,
          scope: ctx.scope,
          rangeFromOid: ctx.rangeFromOid,
          commitCount: ctx.commitCount,
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
