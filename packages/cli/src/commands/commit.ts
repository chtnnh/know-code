import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readConfig } from "../config.js";
import { isSignedGateOpen, readGate } from "../gate.js";
import { resolveQuizContext } from "../hash.js";
import { tryOverrideBypass } from "../override.js";
import { findGitRoot } from "../paths.js";

export function cmdCommit(rawArgs: string[]): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);

  if (process.env.KNOW_CODE_OVERRIDE === "1") {
    const bypass = tryOverrideBypass(repoRoot);
    if (!bypass.allowed) {
      console.error(bypass.reason || "know-code: OVERRIDE denied.");
      process.exit(2);
    }
    console.error(
      "know-code: committing via human OVERRIDE (logged; trailer still added unless --no-trailer).",
    );
  } else {
    const receipt = readGate(repoRoot);
    if (!isSignedGateOpen(repoRoot, receipt, ctx.diffHash, config.level)) {
      console.error("know-code: commit blocked — gate is closed or seal invalid.");
      console.error(
        "know-code: flow: taught → questions → ask → grade propose → grade --review → pass → know-code commit",
      );
      process.exit(2);
    }
  }

  const noTrailer = rawArgs.includes("--no-trailer");
  const gitArgs = rawArgs.filter((a) => a !== "--no-trailer");
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
      let msg = readFileSync(args[i + 1], "utf8");
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
