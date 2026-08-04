import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { readConfig } from "../config.js";
import { readAttestMeta } from "../seal.js";
import { resolveQuizContext } from "../hash.js";
import { evaluatePipeline } from "../pipeline.js";
import { findGitRoot, knowCodeDir, gitHooksDir } from "../paths.js";
import { join } from "node:path";
import { readRangeSession } from "../range.js";
import { gitHooksNeedUpgrade } from "../hooks.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function runDoctor(repoRoot: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const config = readConfig(repoRoot);

  checks.push({
    name: "git-repo",
    ok: true,
    message: `Repository root: ${repoRoot}`,
  });

  const kcDir = knowCodeDir(repoRoot);
  checks.push({
    name: "know-code-dir",
    ok: existsSync(kcDir),
    message: existsSync(kcDir)
      ? ".know-code/ present"
      : ".know-code/ missing",
    fix: existsSync(kcDir) ? undefined : "know-code init",
  });

  const meta = readAttestMeta(repoRoot);
  checks.push({
    name: "attest",
    ok: !config.requireAttest || !!meta,
    message: meta
      ? `Attest key ready (keyId=${meta.keyId})`
      : "Attest not initialized",
    fix: meta ? undefined : "know-code attest-init",
  });

  const preCommit = join(gitHooksDir(repoRoot), "pre-commit");
  const prePush = join(gitHooksDir(repoRoot), "pre-push");
  const hooksPresent =
    existsSync(preCommit) &&
    existsSync(prePush) &&
    readFileContains(preCommit, "know-code") &&
    readFileContains(prePush, "know-code");
  const hooksOk = hooksPresent && !gitHooksNeedUpgrade(repoRoot);
  checks.push({
    name: "git-hooks",
    ok: hooksOk,
    message: hooksOk
      ? "Git hooks installed"
      : hooksPresent
        ? "Git hooks outdated (misleading deny messages on gate failure)"
        : "Git hooks missing",
    fix: hooksOk ? undefined : "know-code hooks install",
  });

  const session = readRangeSession(repoRoot);
  checks.push({
    name: "range",
    ok: config.rangeMode !== "range" || !!session,
    message: session
      ? `Range active from ${session.fromOid.slice(0, 12)}…`
      : config.rangeMode === "range"
        ? "Range mode but no active session"
        : "No active range (ok for index mode)",
    fix:
      config.rangeMode === "range" && !session
        ? "know-code range begin"
        : undefined,
  });

  const portFree = await checkPort(
    Number(process.env.KNOW_CODE_QUIZ_PORT || "3847"),
  );
  checks.push({
    name: "quiz-port",
    ok: portFree,
    message: portFree
      ? "Quiz port 3847 available"
      : "Quiz port 3847 in use",
    fix: portFree ? undefined : "know-code ask --port <other>",
  });

  if (config.rangeSeal === "rewrite") {
    const { execFileSync } = await import("node:child_process");
    let filterOk = false;
    try {
      execFileSync("git", ["filter-branch", "-h"], {
        stdio: "ignore",
      });
      filterOk = true;
    } catch {
      filterOk = false;
    }
    checks.push({
      name: "filter-branch",
      ok: filterOk,
      message: filterOk
        ? "git filter-branch available"
        : "git filter-branch not found (needed for rewrite mode)",
    });
  }

  const pipeline = evaluatePipeline(repoRoot);
  checks.push({
    name: "pipeline",
    ok: pipeline.allowed,
    message: pipeline.allowed
      ? "Gate open — ready to commit/push"
      : `Blocked: ${pipeline.blockers[0]?.message ?? "unknown"}`,
    fix: pipeline.nextStep ?? undefined,
  });

  return checks;
}

function readFileContains(path: string, needle: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path, "utf8").includes(needle);
}

export async function cmdDoctor(json = false): Promise<void> {
  const repoRoot = findGitRoot();
  const checks = await runDoctor(repoRoot);
  const blockers = checks.filter((c) => !c.ok);

  if (json) {
    console.log(
      JSON.stringify(
        { ok: blockers.length === 0, checks, blockers },
        null,
        2,
      ),
    );
  } else {
    console.log("know-code doctor");
    for (const c of checks) {
      const mark = c.ok ? "✓" : "✗";
      console.log(`  ${mark} ${c.name}: ${c.message}`);
      if (!c.ok && c.fix) console.log(`      → ${c.fix}`);
    }
  }

  if (blockers.length) {
    process.exit(1);
  }
}
