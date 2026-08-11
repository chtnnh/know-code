import { readConfig } from "./config.js";
import { commitDriftVerifyHash } from "./enforcement.js";
import { git, mergeBase, resolveBaseRef } from "./git.js";
import {
  computeDiffContext,
  computeRangeDiffContext,
} from "./hash.js";
import { readRangeSeal } from "./range.js";
import { headHasTrailer, inferUniformRangeTrailerHash } from "./trailers.js";
import type { Config } from "./types.js";

export { headHasTrailer } from "./trailers.js";

export interface VerifyHashCandidate {
  hash: string;
  label: string;
}

/** Merge-base for verify: prefer origin/base when behind HEAD (CI/PR), else local. */
export function resolveVerifyMergeBase(
  repoRoot: string,
  config: Config,
  headRef: string,
): string {
  const originRef = `origin/${config.baseBranch}`;
  const originOid = git(["rev-parse", "--verify", originRef], repoRoot, {
    allowFail: true,
  });
  if (originOid) {
    const mb = git(["merge-base", originRef, headRef], repoRoot, {
      allowFail: true,
    });
    if (mb) return mb;
  }

  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  const mb = mergeBase(repoRoot, baseRef, headRef);
  if (mb !== headRef) return mb;

  const root = git(["rev-list", "--max-parents=0", headRef], repoRoot, {
    allowFail: true,
  });
  return root || mb;
}

/**
 * Hash candidates CI/local verify accepts on HEAD.
 * Never adds arbitrary HEAD trailer text — only grounded computed hashes
 * (plus local commit-drift passHash when gate.json + tree are stable).
 */
export function collectVerifyHashCandidates(
  repoRoot: string,
  config?: Config,
): VerifyHashCandidate[] {
  const cfg = config ?? readConfig(repoRoot);
  const indexCtx = computeDiffContext(repoRoot, cfg);
  const headRef = indexCtx.headRef;
  const mb = resolveVerifyMergeBase(repoRoot, cfg, headRef);

  const candidates: VerifyHashCandidate[] = [];
  const seen = new Set<string>();
  const add = (hash: string, label: string) => {
    if (!seen.has(hash)) {
      seen.add(hash);
      candidates.push({ hash, label });
    }
  };

  add(indexCtx.diffHash, "index");

  const ahead = git(["rev-list", "--count", `${mb}..${headRef}`], repoRoot, {
    allowFail: true,
  });
  const aheadCount = Number.parseInt(ahead || "0", 10) || 0;

  if (aheadCount > 0 && mb !== headRef) {
    const rangeCtx = computeRangeDiffContext(repoRoot, cfg, mb);
    add(rangeCtx.diffHash, "merge-base..HEAD");
    // Uniform trailers only count when they match a computed hash (not arbitrary).
    const inferred = inferUniformRangeTrailerHash(repoRoot, mb);
    if (inferred && seen.has(inferred)) {
      add(inferred, "uniform-trailers");
    }
  }

  const seal = readRangeSeal(repoRoot);
  if (seal?.diffHash) {
    const headOid = git(["rev-parse", "HEAD"], repoRoot, { allowFail: true });
    const atSealedHead =
      Boolean(seal.sealedHeadOid) && headOid === seal.sealedHeadOid;
    if (atSealedHead) {
      add(seal.diffHash, "range-seal");
      if (seal.gatePassHash) add(seal.gatePassHash, "range-seal-pass");
    }
  }

  const driftHash = commitDriftVerifyHash(repoRoot, cfg);
  if (driftHash) add(driftHash, "commit-drift");

  return candidates;
}

export function primaryVerifyCandidate(
  candidates: VerifyHashCandidate[],
): VerifyHashCandidate {
  return (
    candidates.find((c) => c.label === "merge-base..HEAD") ?? candidates[0]
  );
}

export function matchHeadTrailer(
  repoRoot: string,
  headRef: string,
  candidates: VerifyHashCandidate[],
): VerifyHashCandidate | null {
  for (const c of candidates) {
    if (headHasTrailer(repoRoot, headRef, c.hash)) return c;
  }
  return null;
}

/** True when hash is among grounded verify candidates (excludes blind HEAD text). */
export function isGroundedVerifyHash(
  repoRoot: string,
  hash: string,
  config?: Config,
): boolean {
  return collectVerifyHashCandidates(repoRoot, config).some(
    (c) => c.hash === hash,
  );
}
