import { readConfig } from "../config.js";
import { resolveQuizContext } from "../hash.js";
import {
  stagedFileNames,
  unstagedTrackedFileNames,
  untrackedFileNames,
} from "../git.js";
import { findGitRoot } from "../paths.js";

export function cmdHash(opts: { json?: boolean; explain?: boolean } = {}): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const staged = stagedFileNames(repoRoot);
  const unstaged = unstagedTrackedFileNames(repoRoot);
  const untracked = untrackedFileNames(repoRoot);

  if (opts.json) {
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
          ...(opts.explain
            ? {
                stagedFiles: staged,
                unstagedTrackedFiles: unstaged,
                untrackedFiles: untracked,
              }
            : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!opts.explain) {
    console.log(ctx.diffHash);
    return;
  }

  console.log(`diffHash:     ${ctx.diffHash}`);
  console.log(`scope:        ${ctx.scope}`);
  console.log(`level:        ${config.level}`);
  console.log(`baseRef:      ${ctx.baseRef}`);
  console.log(`headRef:      ${ctx.headRef}`);
  console.log(`commitRange:  ${ctx.commitRange}`);
  if (ctx.rangeFromOid) {
    console.log(`rangeFromOid: ${ctx.rangeFromOid}`);
  }
  console.log(`commitCount:  ${ctx.commitCount}`);
  console.log(`staged (in hash): ${staged.length}`);
  for (const f of staged) console.log(`  + ${f}`);
  if (!staged.length) {
    console.log("  (none — hash covers committed range only)");
  }
  console.log(`unstaged tracked (excluded): ${unstaged.length}`);
  for (const f of unstaged) console.log(`  ! ${f}`);
  console.log(`untracked (excluded): ${untracked.length}`);
  for (const f of untracked) console.log(`  ? ${f}`);
  if (unstaged.length || untracked.length) {
    console.error(
      "know-code: warning — unstaged/untracked files are not in the quiz hash. git add (or stash) before taught/ask/pass.",
    );
  }
}
