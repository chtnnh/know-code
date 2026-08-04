export type Level = "lite" | "standard" | "deep";

export const LEVELS: readonly Level[] = ["lite", "standard", "deep"] as const;

export function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value);
}

export type RangeMode = "auto" | "index" | "range";
export type RangeSealMode = "receipt" | "rewrite";
export type HashScope = "index" | "range";

export function isRangeMode(value: string): value is RangeMode {
  return value === "auto" || value === "index" || value === "range";
}

export function isRangeSealMode(value: string): value is RangeSealMode {
  return value === "receipt" || value === "rewrite";
}

export interface Config {
  level: Level;
  baseBranch: string;
  requireTrailer: boolean;
  rangeMode: RangeMode;
  rangeSeal: RangeSealMode;
  requireAttest: boolean;
  /** Require agent grade-proposal.json before human grade seal. */
  requireGradeProposal?: boolean;
  /** Allow legacy grade --score without proposal. */
  allowSelfScore?: boolean;
  /** Require sealed taught before ask. */
  enforcePipeline?: boolean;
}

export const DEFAULT_CONFIG: Config = {
  level: "standard",
  baseBranch: "main",
  requireTrailer: false,
  rangeMode: "auto",
  rangeSeal: "receipt",
  requireAttest: true,
  requireGradeProposal: true,
  allowSelfScore: false,
  enforcePipeline: false,
};

export interface GateReceipt {
  version: 1;
  diffHash: string;
  level: Level;
  passedAt: string;
  commitRange: string;
  baseRef: string;
  headRef: string;
  scope?: HashScope;
  rangeFromOid?: string;
  commitCount?: number;
  answersDigest?: string;
  keyId?: string;
  sig?: string;
}

export interface RangeSealReceipt {
  version: 1;
  diffHash: string;
  rangeFromOid: string;
  commitCount: number;
  sealMode: RangeSealMode;
  gateKeyId: string;
  sealedAt: string;
  keyId?: string;
  sig?: string;
}

export interface DiffContext {
  baseRef: string;
  headRef: string;
  commitRange: string;
  diff: string;
  diffHash: string;
}

export interface QuizContext extends DiffContext {
  scope: HashScope;
  rangeFromOid?: string;
  commitCount: number;
}
