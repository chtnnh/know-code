import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configPath, knowCodeDir } from "./paths.js";
import {
  DEFAULT_CONFIG,
  isLevel,
  type Config,
  type Level,
} from "./types.js";

export function readConfig(repoRoot: string): Config {
  const path = configPath(repoRoot);
  const envLevel = process.env.KNOW_CODE_LEVEL;
  let fileConfig: Partial<Config> = {};

  if (existsSync(path)) {
    try {
      fileConfig = JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
    } catch {
      throw new Error(`Invalid JSON in ${path}`);
    }
  }

  const levelRaw = envLevel || fileConfig.level || DEFAULT_CONFIG.level;
  if (!isLevel(levelRaw)) {
    throw new Error(
      `Invalid level "${levelRaw}". Expected lite | standard | deep.`,
    );
  }

  return {
    level: levelRaw,
    baseBranch: fileConfig.baseBranch || DEFAULT_CONFIG.baseBranch,
    requireTrailer:
      fileConfig.requireTrailer ?? DEFAULT_CONFIG.requireTrailer,
  };
}

export function writeConfig(repoRoot: string, config: Config): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(configPath(repoRoot), `${JSON.stringify(config, null, 2)}\n`);
}

export function resolveLevel(
  repoRoot: string,
  override?: string,
): Level {
  if (override) {
    if (!isLevel(override)) {
      throw new Error(
        `Invalid level "${override}". Expected lite | standard | deep.`,
      );
    }
    return override;
  }
  return readConfig(repoRoot).level;
}
