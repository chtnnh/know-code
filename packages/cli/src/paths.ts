import { homedir } from "node:os";
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

export function homeKnowCodeDir(): string {
  return process.env.KNOW_CODE_HOME || join(homedir(), ".know-code");
}

export function homeConfigPath(): string {
  return join(homeKnowCodeDir(), "config.json");
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

export function answersPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "answers.json");
}

export function gradePath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "grade.json");
}

export function gradeProposalPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "grade-proposal.json");
}

export function quizPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "quiz.json");
}

export function taughtPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "taught.json");
}

export function rangeSealPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "range-seal.json");
}

export function sealedHeadBindingPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "sealed-head-binding.json");
}

export function overrideAllowPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "override-allow.json");
}

export function overrideLogPath(repoRoot: string): string {
  return join(knowCodeDir(repoRoot), "override.log");
}

export function gitHooksDir(repoRoot: string): string {
  const custom = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return custom.startsWith("/") ? custom : join(repoRoot, custom);
}
