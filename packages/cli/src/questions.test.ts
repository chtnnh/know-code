import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeQuestionQuota,
  LEVEL_BASE,
  LEVEL_CAP,
  type QuotaSignals,
} from "./questions.js";

function signals(over: Partial<QuotaSignals>): QuotaSignals {
  return {
    level: "standard",
    fromRef: "abc",
    toRef: "HEAD",
    commitCount: 1,
    filesChanged: 2,
    linesChanged: 50,
    languages: ["typescript"],
    sensitivePaths: false,
    ...over,
  };
}

describe("computeQuestionQuota", () => {
  it("returns level base when no bonuses", () => {
    const r = computeQuestionQuota(signals({ level: "lite" }));
    assert.equal(r.minQuestions, LEVEL_BASE.lite);
    assert.equal(r.cap, LEVEL_CAP.lite);
  });

  it("adds commit count bonus", () => {
    const r = computeQuestionQuota(signals({ commitCount: 5 }));
    assert.ok(r.minQuestions >= LEVEL_BASE.standard + 1);
  });

  it("clamps at cap", () => {
    const r = computeQuestionQuota(
      signals({
        level: "lite",
        commitCount: 20,
        filesChanged: 30,
        linesChanged: 5000,
        languages: ["typescript", "python", "go"],
        sensitivePaths: true,
      }),
    );
    assert.equal(r.minQuestions, LEVEL_CAP.lite);
  });

  it("deep base is 7", () => {
    const r = computeQuestionQuota(signals({ level: "deep", linesChanged: 10 }));
    assert.equal(r.minQuestions, 7);
  });
});
