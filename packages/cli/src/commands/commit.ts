import { spawnSync } from "node:child_process";
import { readConfig } from "../config.js";
import { isGateValid, readGate } from "../gate.js";
import { computeDiffContext } from "../hash.js";
import { findGitRoot } from "../paths.js";

/**
 * Wrapper around `git commit` that:
 * 1. Requires an open know-code gate (unless KNOW_CODE_OVERRIDE=1)
 * 2. Appends Know-Code-Verified: <hash> to the message (unless --no-trailer)
 */
export function cmdCommit(rawArgs: string[]): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = computeDiffContext(repoRoot, config);

  if (process.env.KNOW_CODE_OVERRIDE !== "1") {
    const receipt = readGate(repoRoot);
    if (!isGateValid(receipt, ctx.diffHash, config.level)) {
      console.error("know-code: commit blocked — gate is closed.");
      console.error(
        "know-code: run know-code-teach (unless skipped), then know-code ask / quiz, then retry.",
      );
      process.exit(2);
    }
  }

  const noTrailer = rawArgs.includes("--no-trailer");
  const gitArgs = rawArgs.filter((a) => a !== "--no-trailer");
  // Always add trailer unless explicitly opted out (CI / dogfooding default).
  const withTrailer = !noTrailer;

  let finalArgs = [...gitArgs];
  if (withTrailer) {
    finalArgs = injectTrailer(finalArgs, ctx.diffHash);
  }

  const result = spawnSync("git", ["commit", ...finalArgs], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (withTrailer) {
    console.error(
      `know-code: committed with Know-Code-Verified: ${ctx.diffHash}`,
    );
  }
}

function injectTrailer(args: string[], hash: string): string[] {
  const trailer = `Know-Code-Verified: ${hash}`;
  const out: string[] = [];
  let injected = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "-m" || a === "-F") && args[i + 1] !== undefined) {
      if (a === "-m") {
        let msg = args[i + 1];
        if (!/^Know-Code-Verified:/m.test(msg)) {
          msg = `${msg.replace(/\s+$/, "")}\n\n${trailer}\n`;
        }
        out.push("-m", msg);
        i++;
        injected = true;
        continue;
      }
    }
    // Combined -mMessage form is rare; skip
    out.push(a);
  }

  if (!injected) {
    // No -m provided: use a commit template via -m with only trailer is wrong.
    // Require -m so the agent always passes an explicit message.
    console.error(
      "know-code: pass a message with -m \"...\" (trailer is added automatically).",
    );
    console.error(
      'know-code: example: know-code commit -m "Fix the gate hash floor"',
    );
    process.exit(1);
  }

  return out;
}
