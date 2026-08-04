import { spawnSync } from "node:child_process";
import { readConfig } from "../config.js";
import { isSignedGateOpen, readGate } from "../gate.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot } from "../paths.js";
import { injectTrailer } from "./commit.js";

export function cmdAmend(rawArgs: string[]): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const receipt = readGate(repoRoot);

  if (!isSignedGateOpen(repoRoot, receipt, ctx.diffHash, config.level)) {
    console.error("know-code: amend blocked — gate closed for current hash.");
    console.error("know-code: run know-code status for next step");
    process.exit(2);
  }

  const noTrailer = rawArgs.includes("--no-trailer");
  const gitArgs = rawArgs.filter((a) => a !== "--no-trailer");
  let finalArgs = ["--amend", ...gitArgs];

  if (!noTrailer) {
    const hasMessage = finalArgs.some(
      (a, i) =>
        (a === "-m" || a === "--message" || a === "-F") &&
        finalArgs[i + 1] !== undefined,
    );
    if (hasMessage) {
      finalArgs = injectTrailer(finalArgs, ctx.diffHash);
    } else {
      finalArgs = injectTrailer(["-m", "amend"], ctx.diffHash);
    }
  }

  const result = spawnSync("git", ["commit", ...finalArgs], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, KNOW_CODE_COMMIT: "1" },
  });
  process.exit(result.status ?? 1);
}
