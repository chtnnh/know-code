export type Level = "lite" | "standard" | "deep";

export const LEVELS: readonly Level[] = ["lite", "standard", "deep"] as const;

export function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value);
}

export interface Config {
  level: Level;
  baseBranch: string;
  /** When true, require Know-Code-Verified trailer on commits (informational for skill). */
  requireTrailer: boolean;
}

export const DEFAULT_CONFIG: Config = {
  level: "standard",
  baseBranch: "main",
  requireTrailer: false,
};

export interface GateReceipt {
  version: 1;
  diffHash: string;
  level: Level;
  passedAt: string;
  commitRange: string;
  baseRef: string;
  headRef: string;
}

export interface DiffContext {
  baseRef: string;
  headRef: string;
  commitRange: string;
  diff: string;
  diffHash: string;
}
