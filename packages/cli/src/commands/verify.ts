import { readConfig } from "../config.js";
import { git, mergeBase } from "../git.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot } from "../paths.js";
import { readRangeSeal } from "../range.js";
import {
  inferUniformRangeTrailerHash,
  rangeHasTipTrailers,
} from "../trailers.js";
import { assertSigned } from "../seal.js";
import {
  collectVerifyHashCandidates,
  matchHeadTrailer,
  primaryVerifyCandidate,
  type VerifyHashCandidate,
} from "../verify-helpers.js";
import {
  assertFromAncestorOfHead,
  groundedHashesForSegment,
  isZeroOid,
  partitionPushWalk,
  resolveFromCommit,
  segmentTrailerMatches,
} from "../verify-walk.js";
import type { QuizContext } from "../types.js";

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

export interface VerifyResult {
  ok: boolean;
  exitCode: number;
  messages: string[];
  errors: string[];
  warnings?: string[];
  primary?: VerifyHashCandidate;
  matched?: VerifyHashCandidate | { label: string };
  ctx?: QuizContext;
}

export function runVerify(
  repoRoot: string,
  opts: {
    requireAll?: boolean;
    requireRangeTrailers?: boolean;
    rangeSeal?: boolean;
    from?: string;
  } = {},
): VerifyResult {
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const candidates = collectVerifyHashCandidates(repoRoot, config);
  const primary = primaryVerifyCandidate(candidates);
  const messages: string[] = [];
  const errors: string[] = [];

  if (opts.from !== undefined) {
    return runVerifyWalk(repoRoot, opts.from, { messages, errors, primary, ctx });
  }

  if (opts.rangeSeal) {
    const seal = readRangeSeal(repoRoot);
    if (!seal) {
      errors.push("know-code: no range-seal.json");
      return { ok: false, exitCode: 1, messages, errors, primary, ctx };
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
      messages.push(
        `know-code: range seal valid (${seal.sealMode}, hash ${seal.diffHash.slice(0, 12)}…)`,
      );
      return { ok: true, exitCode: 0, messages, errors, primary, ctx };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return { ok: false, exitCode: 1, messages, errors, primary, ctx };
    }
  }

  messages.push(`know-code verify`);
  messages.push(`  expected: ${primary.hash} (${primary.label})`);
  messages.push(`  scope:    ${ctx.scope}`);
  messages.push(`  range:    ${ctx.commitRange}`);

  const mb = mergeBase(repoRoot, ctx.baseRef, ctx.headRef);
  const fromOid = ctx.rangeFromOid || mb;

  if (opts.requireRangeTrailers) {
    const seal = readRangeSeal(repoRoot);
    const trailerFrom =
      seal?.rangeFromOid ?? (ctx.scope === "range" ? fromOid : mb);
    const inferred =
      trailerFrom && !seal?.diffHash
        ? inferUniformRangeTrailerHash(repoRoot, trailerFrom)
        : null;
    const trailerHash = seal?.diffHash ?? inferred ?? ctx.diffHash;
    const grounded = candidates.some((c) => c.hash === trailerHash);
    if (!grounded) {
      errors.push(
        "know-code: --require-range-trailers: trailer hash is not a grounded verify candidate",
      );
      errors.push(
        `know-code: trailer ${trailerHash.slice(0, 12)}… does not match index / merge-base..HEAD / range-seal`,
      );
      return { ok: false, exitCode: 1, messages, errors, primary, ctx };
    }
    if (
      trailerFrom &&
      rangeHasTipTrailers(repoRoot, trailerFrom, trailerHash)
    ) {
      messages.push(
        `know-code: all commits in range have Know-Code-Verified: ${trailerHash.slice(0, 12)}…`,
      );
      if (inferred && !seal?.diffHash) {
        messages.push(
          "know-code: verified from commit trailers (no local range-seal.json)",
        );
      }
      return {
        ok: true,
        exitCode: 0,
        messages,
        errors,
        primary,
        matched: { label: "range-trailers" },
        ctx,
      };
    }
    errors.push(
      "know-code: --require-range-trailers: not every commit has Know-Code-Verified",
    );
    errors.push("know-code: run: know-code range seal --rewrite");
    return { ok: false, exitCode: 1, messages, errors, primary, ctx };
  }

  const headMatch = matchHeadTrailer(repoRoot, ctx.headRef, candidates);
  if (headMatch) {
    messages.push(`know-code: HEAD trailer verified (${headMatch.label})`);
    return {
      ok: true,
      exitCode: 0,
      messages,
      errors,
      primary,
      matched: headMatch,
      ctx,
    };
  }

  const ahead = git(["rev-list", "--count", `${mb}..${ctx.headRef}`], repoRoot, {
    allowFail: true,
  });
  const aheadCount = Number.parseInt(ahead || "0", 10) || 0;

  if (aheadCount > 0 && mb !== ctx.headRef) {
    const trailers = trailersInRange(repoRoot, mb, ctx.headRef);
    messages.push(`  trailers in ${mb.slice(0, 12)}..HEAD: ${trailers.length}`);
    for (const c of candidates) {
      if (trailers.includes(c.hash)) {
        messages.push(`know-code: verified (range, ${c.label})`);
        return {
          ok: true,
          exitCode: 0,
          messages,
          errors,
          primary,
          matched: c,
          ctx,
        };
      }
    }
  } else {
    messages.push("  trailers: skipped full-history scan (on base tip)");
  }

  if (opts.requireAll) {
    errors.push("know-code: require-all: missing matching trailers");
  }

  if (!config.requireTrailer) {
    errors.push(
      "know-code: requireTrailer is false — verify is optional locally",
    );
  }

  errors.push("know-code: no matching Know-Code-Verified trailer");
  errors.push(`know-code: add trailer: Know-Code-Verified: ${primary.hash}`);
  errors.push('know-code: tip: know-code commit -m "…" adds the trailer');
  return { ok: false, exitCode: 1, messages, errors, primary, ctx };
}

