import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  proposalDigest,
  GRADE_PROPOSAL_VERSION,
  type GradeProposal,
} from "./grading.js";

describe("grading proposal", () => {
  it("proposalDigest is stable", () => {
    const p: GradeProposal = {
      version: GRADE_PROPOSAL_VERSION,
      diffHash: "a".repeat(64),
      answersDigest: "b".repeat(64),
      proposedScore: 0.85,
      passed: true,
      perQuestion: [{ id: "q1", score: 0.9, feedback: "ok" }],
      rubricVersion: "1",
      gradedBy: "agent",
      gradedAt: "2026-01-01T00:00:00.000Z",
    };
    const d1 = proposalDigest(p);
    const d2 = proposalDigest(p);
    assert.equal(d1, d2);
    assert.equal(d1.length, 64);
  });

  it("proposalDigest changes when score changes", () => {
    const base: GradeProposal = {
      version: GRADE_PROPOSAL_VERSION,
      diffHash: "a".repeat(64),
      answersDigest: "b".repeat(64),
      proposedScore: 0.85,
      passed: true,
      perQuestion: [],
      rubricVersion: "1",
      gradedBy: "agent",
      gradedAt: "2026-01-01T00:00:00.000Z",
    };
    const d1 = proposalDigest(base);
    const d2 = proposalDigest({ ...base, proposedScore: 0.9 });
    assert.notEqual(d1, d2);
  });
});
