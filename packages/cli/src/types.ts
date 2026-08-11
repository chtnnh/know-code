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
  /** 0.3.0: teaching + quiz pipeline required before pass by default. */
  enforcePipeline: true,
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
  /** Materialized tree (write-tree) at pass — survives commit-only hash drift. */
  gatedTreeOid?: string;
  /** HEAD oid bound at range seal — survives range-seal.json deletion. */
  sealedHeadOid?: string;
  keyId?: string;
  sig?: string;
}

export interface SealedHeadBindingReceipt {
  version: 1;
  sealedHeadOid: string;
  boundAt: string;
  diffHash?: string;
  keyId?: string;
  sig?: string;
}

export interface RangeSealReceipt {
  version: 1;
  /** Tip hash at seal time (used for rewrite trailers / CI). */
  diffHash: string;
  rangeFromOid: string;
  commitCount: number;
  sealMode: RangeSealMode;
  gateKeyId: string;
  sealedAt: string;
  /** HEAD oid when the range was sealed (binds verify + rewrite-open). */
  sealedHeadOid?: string;
  /** Pass-time hash when seal happened under commitDrift (audit). */
  gatePassHash?: string;
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
