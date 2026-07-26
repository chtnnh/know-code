import { readConfig } from "../config.js";
import { git } from "../git.js";
import { computeDiffContext } from "../hash.js";
import { findGitRoot } from "../paths.js";

function trailersInRange(repoRoot: string, from: string, to: string): string[] {
  const commits = git(["rev-list", "--reverse", `${from}..${to}`], repoRoot, {
    allowFail: true,
  })
    .split("\n")
    .filter(Boolean);

  const found: string[] = [];
  for (const commit of commits) {
    const msg = git(["log", "-1", "--format=%B", commit], repoRoot);
    for (const line of msg.split("\n")) {
      const m = line.match(/^Know-Code-Verified:\s*([0-9a-f]{64})\s*$/i);
      if (m) found.push(m[1].toLowerCase());
    }
  }
  return found;
}

export function cmdVerify(opts: { requireAll?: boolean }): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = computeDiffContext(repoRoot, config);
  const from = ctx.commitRange.split("..")[0] || "";
  const trailers = trailersInRange(repoRoot, from, ctx.headRef);

  console.log(`know-code verify`);
  console.log(`  expected: ${ctx.diffHash}`);
  console.log(`  range:    ${ctx.commitRange}`);
  console.log(`  trailers: ${trailers.length}`);

  if (trailers.includes(ctx.diffHash)) {
    console.log("know-code: verified");
    process.exit(0);
  }

  const headMsg = git(["log", "-1", "--format=%B", ctx.headRef], repoRoot);
  if (
    new RegExp(`^Know-Code-Verified:\\s*${ctx.diffHash}\\s*$`, "im").test(
      headMsg,
    )
  ) {
    console.log("know-code: HEAD trailer verified");
    process.exit(0);
  }

  if (opts.requireAll) {
    console.error("know-code: require-all: missing matching trailers");
  }

  console.error("know-code: no matching Know-Code-Verified trailer");
  console.error(`know-code: add trailer: Know-Code-Verified: ${ctx.diffHash}`);
  process.exit(1);
}
