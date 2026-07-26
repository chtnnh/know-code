import { createHash } from "node:crypto";
import {
  currentHead,
  fullDiff,
  logOneline,
  mergeBase,
  resolveBaseRef,
} from "./git.js";
import type { Config, DiffContext } from "./types.js";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeDiffContext(
  repoRoot: string,
  config: Config,
): DiffContext {
  const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  let headRef = currentHead(repoRoot);
  const hasHead = headRef !== EMPTY_TREE;

  // Include uncommitted work so the quiz tracks what would actually ship next
  // once committed; for pure commit-range gating we still key off merge-base…HEAD.
  let from = hasHead ? mergeBase(repoRoot, baseRef, headRef) : EMPTY_TREE;
  if (!hasHead) {
    headRef = EMPTY_TREE;
  }

  const diff = hasHead
    ? fullDiff(repoRoot, from, headRef)
    : ""; // no commits yet
  const log = hasHead ? logOneline(repoRoot, from, headRef) : "";
  const commitRange = `${from}..${hasHead ? currentHead(repoRoot) : "HEAD"}`;
  const realHead = hasHead ? currentHead(repoRoot) : "HEAD";
  const material = [
    `base:${baseRef}`,
    `from:${from}`,
    `head:${realHead === "HEAD" ? EMPTY_TREE : realHead}`,
    `log:${log}`,
    `diff:${diff}`,
  ].join("\n");

  return {
    baseRef,
    headRef: realHead === "HEAD" ? EMPTY_TREE : realHead,
    commitRange,
    diff,
    diffHash: sha256(material),
  };
}
