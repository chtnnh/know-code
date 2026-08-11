/**
 * Shared temp-repo helpers for CLI tests. Not shipped in package surface
 * beyond dist (tests only).
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { writeConfig } from "./config.js";
import { computeDiffContext } from "./hash.js";
import { writeGate, materializedTreeOid } from "./gate.js";
import { DEFAULT_CONFIG, type Config, type Level } from "./types.js";

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function gitAllowFail(cwd: string, args: string[]): string {
  try {
    return git(cwd, args);
  } catch {
    return "";
  }
}

export interface TempRepo {
  root: string;
  cleanup: () => void;
}

export function withTempRepo(prefix = "kc-"): TempRepo {
  const root = mkdtempSync(join(tmpdir(), prefix));
  git(root, ["init", "-b", "main", "--template="]);
  git(root, ["config", "user.email", "t@test"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function writeFile(repo: string, rel: string, content: string): void {
  const path = join(repo, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function commitAll(repo: string, message: string): string {
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

export function liteConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    level: "lite" as Level,
    requireAttest: false,
    requireTrailer: false,
    requireGradeProposal: false,
    // Tests open a gate directly; full pipeline is covered separately.
    enforcePipeline: false,
    ...overrides,
  };
}

/** Init repo with one commit + config + open unsigned gate for tip hash. */
export function setupOpenGate(
  repo: string,
  overrides: Partial<Config> = {},
): { cfg: Config; hash: string; head: string; treeOid: string } {
  writeFile(repo, "a.txt", "1\n");
  const head = commitAll(repo, "base");
  mkdirSync(join(repo, ".know-code"), { recursive: true });
  const cfg = liteConfig(overrides);
  writeConfig(repo, cfg);
  const hash = computeDiffContext(repo, cfg).diffHash;
  const treeOid = materializedTreeOid(repo);
  writeGate(repo, {
    version: 1,
    diffHash: hash,
    level: cfg.level,
    passedAt: new Date().toISOString(),
    commitRange: "x",
    baseRef: "y",
    headRef: head,
    gatedTreeOid: treeOid,
  });
  return { cfg, hash, head, treeOid };
}

export function writeCommitEditMsg(repo: string, message: string): void {
  const rel = git(repo, ["rev-parse", "--git-path", "COMMIT_EDITMSG"]);
  const path = rel.startsWith("/") ? rel : join(repo, rel);
  writeFileSync(path, message);
}

export function captureExit(
  fn: () => void,
): { code: number | null; error?: unknown } {
  const prev = process.exit;
  let code: number | null = null;
  process.exit = ((c?: number) => {
    code = c ?? 0;
    throw new Error(`__exit_${code}`);
  }) as typeof process.exit;
  try {
    fn();
    return { code: code ?? 0 };
  } catch (err) {
    if (code !== null) return { code };
    return { code: null, error: err };
  } finally {
    process.exit = prev;
  }
}

export function silenceConsole<T>(fn: () => T): T {
  const log = console.log;
  const err = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.error = err;
  }
}

export async function silenceConsoleAsync<T>(fn: () => Promise<T>): Promise<T> {
  const log = console.log;
  const err = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = err;
  }
}

export function knowCodeExists(repo: string, name: string): boolean {
  return existsSync(join(repo, ".know-code", name));
}
