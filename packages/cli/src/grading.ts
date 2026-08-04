import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gradeProposalPath, knowCodeDir } from "./paths.js";
import type { Level } from "./types.js";

export const CANONICAL_FLOW =
  "taught → questions → ask → grade propose → grade --review → pass → commit → range seal";

export const GRADE_PROPOSAL_VERSION = 1 as const;

export interface GradeProposalQuestion {
  id: string;
  score: number;
  feedback: string;
}

export interface GradeProposal {
  version: typeof GRADE_PROPOSAL_VERSION;
  diffHash: string;
  answersDigest: string;
  proposedScore: number;
  passed: boolean;
  perQuestion: GradeProposalQuestion[];
  rubricVersion: string;
  gradedBy: string;
  gradedAt: string;
  level?: Level;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortKeysDeep(obj[k]);
    }
    return out;
  }
  return value;
}

export function proposalDigest(proposal: GradeProposal): string {
  return createHash("sha256")
    .update(JSON.stringify(sortKeysDeep(proposal)))
    .digest("hex");
}

export function readGradeProposal(repoRoot: string): GradeProposal | null {
  const path = gradeProposalPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as GradeProposal;
    if (data.version !== GRADE_PROPOSAL_VERSION) return null;
    if (!data.diffHash || typeof data.proposedScore !== "number") return null;
    if (!Array.isArray(data.perQuestion)) return null;
    return data;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(
        `know-code: corrupt .know-code/grade-proposal.json — fix or delete and re-run agent grading.`,
      );
    }
    return null;
  }
}

export function writeGradeProposal(
  repoRoot: string,
  proposal: GradeProposal,
): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(
    gradeProposalPath(repoRoot),
    `${JSON.stringify(proposal, null, 2)}\n`,
  );
}

export function assertGradeProposalForHash(
  repoRoot: string,
  diffHash: string,
  answersDigest: string,
): GradeProposal {
  const proposal = readGradeProposal(repoRoot);
  if (!proposal) {
    throw new Error(
      "know-code: missing .know-code/grade-proposal.json — agent must score answers after ask.\n" +
        "  Agent: write grade-proposal.json (see skills/know-code/references/grading-rubric.md)\n" +
        "  Or: know-code grade propose --json for rubric context",
    );
  }
  if (proposal.diffHash !== diffHash) {
    throw new Error(
      `know-code: grade-proposal.json hash mismatch.\n` +
        `  proposal: ${proposal.diffHash}\n` +
        `  current:  ${diffHash}\n` +
        `Re-run agent grading for the current diff.`,
    );
  }
  if (proposal.answersDigest !== answersDigest) {
    throw new Error(
      "know-code: grade-proposal.json does not match current answers.json (answers changed after proposal).",
    );
  }
  for (const q of proposal.perQuestion) {
    if (!Number.isFinite(q.score) || q.score < 0 || q.score > 1) {
      throw new Error(
        `know-code: invalid per-question score for ${q.id} (must be 0–1).`,
      );
    }
  }
  if (
    !Number.isFinite(proposal.proposedScore) ||
    proposal.proposedScore < 0 ||
    proposal.proposedScore > 1
  ) {
    throw new Error("know-code: grade-proposal.json proposedScore must be 0–1.");
  }
  return proposal;
}
