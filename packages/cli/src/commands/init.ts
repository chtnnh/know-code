import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readConfig, writeConfig } from "../config.js";
import {
  installAgentHooks,
  installGitPreCommit,
  installGitPrePush,
  type AgentId,
} from "../hooks.js";
import { findGitRoot, knowCodeDir } from "../paths.js";
import { DEFAULT_CONFIG, isLevel, type Config } from "../types.js";

const DOCS = "https://kc.chtnnhfoundation.org";
const ACTION_REF = "chtnnh/know-code/action@v0.1.2";

export function consumerWorkflowYaml(baseBranch: string): string {
  return `name: know-code

on:
  pull_request:
  push:
    branches: [${baseBranch}]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: ${ACTION_REF}
        with:
          base-branch: ${baseBranch}
`;
}

export function cmdInit(opts: {
  level?: string;
  baseBranch?: string;
  agents?: string;
  requireTrailer?: boolean;
  workflow?: boolean;
}): void {
  const repoRoot = findGitRoot();

  let config: Config = { ...DEFAULT_CONFIG };
  try {
    if (existsSync(join(knowCodeDir(repoRoot), "config.json"))) {
      config = readConfig(repoRoot);
    }
  } catch {
    // use defaults
  }

  if (opts.level) {
    if (!isLevel(opts.level)) {
      console.error(`Invalid level: ${opts.level}`);
      process.exit(1);
    }
    config.level = opts.level;
  }
  if (opts.baseBranch) config.baseBranch = opts.baseBranch;
  if (opts.requireTrailer !== undefined) {
    config.requireTrailer = opts.requireTrailer;
  }

  writeConfig(repoRoot, config);
  ensureGitignore(repoRoot);

  for (const install of [installGitPreCommit, installGitPrePush]) {
    const hook = install(repoRoot);
    const label = hook.path.endsWith("pre-commit") ? "pre-commit" : "pre-push";
    console.log(
      hook.created
        ? `Installed git ${label} hook → ${hook.path}`
        : `Updated git ${label} hook → ${hook.path}`,
    );
    if (hook.backedUp) {
      console.log(`Backed up previous hook → ${hook.backedUp}`);
    }
  }

  if (opts.agents) {
    const agents = opts.agents
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean) as AgentId[];
    const valid: AgentId[] = ["claude", "cursor", "codex"];
    for (const a of agents) {
      if (!valid.includes(a)) {
        console.error(`Unknown agent "${a}". Use: claude,cursor,codex`);
        process.exit(1);
      }
    }
    const messages = installAgentHooks(repoRoot, agents);
    for (const m of messages) console.log(m);
  } else {
    console.log("");
    console.log("Agent hooks (optional):");
    console.log("  know-code init --agents claude,cursor,codex");
  }

  if (opts.workflow) {
    const path = join(repoRoot, ".github", "workflows", "know-code.yml");
    if (existsSync(path)) {
      console.log(`Workflow already exists → ${path} (left unchanged)`);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, consumerWorkflowYaml(config.baseBranch));
      console.log(`Wrote CI workflow → ${path}`);
    }
  } else {
    console.log("");
    console.log("CI workflow (optional):");
    console.log("  know-code init --workflow");
    console.log(`  Docs: ${DOCS}/ci`);
  }

  console.log("");
  console.log(`Config written → .know-code/config.json (level: ${config.level})`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. npm i -g @chtnnh/know-code   # or: npm i -g github:chtnnh/know-code#main:packages/cli");
  console.log("  2. npx skills add chtnnh/know-code");
  console.log("  3. teach → implement → know-code ask (browser quiz) → know-code pass");
  console.log('  4. know-code commit -m "…"   # adds Know-Code-Verified trailer');
  console.log(`Docs: ${DOCS}`);
}

function ensureGitignore(repoRoot: string): void {
  const gi = join(repoRoot, ".gitignore");
  const block = [
    "# Local gate state — keep shared config committed",
    ".know-code/*",
    "!.know-code/config.json",
  ].join("\n");

  if (!existsSync(gi)) {
    writeFileSync(gi, `${block}\n`);
    return;
  }
  const content = readFileSync(gi, "utf8");
  if (content.includes(".know-code/gate.json") || content.includes("!.know-code/config.json")) {
    return;
  }
  if (!content.includes(".know-code")) {
    writeFileSync(
      gi,
      content.endsWith("\n") ? `${content}${block}\n` : `${content}\n${block}\n`,
    );
  }
}
