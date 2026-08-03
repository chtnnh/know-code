import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configPath, homeConfigPath, knowCodeDir } from "./paths.js";
import {
  DEFAULT_CONFIG,
  isLevel,
  isRangeMode,
  isRangeSealMode,
  type Config,
  type Level,
} from "./types.js";

function readJsonPartial(path: string): Partial<Config> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<Config>;
  } catch {
    throw new Error(`Invalid JSON in ${path}`);
  }
}

function mergeConfig(home: Partial<Config>, repo: Partial<Config>): Partial<Config> {
  return { ...home, ...repo };
}

export function readConfig(repoRoot: string): Config {
  const home = readJsonPartial(homeConfigPath());
  const repo = readJsonPartial(configPath(repoRoot));
  const merged = mergeConfig(home, repo);

  const envLevel = process.env.KNOW_CODE_LEVEL;
  const levelRaw = envLevel || merged.level || DEFAULT_CONFIG.level;
  if (!isLevel(levelRaw)) {
    throw new Error(
      `Invalid level "${levelRaw}". Expected lite | standard | deep.`,
    );
  }

  const rangeModeRaw = merged.rangeMode ?? DEFAULT_CONFIG.rangeMode;
  if (!isRangeMode(rangeModeRaw)) {
    throw new Error(
      `Invalid rangeMode "${rangeModeRaw}". Expected auto | index | range.`,
    );
  }

  const rangeSealRaw = merged.rangeSeal ?? DEFAULT_CONFIG.rangeSeal;
  if (!isRangeSealMode(rangeSealRaw)) {
    throw new Error(
      `Invalid rangeSeal "${rangeSealRaw}". Expected receipt | rewrite.`,
    );
  }

  return {
    level: levelRaw,
    baseBranch: merged.baseBranch || DEFAULT_CONFIG.baseBranch,
    requireTrailer: merged.requireTrailer ?? DEFAULT_CONFIG.requireTrailer,
    rangeMode: rangeModeRaw,
    rangeSeal: rangeSealRaw,
    requireAttest: merged.requireAttest ?? DEFAULT_CONFIG.requireAttest,
  };
}

/** Repo-local settings only — gitignored; never includes attest keys. */
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
