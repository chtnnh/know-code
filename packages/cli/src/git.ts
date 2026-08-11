import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

/**
 * Env for know-code's own git subprocesses. Drops GIT_INDEX_FILE so the kernel
 * always reads the real index: during partial commits (git commit -- <paths>)
 * git exports a temporary slice-only index to hooks, which must not change
 * what know-code considers staged (hash/tree checks would see only the slice).
 */
export function knowCodeGitEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!("GIT_INDEX_FILE" in env)) return env;
  const { GIT_INDEX_FILE: _dropped, ...rest } = env;
  return rest;
}

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
      env: knowCodeGitEnv(),
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

/**
 * Cleanliness helpers use `git diff --quiet` exit codes — never porcelain via
 * `git().trim()`, which strips the leading space on ` M file` and mis-reads
 * unstaged vs staged.
 */
function gitDiffQuiet(repoRoot: string, cached: boolean): boolean {
  try {
    execFileSync(
      "git",
      cached ? ["diff", "--cached", "--quiet"] : ["diff", "--quiet"],
      { cwd: repoRoot, stdio: "ignore", env: knowCodeGitEnv() },
    );
    return true;
  } catch {
    return false;
  }
}

/** Tracked files with unstaged modifications (index-only hash ignores these). */
export function hasUnstagedTrackedChanges(repoRoot: string): boolean {
  return !gitDiffQuiet(repoRoot, false);
}

/** Index differs from HEAD (staged changes present). */
export function hasStagedChanges(repoRoot: string): boolean {
  return !gitDiffQuiet(repoRoot, true);
}

/** No staged or unstaged tracked changes (untracked ignored). */
export function workingTreeClean(repoRoot: string): boolean {
  return !hasUnstagedTrackedChanges(repoRoot) && !hasStagedChanges(repoRoot);
}

/**
 * Tree OID of the real index ("" when unavailable). `git write-tree` locks the
 * index to update the cache-tree; inside commit hooks git already holds
 * .git/index.lock, so retry against a temp copy of the index (write-tree then
 * locks the copy, not the repo index).
 */
export function indexTreeOid(repoRoot: string): string {
  const direct = git(["write-tree"], repoRoot, { allowFail: true });
  if (direct) return direct;
  const rel = git(["rev-parse", "--git-path", "index"], repoRoot, {
    allowFail: true,
  });
  if (!rel) return "";
  const indexPath = isAbsolute(rel) ? rel : join(repoRoot, rel);
  if (!existsSync(indexPath)) return "";
  const tmp = join(
    tmpdir(),
    `kc-index-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  try {
    copyFileSync(indexPath, tmp);
    return execFileSync("git", ["write-tree"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...knowCodeGitEnv(), GIT_INDEX_FILE: tmp },
    }).trim();
  } catch {
    return "";
  } finally {
    rmSync(tmp, { force: true });
    rmSync(`${tmp}.lock`, { force: true });
  }
}

/** Paths with staged changes vs HEAD (empty when index matches HEAD). */
export function stagedFileNames(repoRoot: string): string[] {
  const out = git(["diff", "--cached", "--name-only", "-z"], repoRoot, {
    allowFail: true,
  });
  return out ? out.split("\0").filter(Boolean) : [];
}

/** Tracked paths with unstaged modifications vs index. */
export function unstagedTrackedFileNames(repoRoot: string): string[] {
  const out = git(["diff", "--name-only", "-z"], repoRoot, { allowFail: true });
  return out ? out.split("\0").filter(Boolean) : [];
}

/** Untracked (and not ignored) paths. */
export function untrackedFileNames(repoRoot: string): string[] {
  const out = git(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    repoRoot,
    { allowFail: true },
  );
  return out ? out.split("\0").filter(Boolean) : [];
}
