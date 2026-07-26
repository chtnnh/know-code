import { createHash } from "node:crypto";
import {
  currentHead,
  fullDiff,
  git,
  logOneline,
  mergeBase,
  resolveBaseRef,
} from "./git.js";
import type { Config, DiffContext } from "./types.js";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeDiffContext(
  repoRoot: string,
  config: Config,
): DiffContext {
  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  const headRef = currentHead(repoRoot);

  if (headRef === EMPTY_TREE) {
    const material = [
      `base:${baseRef}`,
      `from:${EMPTY_TREE}`,
      `head:${EMPTY_TREE}`,
      `log:`,
      `diff:`,
    ].join("\n");
    return {
      baseRef,
      headRef: EMPTY_TREE,
      commitRange: `${EMPTY_TREE}..HEAD`,
      diff: "",
      diffHash: sha256(material),
    };
  }

  let from = mergeBase(repoRoot, baseRef, headRef);
  let diff = fullDiff(repoRoot, from, headRef);
  let log = logOneline(repoRoot, from, headRef);

  // On the base branch itself (or first commit), triple-dot vs base is empty.
  // Fall back to empty-tree…HEAD so the receipt still tracks full tree content.
  if (!diff.trim()) {
    from = EMPTY_TREE;
    diff = git(["diff", `${EMPTY_TREE}...${headRef}`], repoRoot, {
      allowFail: true,
    });
    log = git(["log", "--oneline", headRef], repoRoot, { allowFail: true });
  }

  const commitRange = `${from}..${headRef}`;
  const material = [
    `base:${baseRef}`,
    `from:${from}`,
    `head:${headRef}`,
    `log:${log}`,
    `diff:${diff}`,
  ].join("\n");

  return {
    baseRef,
    headRef,
    commitRange,
    diff,
    diffHash: sha256(material),
  };
}
