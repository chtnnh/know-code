import { execFileSync } from "node:child_process";

export function git(
  args: string[],
  cwd: string,
  options: { allowFail?: boolean } = {},
): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
    }).trim();
  } catch (err) {
    if (options.allowFail) return "";
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
}

export function resolveBaseRef(repoRoot: string, preferred: string): string {
  const candidates = [
    `origin/${preferred}`,
    preferred,
    "origin/main",
    "main",
    "origin/master",
    "master",
  ];

  for (const ref of candidates) {
    const ok = git(["rev-parse", "--verify", "--quiet", ref], repoRoot, {
      allowFail: true,
    });
    if (ok) return ref;
  }

  // Empty tree (git's well-known hash) when no base branch exists yet
  const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
  const root = git(["rev-list", "--max-parents=0", "HEAD"], repoRoot, {
    allowFail: true,
  });
  return root || EMPTY_TREE;
}

export function currentHead(repoRoot: string): string {
  const head = git(["rev-parse", "HEAD"], repoRoot, { allowFail: true });
  if (head) return head;
  // Unborn HEAD (no commits yet) — hash staged/worktree vs empty tree
  return "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
}

export function mergeBase(repoRoot: string, baseRef: string, headRef: string): string {
  const mb = git(["merge-base", baseRef, headRef], repoRoot, { allowFail: true });
  if (mb) return mb;
  return baseRef;
}

export function diffStat(repoRoot: string, from: string, to: string): string {
  return git(["diff", "--stat", `${from}...${to}`], repoRoot, { allowFail: true });
}

export function fullDiff(repoRoot: string, from: string, to: string): string {
  return git(["diff", `${from}...${to}`], repoRoot, { allowFail: true });
}

export function logOneline(repoRoot: string, from: string, to: string): string {
  return git(["log", "--oneline", `${from}..${to}`], repoRoot, { allowFail: true });
}

export function revListCount(repoRoot: string, from: string, to: string): number {
  const out = git(["rev-list", "--count", `${from}..${to}`], repoRoot, {
    allowFail: true,
  });
  return Number.parseInt(out || "0", 10) || 0;
}
