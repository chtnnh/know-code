import { join } from "node:path";
import { execFileSync } from "node:child_process";

export function findGitRoot(cwd: string = process.cwd()): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("Not inside a git repository.");
  }
}

export function knowCodeDir(repoRoot: string): string {
  return join(repoRoot, ".know-code");
}

export function configPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "config.json");
}

export function gatePath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "gate.json");
}

export function gitHooksDir(repoRoot: string): string {
  const custom = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return custom.startsWith("/") ? custom : join(repoRoot, custom);
}
