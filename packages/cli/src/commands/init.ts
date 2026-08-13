import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readConfig, writeConfig } from "../config.js";
import {
  installAgentHooks,
  installGitHooks,
  type AgentId,
} from "../hooks.js";
import { findGitRoot, knowCodeDir } from "../paths.js";
import { DEFAULT_CONFIG, isLevel, isRangeMode, isRangeSealMode, type Config } from "../types.js";

const DOCS = "https://kc.chtnnhfoundation.org";
const ACTION_REF = "chtnnh/know-code/action@v0.3.0";

export function consumerWorkflowYaml(baseBranch: string): string {
  // PR-only: on a push to the base branch there is no merge-base ahead of
  // HEAD, so grounded verification has no range to recompute.
  return `name: know-code

on:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: \${{ github.event.pull_request.head.sha }}

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
  rangeMode?: string;
  rangeSeal?: string;
  requireAttest?: boolean;
  requireGradeProposal?: boolean;
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
  if (opts.workflow) {
    config.requireTrailer = true;
  }
  if (opts.rangeMode) {
    if (!isRangeMode(opts.rangeMode)) {
      console.error(`Invalid rangeMode: ${opts.rangeMode}`);
      process.exit(1);
    }
    config.rangeMode = opts.rangeMode;
  }
  if (opts.rangeSeal) {
    if (!isRangeSealMode(opts.rangeSeal)) {
      console.error(`Invalid rangeSeal: ${opts.rangeSeal}`);
      process.exit(1);
    }
    config.rangeSeal = opts.rangeSeal;
  }
  if (opts.requireAttest !== undefined) {
    config.requireAttest = opts.requireAttest;
  }
  if (opts.requireGradeProposal !== undefined) {
    config.requireGradeProposal = opts.requireGradeProposal;
  }

  writeConfig(repoRoot, config);
  ensureGitignore(repoRoot);

  const { preCommit, prePush } = installGitHooks(repoRoot);
  for (const hook of [preCommit, prePush]) {
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
  console.log(`Config written → .know-code/config.json (local, gitignored; level: ${config.level})`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. npm i -g @chtnnh/know-code");
  console.log("  2. Skills (pick one):");
  console.log("       know-code skills              # this repo only");
  console.log("       know-code skills --global     # all repos (Cursor/Claude/Codex/…)");
  console.log("  3. know-code attest-init && know-code range begin");
  console.log("  4. taught → questions → ask → grade propose → grade --review → pass → range seal");
  console.log(`Docs: ${DOCS}`);
}

function ensureGitignore(repoRoot: string): void {
  const gi = join(repoRoot, ".gitignore");
  const block = [
    "# Local know-code state (per developer — not committed)",
    ".know-code/",
  ].join("\n");

  if (!existsSync(gi)) {
    writeFileSync(gi, `${block}\n`);
    return;
  }
  let content = readFileSync(gi, "utf8");
  content = content
    .replace(/# Local gate state[^\n]*\n\.know-code\/\*\n!\.know-code\/config\.json\n?/g, "")
    .replace(/# Local know-code state[^\n]*\n\.know-code\/\*\n!\.know-code\/config\.json\n?/g, "");
  if (content.includes("!.know-code/config.json")) {
    content = content.replace(/\n?!\.know-code\/config\.json\n?/g, "\n");
  }
  if (content.includes(".know-code/") && !content.includes("!.know-code/config.json")) {
    return;
  }
  if (!content.includes(".know-code")) {
    writeFileSync(
      gi,
      content.endsWith("\n") ? `${content}${block}\n` : `${content}\n${block}\n`,
    );
  } else if (content.includes(".know-code/*") && !content.includes(".know-code/")) {
    writeFileSync(
      gi,
      content.replace(
        /# Local[^\n]*\n\.know-code\/\*\n?/,
        `${block}\n`,
      ),
    );
  }
}