function runVerifyWalk(
  repoRoot: string,
  fromArg: string,
  parts: {
    messages: string[];
    errors: string[];
    primary: VerifyHashCandidate;
    ctx: QuizContext;
  },
): VerifyResult {
  const { messages, errors, primary, ctx } = parts;
  messages.push(`know-code verify --from ${fromArg.slice(0, 12)}`);

  const resolved = resolveFromCommit(repoRoot, fromArg);
  if (!resolved.ok) {
    errors.push(resolved.error);
    return { ok: false, exitCode: 1, messages, errors, primary, ctx };
  }

  if (isZeroOid(resolved.oid)) {
    messages.push(
      "know-code: --from is the zero SHA (new branch); nothing to walk",
    );
    return { ok: true, exitCode: 0, messages, errors, primary, ctx };
  }

  const anc = assertFromAncestorOfHead(repoRoot, resolved.oid);
  if (!anc.ok) {
    errors.push(anc.error);
    return { ok: false, exitCode: 1, messages, errors, primary, ctx };
  }

  if (resolved.oid === anc.head) {
    const warnings = [
      "know-code: warning — --from is HEAD; nothing to walk",
    ];
    return { ok: true, exitCode: 0, messages, errors, warnings, primary, ctx };
  }

  const part = partitionPushWalk(repoRoot, resolved.oid, anc.head);
  if (!part.ok) {
    errors.push(part.error);
    return { ok: false, exitCode: 1, messages, errors, primary, ctx };
  }

  if (part.segments.length === 0) {
    errors.push(
      `know-code: no commits in ${resolved.oid.slice(0, 12)}..HEAD`,
    );
    return { ok: false, exitCode: 1, messages, errors, primary, ctx };
  }

  messages.push(
    `  walking ${resolved.oid.slice(0, 12)}..HEAD (${part.segments.length} run${part.segments.length === 1 ? "" : "s"})`,
  );

  for (const [i, seg] of part.segments.entries()) {
    if (!segmentTrailerMatches(repoRoot, seg)) {
      const { rangeHash, indexHash } = groundedHashesForSegment(repoRoot, seg);
      errors.push(
        `know-code: run ${i + 1} ${seg.fromOid.slice(0, 12)}..${seg.toOid.slice(0, 12)} trailer ${seg.trailerHash.slice(0, 12)}… does not match tree pair ${rangeHash.slice(0, 12)}…` +
          (indexHash ? ` (or index ${indexHash.slice(0, 12)}…)` : ""),
      );
      return { ok: false, exitCode: 1, messages, errors, primary, ctx };
    }
    const hashes = groundedHashesForSegment(repoRoot, seg);
    const kind =
      hashes.indexHash &&
      seg.trailerHash === hashes.indexHash &&
      seg.trailerHash !== hashes.rangeHash
        ? "index"
        : "tree-pair";
    messages.push(
      `know-code: run ${i + 1} verified (${kind}, ${seg.oids.length} commit${seg.oids.length === 1 ? "" : "s"})`,
    );
  }

  messages.push(
    `know-code: push walk verified (${part.segments.length} run${part.segments.length === 1 ? "" : "s"})`,
  );
  return {
    ok: true,
    exitCode: 0,
    messages,
    errors,
    primary,
    matched: { label: "push-walk" },
    ctx,
  };
}

export function cmdVerify(opts: {
  requireAll?: boolean;
  requireRangeTrailers?: boolean;
  rangeSeal?: boolean;
  from?: string;
}): void {
  const repoRoot = findGitRoot();
  const result = runVerify(repoRoot, opts);
  for (const m of result.messages) console.log(m);
  for (const w of result.warnings ?? []) console.error(w);
  for (const e of result.errors) console.error(e);
  process.exit(result.exitCode);
}
