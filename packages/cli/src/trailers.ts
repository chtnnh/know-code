import { chmodSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { git } from "./git.js";
import { rangeCommitOids } from "./range.js";

const TRAILER_RE = /^Know-Code-Verified:\s*[0-9a-f]{64}\s*$/im;
const TRAILER_HASH_RE = /^Know-Code-Verified:\s*([0-9a-f]{64})\s*$/im;

export function trailerHashFromMessage(message: string): string | null {
  const m = message.match(TRAILER_HASH_RE);
  return m ? m[1].toLowerCase() : null;
}

export function headHasTrailer(
  repoRoot: string,
  headRef: string,
  hash: string,
): boolean {
  const headMsg = git(["log", "-1", "--format=%B", headRef], repoRoot, {
    allowFail: true,
  });
  return new RegExp(`^Know-Code-Verified:\\s*${hash}\\s*$`, "im").test(headMsg);
}

/** When every commit in fromOid..HEAD carries the same trailer hash, return it. */
export function inferUniformRangeTrailerHash(
  repoRoot: string,
  fromOid: string,
): string | null {
  const commits = rangeCommitOids(repoRoot, fromOid);
  if (!commits.length) return null;
  let hash: string | null = null;
  for (const c of commits) {
    const msg = git(["log", "-1", "--format=%B", c], repoRoot);
    const h = trailerHashFromMessage(msg);
    if (!h) return null;
    if (!hash) hash = h;
    else if (hash !== h) return null;
  }
  return hash;
}

export function messageWithTrailer(message: string, hash: string): string {
  const trailer = `Know-Code-Verified: ${hash}`;
  if (TRAILER_RE.test(message)) {
    return message.replace(TRAILER_RE, trailer);
  }
  return `${message.replace(/\s+$/, "")}\n\n${trailer}\n`;
}

/**
 * Rewrite commit messages for fromOid..HEAD so each carries
 * Know-Code-Verified: <tipHash> (same hash for the whole range).
 */
export function applyTrailerToRange(
  repoRoot: string,
  fromOid: string,
  tipHash: string,
): { rewritten: number } {
  const commits = rangeCommitOids(repoRoot, fromOid);
  if (!commits.length) {
    throw new Error(
      "know-code: no commits in range to seal. Make commits after `know-code range begin`.",
    );
  }

  const dir = mkdtempSync(join(tmpdir(), "know-code-msg-"));
  const script = join(dir, "msg-filter.sh");
  writeFileSync(
    script,
    `#!/bin/sh
set -e
msg=$(cat)
trailer="Know-Code-Verified: ${tipHash}"
if printf '%s\\n' "$msg" | grep -qiE '^Know-Code-Verified:[[:space:]]*[0-9a-f]{64}[[:space:]]*$'; then
  printf '%s\\n' "$msg" | sed -E "s/^Know-Code-Verified:[[:space:]]*[0-9a-f]{64}[[:space:]]*$/$trailer/"
else
  printf '%s\\n\\n%s\\n' "$(printf '%s' "$msg" | sed -e 's/[[:space:]]*$//')" "$trailer"
fi
`,
    { mode: 0o700 },
  );
  try {
    chmodSync(script, 0o700);
  } catch {
    /* ignore */
  }

  try {
    execFileSync(
      "git",
      ["filter-branch", "-f", "--msg-filter", script, `${fromOid}..HEAD`],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          FILTER_BRANCH_SQUELCH_WARNING: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      },
    );
  } catch (err) {
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr?: Buffer | string }).stderr || "")
        : "";
    throw new Error(
      `know-code: failed to rewrite range trailers.\n${stderr || err}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Drop filter-branch backup refs to avoid clutter (best-effort).
  git(["update-ref", "-d", "refs/original/refs/heads/" + branchName(repoRoot)], repoRoot, {
    allowFail: true,
  });
  git(["for-each-ref", "--format=%(refname)", "refs/original/"], repoRoot, {
    allowFail: true,
  })
    .split("\n")
    .filter(Boolean)
    .forEach((ref) => {
      git(["update-ref", "-d", ref], repoRoot, { allowFail: true });
    });

  return { rewritten: commits.length };
}

function branchName(repoRoot: string): string {
  return (
    git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot, { allowFail: true }) ||
    "HEAD"
  );
}

/** True if every commit in from..HEAD has Know-Code-Verified: tipHash. */
export function rangeHasTipTrailers(
  repoRoot: string,
  fromOid: string,
  tipHash: string,
): boolean {
  const commits = rangeCommitOids(repoRoot, fromOid);
  if (!commits.length) return false;
  const re = new RegExp(`^Know-Code-Verified:\\s*${tipHash}\\s*$`, "im");
  for (const c of commits) {
    const msg = git(["log", "-1", "--format=%B", c], repoRoot);
    if (!re.test(msg)) return false;
  }
  return true;
}
