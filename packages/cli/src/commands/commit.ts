import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { readConfig } from "../config.js";
import { git } from "../git.js";
import {
  isGateOpenForShipping,
  resolveEffectiveQuizState,
  trailerHashForCommit,
} from "../enforcement.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isGatedTreeCurrent,
  readGateSafe,
} from "../gate.js";
import { hasUnstagedTrackedChanges } from "../git.js";
import { tryOverrideBypass, consumeOverrideAllow } from "../override.js";
import {
  gitCommitArgsAutoStage,
  gitCommitArgsBypassHooks,
  gitCommitArgsFixupSquash,
  gitCommitArgsHavePathspec,
  gitCommitArgsOnly,
  gitCommitArgsReuseMessage,
} from "../gate-cmd.js";
import { sanitizedGitProcessEnv } from "../git-env.js";
import { findGitRoot, knowCodeDir } from "../paths.js";

function readCommitMessage(path: string): string {
  if (path === "-") {
    return readFileSync(0, "utf8");
  }
  return readFileSync(path, "utf8");
}

/** True when pathspec/--only slices are safe: index tree still equals gated tree. */
export function pathspecSliceAllowed(repoRoot: string): boolean {
  const gate = readGateSafe(repoRoot);
  if (!gate?.gatedTreeOid) return false;
  if (hasUnstagedTrackedChanges(repoRoot)) return false;
  return isGatedTreeCurrent(repoRoot, gate.gatedTreeOid);
}

/** Reject argv that skip trailer injection or auto-stage after gate check. */
export function assertKnowCodeCommitArgsAllowed(
  gitArgs: string[],
  opts: { allowGatedPathspec?: boolean; repoRoot?: string } = {},
): void {
  if (gitCommitArgsBypassHooks(gitArgs)) {
    console.error(
      "know-code: git commit hook bypass (--no-verify, -n, core.hooksPath) is not allowed via know-code commit.",
    );
    process.exit(2);
  }
  if (gitCommitArgsAutoStage(gitArgs)) {
    console.error(
      "know-code: -a/--all/-u/--update is not allowed via know-code commit (auto-stage TOCTOU). Stage explicitly first.",
    );
    process.exit(2);
  }
  if (gitCommitArgsReuseMessage(gitArgs)) {
    console.error(
      "know-code: -C/-c/--reuse-message/--reedit-message is not allowed via know-code commit (stale trailer). Pass -m \"…\".",
    );
    process.exit(2);
  }
  if (gitCommitArgsFixupSquash(gitArgs)) {
    console.error(
      "know-code: --fixup/--squash is not allowed via know-code commit. Pass -m \"…\".",
    );
    process.exit(2);
  }
  if (gitCommitArgsOnly(gitArgs) || gitCommitArgsHavePathspec(gitArgs)) {
    if (
      opts.allowGatedPathspec &&
      opts.repoRoot &&
      pathspecSliceAllowed(opts.repoRoot)
    ) {
      return;
    }
    console.error(
      "know-code: pathspecs / --only are not allowed unless the index tree still matches the gated tree (sliced batch after pass).\n" +
        'know-code: after pass: know-code commit -m "…" -- <files…>  | otherwise stage fully, then know-code commit -m "…".',
    );
    process.exit(2);
  }
}

export function cmdCommit(rawArgs: string[]): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, config);

  if (process.env.KNOW_CODE_OVERRIDE === "1") {
    // Peek only — pre-commit `know-code check` consumes the sealed allow once.
    const bypass = tryOverrideBypass(repoRoot, { consume: false });
    if (!bypass.allowed) {
      console.error(bypass.reason || "know-code: OVERRIDE denied.");
      process.exit(2);
    }
    console.error(
      "know-code: committing via human OVERRIDE (logged; trailer still added unless --no-trailer).",
    );
  } else {
    const gatePath = join(knowCodeDir(repoRoot), "gate.json");
    const receipt = readGateSafe(repoRoot);
    if (existsSync(gatePath) && !receipt) {
      console.error(
        "know-code: commit blocked — corrupt .know-code/gate.json (delete and re-run know-code pass).",
      );
      process.exit(2);
    }
    if (!isGateOpenForShipping(repoRoot, receipt, state, config.level)) {
      console.error("know-code: commit blocked — gate is closed or seal invalid.");
      console.error(
        "know-code: flow: taught → questions → ask → grade propose → grade --review → pass → know-code commit",
      );
      process.exit(2);
    }
  }

  const noTrailer = rawArgs.includes("--no-trailer");
  const gitArgs = rawArgs.filter((a) => a !== "--no-trailer");
  assertKnowCodeCommitArgsAllowed(gitArgs, {
    allowGatedPathspec: true,
    repoRoot,
  });
  const withTrailer = !noTrailer;
  const trailerHash = trailerHashForCommit(state);

  let finalArgs = [...gitArgs];
  if (withTrailer) {
    finalArgs = injectTrailer(finalArgs, trailerHash);
  }

  // Git only writes COMMIT_EDITMSG after the pre-commit hook, so pre-write the
  // final message here — the hook's requireTrailer check reads the pending
  // grounded trailer from it (see pendingCommitMessageHasGroundedTrailer).
  prewriteCommitEditMsg(repoRoot, finalArgs);

  const result = spawnSync("git", ["commit", ...finalArgs], {
    cwd: repoRoot,
    stdio: "inherit",
    env: sanitizedGitProcessEnv(),
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (process.env.KNOW_CODE_OVERRIDE === "1") {
    consumeOverrideAllow(repoRoot);
  }

  if (withTrailer) {
    console.error(
      `know-code: committed with Know-Code-Verified: ${trailerHash}`,
    );
  }
}

/** Final -m message from argv (injectTrailer normalizes --message/-F to -m). */
function messageFromArgs(args: string[]): string | null {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === "-m") return args[i + 1];
  }
  return null;
}

function prewriteCommitEditMsg(repoRoot: string, finalArgs: string[]): void {
  const msg = messageFromArgs(finalArgs);
  if (msg === null) return;
  const rel = git(["rev-parse", "--git-path", "COMMIT_EDITMSG"], repoRoot, {
    allowFail: true,
  });
  if (!rel) return;
  const path = isAbsolute(rel) ? rel : `${repoRoot}/${rel}`;
  try {
    writeFileSync(path, msg.endsWith("\n") ? msg : `${msg}\n`);
  } catch {
    // Non-fatal: the hook falls back to HEAD-trailer checks.
  }
}

/** @internal exported for tests */
export function injectTrailer(args: string[], hash: string): string[] {
  const trailer = `Know-Code-Verified: ${hash}`;
  const out: string[] = [];
  let injected = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (
      (a === "-m" || a === "--message") &&
      args[i + 1] !== undefined
    ) {
      let msg = args[i + 1];
      if (!/^Know-Code-Verified:/m.test(msg)) {
        msg = `${msg.replace(/\s+$/, "")}\n\n${trailer}\n`;
      }
      out.push(a === "--message" ? "-m" : a, msg);
      i++;
      injected = true;
      continue;
    }
    if (a === "-F" && args[i + 1] !== undefined) {
      let msg = readCommitMessage(args[i + 1]);
      if (!/^Know-Code-Verified:/m.test(msg)) {
        msg = `${msg.replace(/\s+$/, "")}\n\n${trailer}\n`;
      }
      out.push("-m", msg);
      i++;
      injected = true;
      continue;
    }
    out.push(a);
  }

  if (!injected) {
    console.error(
      'know-code: pass a message with -m "…", --message "…", or -F <file> (trailer is added automatically).',
    );
    process.exit(1);
  }

  return out;
}
