#!/usr/bin/env node
/**
 * Require CI status checks on main via GitHub branch protection / rulesets.
 *
 * Prerequisites:
 *   - gh auth login (repo admin)
 *   - Checks must have run at least once so GitHub knows their names
 *
 * Usage:
 *   node scripts/setup-branch-protection.mjs [owner/repo] [branch]
 *
 * Default: chtnnh/know-code main
 * Required checks: ci, know-code
 */
import { execFileSync } from "node:child_process";

const repo = process.argv[2] || "chtnnh/know-code";
const branch = process.argv[3] || "main";
const contexts = ["ci", "know-code"];

const [owner, name] = repo.split("/");
if (!owner || !name) {
  console.error("Usage: node scripts/setup-branch-protection.mjs owner/repo [branch]");
  process.exit(1);
}

const body = {
  required_status_checks: {
    strict: true,
    contexts,
  },
  enforce_admins: false,
  required_pull_request_reviews: null,
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
};

console.log(`Setting branch protection on ${repo} @ ${branch}`);
console.log(`Required checks: ${contexts.join(", ")}`);
console.log("This does not force-enable PR reviews; adjust in GitHub UI if needed.");

try {
  execFileSync(
    "gh",
    [
      "api",
      "-X",
      "PUT",
      `repos/${owner}/${name}/branches/${branch}/protection`,
      "--input",
      "-",
    ],
    {
      input: JSON.stringify(body),
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  console.log("Done. Confirm under Settings → Branches / Rules.");
} catch (err) {
  console.error("");
  console.error("Failed. Common causes:");
  console.error("  - Missing admin permission on the repo");
  console.error("  - Check names not yet known (run ci + know-code once)");
  console.error("  - Org rulesets may override classic branch protection");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
