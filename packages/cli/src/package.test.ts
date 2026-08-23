import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface PackResult {
  files: Array<{ path: string }>;
}

describe("published package contents", () => {
  it("contains runtime files but not tests, test helpers, or documentation builds", () => {
    const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const output = execFileSync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      { cwd: packageRoot, encoding: "utf8" },
    );
    const [{ files }] = JSON.parse(output) as PackResult[];
    const paths = files.map(({ path }) => path);

    assert.ok(paths.includes("dist/index.js"));
    assert.ok(paths.includes("bin/know-code.js"));
    assert.ok(paths.includes("hooks/check-shell.sh"));
    assert.ok(paths.every((path) => !/\.test\./.test(path)));
    assert.ok(paths.every((path) => !path.endsWith(".map")));
    assert.ok(paths.every((path) => !path.startsWith("website/")));
    assert.ok(paths.every((path) => !path.includes("test-helpers")));
  });
});
