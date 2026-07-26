import { createHash } from "node:crypto";
import { currentHead, git, mergeBase, resolveBaseRef } from "./git.js";
import type { Config, DiffContext } from "./types.js";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash is the patch from the empty tree to the **index** (HEAD + staged).
 * A fixed floor (not merge-base) keeps the hash stable when origin/main
 * catches up to HEAD and when quiz-then-commit lands the same tree.
 * Message-only amends do not change the tree, so they keep the same hash.
 */
export function computeDiffContext(
  repoRoot: string,
  config: Config,
): DiffContext {
  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  const headRef = currentHead(repoRoot);

  // Display range only — not part of the hash material
  let rangeFrom = EMPTY_TREE;
  if (headRef !== EMPTY_TREE) {
    const mb = mergeBase(repoRoot, baseRef, headRef);
    const committed = git(["diff", `${mb}...${headRef}`], repoRoot, {
      allowFail: true,
    });
    rangeFrom = committed.trim() ? mb : EMPTY_TREE;
  }

  const indexTree =
    git(["write-tree"], repoRoot, { allowFail: true }) || EMPTY_TREE;
  const diff = git(["diff", EMPTY_TREE, indexTree], repoRoot, {
    allowFail: true,
  });

  const material = [`diff:${diff}`].join("\n");

  return {
    baseRef,
    headRef: headRef === EMPTY_TREE ? EMPTY_TREE : headRef,
    commitRange: `${rangeFrom}..${headRef === EMPTY_TREE ? "HEAD" : headRef}`,
    diff,
    diffHash: sha256(material),
  };
}
