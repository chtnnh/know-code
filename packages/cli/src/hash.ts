import { createHash } from "node:crypto";
import {
  currentHead,
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

/**
 * Hash the patch from merge-base (or empty tree) to the **index** (HEAD + staged).
 * That way a quiz before `git commit` stays valid after the commit lands, and
 * message-only amends do not change the hash.
 */
export function computeDiffContext(
  repoRoot: string,
  config: Config,
): DiffContext {
  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  const headRef = currentHead(repoRoot);

  let from: string;
  if (headRef === EMPTY_TREE) {
    from = EMPTY_TREE;
  } else {
    from = mergeBase(repoRoot, baseRef, headRef);
    const committed = git(["diff", `${from}...${headRef}`], repoRoot, {
      allowFail: true,
    });
    // On the base branch tip, triple-dot is empty — use empty-tree as the floor.
    if (!committed.trim()) {
      from = EMPTY_TREE;
    }
  }

  // Index = HEAD tree + staged changes (what the next commit would contain)
  const indexTree =
    git(["write-tree"], repoRoot, { allowFail: true }) || EMPTY_TREE;
  const diff = git(["diff", from, indexTree], repoRoot, { allowFail: true });
  const log =
    headRef === EMPTY_TREE
      ? ""
      : logOneline(repoRoot, from === EMPTY_TREE ? headRef : from, headRef);

  const commitRange = `${from}..${headRef === EMPTY_TREE ? "HEAD" : headRef}`;
  const material = [`base:${baseRef}`, `from:${from}`, `diff:${diff}`].join(
    "\n",
  );

  return {
    baseRef,
    headRef: headRef === EMPTY_TREE ? EMPTY_TREE : headRef,
    commitRange,
    diff,
    diffHash: sha256(material),
  };
}
