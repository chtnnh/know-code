import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { readConfig } from "./config.js";
import { git, mergeBase, resolveBaseRef } from "./git.js";
import { isSignedGateOpen, readGate } from "./gate.js";
import { knowCodeDir, rangeSealPath } from "./paths.js";
import { assertSigned } from "./seal.js";
import { rangeHasTipTrailers } from "./trailers.js";
import type { RangeSealReceipt } from "./types.js";

export interface RangeSession {
  version: 1;
  /** Exclusive start — trailers apply to fromOid..HEAD (not including fromOid). */
  fromOid: string;
  fromRef: string;
  startedAt: string;
  /** Tip oid when begin was called (informational). */
  startHead: string;
}

export function rangePath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "range.json");
}

export function readRangeSession(repoRoot: string): RangeSession | null {
  const path = rangePath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as RangeSession;
    if (data.version !== 1 || !data.fromOid) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeRangeSession(
  repoRoot: string,
  session: RangeSession,
): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(rangePath(repoRoot), `${JSON.stringify(session, null, 2)}\n`);
}

export function clearRangeSession(repoRoot: string): void {
  const path = rangePath(repoRoot);
  if (existsSync(path)) unlinkSync(path);
}

export function isRangeActive(repoRoot: string): boolean {
  return readRangeSession(repoRoot) !== null;
}

export function beginRangeSession(
  repoRoot: string,
  fromRef?: string,
): RangeSession {
  if (readRangeSession(repoRoot)) {
    throw new Error(
      "know-code: range already active. Finish with `know-code range seal` or `know-code range abort`.",
    );
  }
  const config = readConfig(repoRoot);
  const baseRef = fromRef || resolveBaseRef(repoRoot, config.baseBranch);
  const head = git(["rev-parse", "HEAD"], repoRoot);
  const fromOid = mergeBase(repoRoot, baseRef, head);
  const session: RangeSession = {
    version: 1,
    fromOid,
    fromRef: baseRef,
    startedAt: new Date().toISOString(),
    startHead: head,
  };
  writeRangeSession(repoRoot, session);
  return session;
}

/** Commits exclusive-from..HEAD (oldest first). */
export function rangeCommitOids(repoRoot: string, fromOid: string): string[] {
  return git(["rev-list", "--reverse", `${fromOid}..HEAD`], repoRoot, {
    allowFail: true,
  })
    .split("\n")
    .filter(Boolean);
}

export function readRangeSeal(repoRoot: string): RangeSealReceipt | null {
  const path = rangeSealPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as RangeSealReceipt;
    if (data.version !== 1 || !data.diffHash) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeRangeSeal(
  repoRoot: string,
  receipt: RangeSealReceipt,
): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(rangeSealPath(repoRoot), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function clearRangeSeal(repoRoot: string): void {
  const path = rangeSealPath(repoRoot);
  if (existsSync(path)) unlinkSync(path);
}

/** After range seal --rewrite, index hash differs but trailers + gate match the sealed range. */
export function isSealedRewriteRangeOpen(repoRoot: string): boolean {
  const seal = readRangeSeal(repoRoot);
  if (!seal || seal.sealMode !== "rewrite" || !seal.rangeFromOid) {
    return false;
  }
  const config = readConfig(repoRoot);
  const gate = readGate(repoRoot);
  if (!isSignedGateOpen(repoRoot, gate, seal.diffHash, config.level)) {
    return false;
  }
  if (config.requireAttest) {
    try {
      assertSigned(
        repoRoot,
        "range-seal.json",
        seal as unknown as Record<string, unknown> & {
          sig?: string;
          keyId?: string;
        },
      );
    } catch {
      return false;
    }
  }
  return rangeHasTipTrailers(repoRoot, seal.rangeFromOid, seal.diffHash);
}
