import { spawnSync } from "node:child_process";

const SKILLS_SOURCE = "chtnnh/know-code";

/**
 * Install know-code + know-code-teach via the agentskills `skills` CLI.
 * --global puts skills in user harness dirs (e.g. ~/.cursor/skills) so they
 * apply across all repositories.
 */
export function cmdSkills(opts: {
  global?: boolean;
  agents?: string;
  yes?: boolean;
}): void {
  const args = ["skills", "add", SKILLS_SOURCE];
  if (opts.global) args.push("--global");
  if (opts.yes) args.push("--yes");
  if (opts.agents) {
    for (const a of opts.agents.split(",").map((s) => s.trim()).filter(Boolean)) {
      args.push("--agent", a);
    }
  }

  console.log(`know-code: running npx ${args.join(" ")}`);
  if (opts.global) {
    console.log(
      "know-code: global install → user skill dirs (available in every repo for selected harnesses)",
    );
  } else {
    console.log("know-code: project install → .agents/skills (or agent-specific project dirs)");
  }

  const result = spawnSync("npx", ["--yes", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw new Error(
      `Failed to run npx skills: ${result.error.message}\n` +
        `Install Node/npm, then: npx skills add ${SKILLS_SOURCE}${opts.global ? " --global" : ""}`,
    );
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log("");
  console.log("know-code: skills installed.");
  if (opts.global) {
    console.log("  Tip: restart or reload the agent window if skills don’t appear yet.");
    console.log("  List: npx skills ls -g");
  }
}
