import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config.js";
import {
  isGateOpenForShipping,
  resolveEffectiveQuizState,
  trailerHashForCommit,
} from "../enforcement.js";
import { git } from "../git.js";
import { readGateSafe } from "../gate.js";
import { findGitRoot, knowCodeDir } from "../paths.js";
import { sanitizedGitProcessEnv } from "../git-env.js";
import { assertKnowCodeCommitArgsAllowed, injectTrailer } from "./commit.js";

/** Build git commit --amend args (exported for tests). */
export function buildAmendArgs(
  rawArgs: string[],
  trailerHash: string,
  headMessage: string,
): string[] {
  const noTrailer = rawArgs.includes("--no-trailer");
  const gitArgs = rawArgs.filter((a) => a !== "--no-trailer");
  let finalArgs = ["--amend", ...gitArgs];

  if (noTrailer) return finalArgs;

  const hasMessage = finalArgs.some(
    (a, i) =>
      (a === "-m" || a === "--message" || a === "-F") &&
      finalArgs[i + 1] !== undefined,
  );
  if (hasMessage) {
    return injectTrailer(finalArgs, trailerHash);
  }
  return injectTrailer(["--amend", "-m", headMessage], trailerHash);
}

export function cmdAmend(rawArgs: string[]): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, config);
  const gatePath = join(knowCodeDir(repoRoot), "gate.json");
  const receipt = readGateSafe(repoRoot);
  if (existsSync(gatePath) && !receipt) {
    console.error(
      "know-code: amend blocked — corrupt .know-code/gate.json (delete and re-run know-code pass).",
    );
    process.exit(2);
  }

  if (!isGateOpenForShipping(repoRoot, receipt, state, config.level)) {
    console.error("know-code: amend blocked — gate closed for current hash.");
    console.error("know-code: run know-code status for next step");
    process.exit(2);
  }

  const trailerHash = trailerHashForCommit(state);
  const headMessage = git(["log", "-1", "--format=%B"], repoRoot, {
    allowFail: true,
  });
  const gitArgs = rawArgs.filter((a) => a !== "--no-trailer");
  assertKnowCodeCommitArgsAllowed(gitArgs);
  const finalArgs = buildAmendArgs(rawArgs, trailerHash, headMessage || "amend");

  const result = spawnSync("git", ["commit", ...finalArgs], {
    cwd: repoRoot,
    stdio: "inherit",
    env: sanitizedGitProcessEnv(),
  });
  process.exit(result.status ?? 1);
}
