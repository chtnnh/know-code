import { currentHead, git, isAncestor } from "./git.js";
import { computeTreePairHash, EMPTY_TREE } from "./hash.js";
import { trailerHashFromMessage } from "./trailers.js";

/** GitHub `github.event.before` for a newly created branch. */
export const ZERO_OID_RE = /^0+$/;

export function isZeroOid(oid: string): boolean {
  return ZERO_OID_RE.test(oid.trim());
}

export interface WalkSegment {
  /** First parent of the first commit in the run (range start). */
  fromOid: string;
  /** Last commit in the run (range tip, including attached merges). */
  toOid: string;
  trailerHash: string;
  oids: string[];
}

export type PartitionResult =
  | { ok: true; segments: WalkSegment[] }
  | { ok: false; error: string };

function firstParentOid(repoRoot: string, oid: string): string {
  const line = git(["rev-list", "--parents", "-n", "1", oid], repoRoot, {
    allowFail: true,
  });
  const parts = line.split(/\s+/).filter(Boolean);
  return parts[1] ?? EMPTY_TREE;
}

function parentCount(repoRoot: string, oid: string): number {
  const line = git(["rev-list", "--parents", "-n", "1", oid], repoRoot, {
    allowFail: true,
  });
  const parts = line.split(/\s+/).filter(Boolean);
  return Math.max(0, parts.length - 1);
}

/**
 * Split `fromOid..toOid` into runs that share a `Know-Code-Verified` hash.
 * Merge commits without a trailer attach to the current run; linear commits
 * without a trailer fail closed.
 */
export function partitionPushWalk(
  repoRoot: string,
  fromOid: string,
  toOid: string,
): PartitionResult {
  const commits = git(
    ["rev-list", "--reverse", "--topo-order", `${fromOid}..${toOid}`],
    repoRoot,
    { allowFail: true },
  )
    .split("\n")
    .filter(Boolean);

  const segments: WalkSegment[] = [];
  let current: WalkSegment | null = null;

  const flush = () => {
    if (current) {
      segments.push(current);
      current = null;
    }
  };

  for (const oid of commits) {
    const msg = git(["log", "-1", "--format=%B", oid], repoRoot, {
      allowFail: true,
    });
    const hash = trailerHashFromMessage(msg);
    const merge = parentCount(repoRoot, oid) > 1;

    if (hash) {
      if (current && current.trailerHash === hash) {
        current.oids.push(oid);
        current.toOid = oid;
      } else {
        flush();
        current = {
          fromOid: firstParentOid(repoRoot, oid),
          toOid: oid,
          trailerHash: hash,
          oids: [oid],
        };
      }
      continue;
    }

    if (merge) {
      if (!current) {
        return {
          ok: false,
          error: `know-code: merge ${oid.slice(0, 12)} has no Know-Code-Verified trailer and is not attached to a verified run`,
        };
      }
      current.oids.push(oid);
      current.toOid = oid;
      continue;
    }

    return {
      ok: false,
      error: `know-code: commit ${oid.slice(0, 12)} has no Know-Code-Verified trailer`,
    };
  }

  flush();
  return { ok: true, segments };
}

function nonMergeOids(repoRoot: string, oids: string[]): string[] {
  return oids.filter((oid) => parentCount(repoRoot, oid) <= 1);
}

/** Grounded hashes a run's trailer may match. */
export function groundedHashesForSegment(
  repoRoot: string,
  segment: WalkSegment,
): { rangeHash: string; indexHash?: string; hashes: string[] } {
  const rangeHash = computeTreePairHash(
    repoRoot,
    segment.fromOid,
    segment.toOid,
  );
  const seen = new Set<string>([rangeHash]);
  let indexHash: string | undefined;
  // One logical landing: a single non-merge, optionally plus trailerless
  // merges glued on (GitHub "Create a merge commit" of a 1-commit PR).
  if (nonMergeOids(repoRoot, segment.oids).length === 1) {
    indexHash = computeTreePairHash(repoRoot, EMPTY_TREE, segment.toOid);
    seen.add(indexHash);
  }
  // Same range session, later push: trailer is still range-begin → tip,
  // but --from is the previous landing. Walk first-parent to the root.
  const visited = new Set<string>([segment.fromOid]);
  let a = segment.fromOid;
  for (;;) {
    const parent = firstParentOid(repoRoot, a);
    if (!parent || parent === EMPTY_TREE || visited.has(parent)) break;
    visited.add(parent);
    seen.add(computeTreePairHash(repoRoot, parent, segment.toOid));
    a = parent;
  }
  return { rangeHash, indexHash, hashes: [...seen] };
}

export function segmentTrailerMatches(
  repoRoot: string,
  segment: WalkSegment,
): boolean {
  const { hashes } = groundedHashesForSegment(repoRoot, segment);
  return hashes.includes(segment.trailerHash);
}

export function resolveFromCommit(
  repoRoot: string,
  from: string,
): { ok: true; oid: string } | { ok: false; error: string } {
  const trimmed = from.trim();
  if (!trimmed) {
    return { ok: false, error: "know-code: --from requires a commit SHA" };
  }
  if (isZeroOid(trimmed)) {
    return { ok: true, oid: "0".repeat(Math.max(trimmed.length, 40)) };
  }
  const oid = git(["rev-parse", "--verify", `${trimmed}^{commit}`], repoRoot, {
    allowFail: true,
  });
  if (!oid) {
    return {
      ok: false,
      error: `know-code: --from ${trimmed.slice(0, 12)} is not a commit in this repository`,
    };
  }
  return { ok: true, oid };
}

export function assertFromAncestorOfHead(
  repoRoot: string,
  fromOid: string,
): { ok: true; head: string } | { ok: false; error: string } {
  const head = currentHead(repoRoot);
  if (!head || head === EMPTY_TREE) {
    return { ok: false, error: "know-code: --from requires a commit at HEAD" };
  }
  if (!isAncestor(repoRoot, fromOid, head)) {
    return {
      ok: false,
      error:
        "know-code: --from is not an ancestor of HEAD (refusing rewritten history)",
    };
  }
  return { ok: true, head };
}
