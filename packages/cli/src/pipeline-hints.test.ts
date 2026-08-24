import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { writeAnswers, writeGrade, writeTaught } from "./attest.js";
import { writeConfig } from "./config.js";
import { computeDiffContext } from "./hash.js";
import { evaluatePipeline } from "./pipeline.js";
import { commitAll, liteConfig, setupOpenGate, withTempRepo, writeFile } from "./test-helpers.js";

function blockerCommand(repoRoot: string, step: string): string | undefined {
  return evaluatePipeline(repoRoot).blockers.find((blocker) => blocker.step === step)
    ?.command;
}

function seedWorkflowArtifacts(repoRoot: string): { hash: string; cfg: ReturnType<typeof liteConfig> } {
  const cfg = liteConfig({ requireGradeProposal: false });
  writeConfig(repoRoot, cfg);
  const hash = computeDiffContext(repoRoot, cfg).diffHash;
  writeTaught(repoRoot, {
    version: 1,
    diffHash: hash,
    taughtAt: new Date().toISOString(),
    skipped: false,
  });
  writeFile(
    repoRoot,
    ".know-code/quiz.json",
    JSON.stringify({
      diffHash: hash,
      level: "lite",
      title: "quiz",
      questions: [
        { id: "q1", prompt: "What changed?" },
        { id: "q2", prompt: "Why?" },
      ],
    }),
  );
  writeAnswers(repoRoot, {
    diffHash: hash,
    answers: [
      { id: "q1", answer: "A" },
      { id: "q2", answer: "B" },
    ],
  });
  writeGrade(repoRoot, {
    version: 1,
    diffHash: hash,
    score: 1,
    passed: true,
    gradedAt: new Date().toISOString(),
    answersDigest: "seeded",
  });
  return { hash, cfg };
}

describe("pipeline recovery hints", () => {
  it("uses a runnable scaffold command when quiz.json is missing", () => {
    const { root, cleanup } = withTempRepo("kc-hint-quiz-");
    try {
      writeFile(root, "a.txt", "base\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig());

      assert.equal(blockerCommand(root, "quiz"), "know-code quiz init");
    } finally {
      cleanup();
    }
  });

  it("uses a runnable proposal-draft command when a grade proposal is missing", () => {
    const { root, cleanup } = withTempRepo("kc-hint-proposal-");
    try {
      writeFile(root, "a.txt", "base\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      writeConfig(root, liteConfig({ requireGradeProposal: true }));

      assert.equal(
        blockerCommand(root, "grade-proposal"),
        "know-code grade propose --write",
      );
    } finally {
      cleanup();
    }
  });

  it("maps every pipeline recovery state to a state-changing command", () => {
    const { root, cleanup } = withTempRepo("kc-hint-matrix-");
    try {
      writeFile(root, "a.txt", "base\n");
      commitAll(root, "base");
      mkdirSync(join(root, ".know-code"), { recursive: true });
      seedWorkflowArtifacts(root);

      const commands = evaluatePipeline(root).blockers
        .map((blocker) => blocker.command)
        .filter((command): command is string => !!command);
      for (const command of commands) {
        assert.doesNotMatch(command, /know-code status|&& write|^Agent:/);
      }
      assert.ok(commands.every((command) => command.startsWith("know-code ") || command === "git add -u"));
    } finally {
      cleanup();
    }
  });

  it("covers every emitted pipeline recovery command", () => {
    const seen = new Set<string>();
    const check = (setup: (root: string) => void, step: string, command: string) => {
      const { root, cleanup } = withTempRepo("kc-hint-command-");
      try {
        writeFile(root, "a.txt", "base\n");
        commitAll(root, "base");
        mkdirSync(join(root, ".know-code"), { recursive: true });
        setup(root);
        assert.equal(blockerCommand(root, step), command);
        seen.add(command);
      } finally {
        cleanup();
      }
    };

    check((root) => writeConfig(root, liteConfig({ requireAttest: true })), "attest", "know-code attest-init");
    check((root) => writeConfig(root, liteConfig({ rangeMode: "range" })), "range", "know-code range begin");
    check((root) => writeConfig(root, liteConfig()), "taught", "know-code taught");
    check((root) => writeConfig(root, liteConfig()), "quiz", "know-code quiz init");
    check((root) => writeConfig(root, liteConfig()), "answers", "know-code ask");
    check((root) => writeConfig(root, liteConfig({ requireGradeProposal: true })), "grade-proposal", "know-code grade propose --write");
    check((root) => writeConfig(root, liteConfig()), "grade", "know-code grade --review");
    check((root) => writeConfig(root, liteConfig()), "pass", "know-code pass");

    check((root) => {
      writeConfig(root, liteConfig());
      writeFile(root, ".know-code/taught.json", "{");
    }, "corrupt", "know-code reset");

    check((root) => {
      setupOpenGate(root, { requireTrailer: false });
      writeFile(root, "a.txt", "dirty\n");
    }, "pass", "git add -u");

    assert.deepEqual([...seen].sort(), [
      "git add -u",
      "know-code ask",
      "know-code attest-init",
      "know-code grade --review",
      "know-code grade propose --write",
      "know-code pass",
      "know-code quiz init",
      "know-code range begin",
      "know-code reset",
      "know-code taught",
    ]);
  });
});
