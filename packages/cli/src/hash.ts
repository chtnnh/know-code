import { createHash } from "node:crypto";
import { readConfig } from "./config.js";
import {
  currentHead,
  git,
  indexTreeOid,
  mergeBase,
  resolveBaseRef,
  revListCount,
} from "./git.js";
import { findGitRoot } from "./paths.js";
import { readRangeSession } from "./range.js";
import type { Config, DiffContext, QuizContext } from "./types.js";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash is the patch from the empty tree to the **index** (HEAD + staged).
 */
export function computeDiffContext(
  repoRoot: string,
  config: Config,
): DiffContext {
  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  const headRef = currentHead(repoRoot);

  let rangeFrom = EMPTY_TREE;
  if (headRef !== EMPTY_TREE) {
    const mb = mergeBase(repoRoot, baseRef, headRef);
    const committed = git(["diff", `${mb}...${headRef}`], repoRoot, {
      allowFail: true,
    });
    rangeFrom = committed.trim() ? mb : EMPTY_TREE;
  }

  const indexTree = indexTreeOid(repoRoot) || EMPTY_TREE;
  const diff = git(["diff", EMPTY_TREE, indexTree], repoRoot, {
    allowFail: true,
  });

  return {
    baseRef,
    headRef: headRef === EMPTY_TREE ? EMPTY_TREE : headRef,
    commitRange: `${rangeFrom}..${headRef === EMPTY_TREE ? "HEAD" : headRef}`,
    diff,
    diffHash: sha256(`diff:${diff}`),
  };
}

/**
 * Cumulative hash for fromOid → current index tree (HEAD + staged).
 *
 * Tree-canonical on purpose: the same resulting tree must hash the same whether
 * the delta is still staged or already committed. Otherwise CI `verify` (no
 * local range-seal / gate.json) cannot match a pass-time trailer after
 * `know-code commit` lands the quiz tree — the classic dogfood gap.
 */
export function computeRangeDiffContext(
  repoRoot: string,
  config: Config,
  fromOid: string,
): QuizContext {
  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  const headRef = currentHead(repoRoot);
  const headLabel = headRef === EMPTY_TREE ? "HEAD" : headRef;
  const commitCount = revListCount(repoRoot, fromOid, headLabel);

  const fromTree =
    fromOid === EMPTY_TREE
      ? EMPTY_TREE
      : git(["rev-parse", `${fromOid}^{tree}`], repoRoot, { allowFail: true }) ||
        EMPTY_TREE;
  const indexTree = indexTreeOid(repoRoot) || EMPTY_TREE;
  const diff = git(["diff", fromTree, indexTree], repoRoot, {
    allowFail: true,
  });

  return {
    baseRef,
    headRef: headRef === EMPTY_TREE ? EMPTY_TREE : headRef,
    commitRange: `${fromOid}..${headLabel}`,
    diff,
    diffHash: sha256(`diff:${diff}`),
    scope: "range",
    rangeFromOid: fromOid,
    commitCount,
  };
}

export function resolveRangeFromOid(
  repoRoot: string,
  config: Config,
): string {
  const session = readRangeSession(repoRoot);
  if (session) return session.fromOid;
  const baseRef = resolveBaseRef(repoRoot, config.baseBranch);
  const head = currentHead(repoRoot);
  if (head === EMPTY_TREE) return EMPTY_TREE;
  return mergeBase(repoRoot, baseRef, head);
}

/**
 * Pick index vs range hash based on rangeMode and active range session.
 */
export function resolveQuizContext(
  repoRoot: string,
  config?: Config,
): QuizContext {
  const cfg = config ?? readConfig(repoRoot);
  const mode = cfg.rangeMode;
  const session = readRangeSession(repoRoot);

  const useRange = mode === "range" || (mode === "auto" && session !== null);

  if (!useRange) {
    const ctx = computeDiffContext(repoRoot, cfg);
    return { ...ctx, scope: "index", commitCount: 0 };
  }

  const fromOid = resolveRangeFromOid(repoRoot, cfg);
  return computeRangeDiffContext(repoRoot, cfg, fromOid);
}

export function resolveQuizContextFromRoot(): QuizContext {
  const repoRoot = findGitRoot();
  return resolveQuizContext(repoRoot);
}
