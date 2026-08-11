import { existsSync, realpathSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readConfig } from "../config.js";
import { readAttestMeta } from "../seal.js";
import { evaluatePipeline } from "../pipeline.js";
import { findGitRoot, knowCodeDir, gitHooksDir } from "../paths.js";
import { readRangeSession } from "../range.js";
import {
  bundledHooksDir,
  gitHooksNeedUpgrade,
  gitGateHookIsCurrent,
} from "../hooks.js";
import { readGateSafe } from "../gate.js";

/** True when this process is the monorepo packages/cli build (not a stale global). */
function isRunningLocalMonorepoCli(repoRoot: string): boolean {
  const localDist = join(repoRoot, "packages/cli/dist/index.js");
  if (!existsSync(localDist)) return true; // not a monorepo checkout
  try {
    const running = realpathSync(fileURLToPath(import.meta.url));
    const expected = realpathSync(localDist);
    // doctor.js lives next to index.js under dist/commands/
    const runningRoot = dirname(dirname(running));
    return (
      running === expected ||
      running.startsWith(join(dirname(expected), "")) ||
      runningRoot === dirname(expected)
    );
  } catch {
    return false;
  }
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
}

export interface RunDoctorOptions {
  /** Exit non-zero when git hooks missing/outdated or agent hooks absent. */
  strict?: boolean;
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

function agentHooksConfigured(repoRoot: string): boolean {
  const cursor = join(repoRoot, ".cursor", "hooks.json");
  const claude = join(repoRoot, ".claude", "settings.json");
  const codex = join(repoRoot, ".codex", "hooks.json");
  for (const path of [cursor, claude, codex]) {
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, "utf8");
      if (text.includes("know-code") || text.includes("check-shell")) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export async function runDoctor(
  repoRoot: string,
  opts: RunDoctorOptions = {},
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const config = readConfig(repoRoot);
  const strict = opts.strict === true;

  checks.push({
    name: "git-repo",
    ok: true,
    message: `Repository root: ${repoRoot}`,
  });

  const localCli = isRunningLocalMonorepoCli(repoRoot);
  const hasLocalDist = existsSync(join(repoRoot, "packages/cli/dist/index.js"));
  if (hasLocalDist) {
    checks.push({
      name: "local-cli",
      ok: localCli,
      message: localCli
        ? "Running monorepo packages/cli/dist (local build)"
        : "PATH know-code is not this repo's packages/cli/dist — stale global will ignore local fixes",
      fix: localCli
        ? undefined
        : "npm run build && npm link -w @chtnnh/know-code   # or: npm run know-code -- …",
    });
  }

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

  if (!config.requireAttest) {
    checks.push({
      name: "weak-attest",
      ok: !strict,
      message:
        "requireAttest: false — gate.json is forgeable by agents (weak threat model)",
      fix: 'Set "requireAttest": true in config for production',
    });
  }

  const gate = readGateSafe(repoRoot);
  if (gate && !gate.gatedTreeOid) {
    checks.push({
      name: "legacy-gate",
      ok: false,
      message:
        "gate.json missing gatedTreeOid (legacy) — cannot open for shipping",
      fix: "know-code pass  # re-seal after upgrade to ≥0.3.0",
    });
  }

  const preCommit = join(gitHooksDir(repoRoot), "pre-commit");
  const prePush = join(gitHooksDir(repoRoot), "pre-push");
  const hooksPresent =
    existsSync(preCommit) &&
    existsSync(prePush) &&
    readFileContains(preCommit, "know-code") &&
    readFileContains(prePush, "know-code");
  const hooksCurrent = hooksPresent && !gitHooksNeedUpgrade(repoRoot);
  checks.push({
    name: "git-hooks",
    ok: hooksCurrent,
    message: hooksCurrent
      ? "Git hooks installed and current"
      : hooksPresent
        ? "Git hooks outdated (misleading deny messages on gate failure)"
        : "Git hooks missing",
    fix: hooksCurrent ? undefined : "know-code hooks install",
  });

  const bundled = join(bundledHooksDir(), "check-shell.sh");
  if (existsSync(bundled) && existsSync(preCommit)) {
    const preContent = readFileSync(preCommit, "utf8");
    checks.push({
      name: "hook-script-freshness",
      ok: gitGateHookIsCurrent(preContent),
      message: gitGateHookIsCurrent(preContent)
        ? "pre-commit hook matches bundled gate script"
        : "pre-commit hook does not match bundled gate script",
      fix: "know-code hooks install",
    });
  }

  const agentsOk = agentHooksConfigured(repoRoot);
  checks.push({
    name: "agent-hooks",
    ok: strict ? agentsOk : true,
    message: agentsOk
      ? "Agent hooks configured (cursor/claude/codex)"
      : "Agent hooks not configured (agents can bypass shell gating)",
    fix: agentsOk
      ? undefined
      : "know-code init --agents cursor,claude,codex",
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

export async function cmdDoctor(
  json = false,
  opts: RunDoctorOptions = {},
): Promise<void> {
  const repoRoot = findGitRoot();
  const checks = await runDoctor(repoRoot, opts);
  const blockers = checks.filter((c) => !c.ok);

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: blockers.length === 0,
          strict: opts.strict === true,
          checks,
          blockers,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      opts.strict ? "know-code doctor --strict" : "know-code doctor",
    );
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
