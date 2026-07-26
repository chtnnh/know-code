import { readConfig } from "../config.js";
import { git, mergeBase } from "../git.js";
import { computeDiffContext } from "../hash.js";
import { findGitRoot } from "../paths.js";

function trailersInRange(repoRoot: string, from: string, to: string): string[] {
  const commits = git(["rev-list", "--reverse", `${from}..${to}`], repoRoot, {
    allowFail: true,
  })
    .split("\n")
    .filter(Boolean);

  const found: string[] = [];
  for (const commit of commits) {
    const msg = git(["log", "-1", "--format=%B", commit], repoRoot);
    for (const line of msg.split("\n")) {
      const m = line.match(/^Know-Code-Verified:\s*([0-9a-f]{64})\s*$/i);
      if (m) found.push(m[1].toLowerCase());
    }
  }
  return found;
}

function headHasTrailer(repoRoot: string, headRef: string, hash: string): boolean {
  const headMsg = git(["log", "-1", "--format=%B", headRef], repoRoot, {
    allowFail: true,
  });
  return new RegExp(`^Know-Code-Verified:\\s*${hash}\\s*$`, "im").test(headMsg);
}

export function cmdVerify(opts: { requireAll?: boolean }): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = computeDiffContext(repoRoot, config);

  console.log(`know-code verify`);
  console.log(`  expected: ${ctx.diffHash}`);
  console.log(`  range:    ${ctx.commitRange}`);

  // Primary: HEAD commit trailer must match current tree hash.
  if (headHasTrailer(repoRoot, ctx.headRef, ctx.diffHash)) {
    console.log("know-code: HEAD trailer verified");
    process.exit(0);
  }

  // Secondary: scan only merge-base..HEAD when HEAD is ahead of base.
  // Never scan empty-tree..HEAD (full history) when already on the base tip.
  const mb = mergeBase(repoRoot, ctx.baseRef, ctx.headRef);
  const ahead = git(["rev-list", "--count", `${mb}..${ctx.headRef}`], repoRoot, {
    allowFail: true,
  });
  const aheadCount = Number.parseInt(ahead || "0", 10) || 0;

  let trailers: string[] = [];
  if (aheadCount > 0 && mb !== ctx.headRef) {
    trailers = trailersInRange(repoRoot, mb, ctx.headRef);
    console.log(`  trailers in ${mb.slice(0, 12)}..HEAD: ${trailers.length}`);
    if (trailers.includes(ctx.diffHash)) {
      console.log("know-code: verified (range)");
      process.exit(0);
    }
  } else {
    console.log("  trailers: skipped full-history scan (on base tip)");
  }

  if (opts.requireAll) {
    console.error("know-code: require-all: missing matching trailers");
  }

  console.error("know-code: no matching Know-Code-Verified trailer");
  console.error(`know-code: add trailer: Know-Code-Verified: ${ctx.diffHash}`);
  console.error('know-code: tip: know-code commit -m "…" adds the trailer');
  process.exit(1);
}
