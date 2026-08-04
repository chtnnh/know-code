import { readConfig } from "../config.js";
import { git, mergeBase } from "../git.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot } from "../paths.js";
import { readRangeSeal } from "../range.js";
import { rangeHasTipTrailers } from "../trailers.js";
import { assertSigned } from "../seal.js";
import { headHasTrailer } from "../verify-helpers.js";

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

function headHasTrailerLocal(repoRoot: string, headRef: string, hash: string): boolean {
  return headHasTrailer(repoRoot, headRef, hash);
}

export function cmdVerify(opts: {
  requireAll?: boolean;
  requireRangeTrailers?: boolean;
  rangeSeal?: boolean;
}): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);

  if (opts.rangeSeal) {
    const seal = readRangeSeal(repoRoot);
    if (!seal) {
      console.error("know-code: no range-seal.json");
      process.exit(1);
    }
    try {
      assertSigned(
        repoRoot,
        "range-seal.json",
        seal as unknown as Record<string, unknown> & {
          sig?: string;
          keyId?: string;
        },
      );
      console.log(
        `know-code: range seal valid (${seal.sealMode}, hash ${seal.diffHash.slice(0, 12)}…)`,
      );
      process.exit(0);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  console.log(`know-code verify`);
  console.log(`  expected: ${ctx.diffHash}`);
  console.log(`  scope:    ${ctx.scope}`);
  console.log(`  range:    ${ctx.commitRange}`);

  const mb = mergeBase(repoRoot, ctx.baseRef, ctx.headRef);
  const fromOid = ctx.rangeFromOid || mb;

  if (opts.requireRangeTrailers) {
    const seal = readRangeSeal(repoRoot);
    const trailerFrom = seal?.rangeFromOid ?? (ctx.scope === "range" ? fromOid : mb);
    const trailerHash = seal?.diffHash ?? ctx.diffHash;
    if (
      trailerFrom &&
      rangeHasTipTrailers(repoRoot, trailerFrom, trailerHash)
    ) {
      console.log(
        `know-code: all commits in range have Know-Code-Verified: ${trailerHash.slice(0, 12)}…`,
      );
      process.exit(0);
    }
    console.error(
      "know-code: --require-range-trailers: not every commit has Know-Code-Verified",
    );
    console.error("know-code: run: know-code range seal --rewrite");
    process.exit(1);
  }

  if (headHasTrailerLocal(repoRoot, ctx.headRef, ctx.diffHash)) {
    console.log("know-code: HEAD trailer verified");
    process.exit(0);
  }

  const ahead = git(["rev-list", "--count", `${mb}..${ctx.headRef}`], repoRoot, {
    allowFail: true,
  });
  const aheadCount = Number.parseInt(ahead || "0", 10) || 0;

  if (aheadCount > 0 && mb !== ctx.headRef) {
    const trailers = trailersInRange(repoRoot, mb, ctx.headRef);
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

  if (!config.requireTrailer) {
    console.error("know-code: requireTrailer is false — verify is optional locally");
  }

  console.error("know-code: no matching Know-Code-Verified trailer");
  console.error(`know-code: add trailer: Know-Code-Verified: ${ctx.diffHash}`);
  console.error('know-code: tip: know-code commit -m "…" adds the trailer');
  process.exit(1);
}
