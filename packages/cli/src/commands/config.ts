import { readConfig, setConfigValue, writeConfig } from "../config.js";
import { resolveQuizContext } from "../hash.js";
import {
  findGitRoot,
  homeConfigPath,
  homeKnowCodeDir,
} from "../paths.js";
import { readRangeSession } from "../range.js";
import { readAttestMeta, attestDir } from "../seal.js";

export function cmdConfig(json = false): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const session = readRangeSession(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  const meta = readAttestMeta(repoRoot);

  const payload = {
    homeDir: homeKnowCodeDir(),
    homeConfig: homeConfigPath(),
    repoConfig: `${repoRoot}/.know-code/config.json`,
    effective: config,
    quiz: {
      scope: ctx.scope,
      diffHash: ctx.diffHash,
      commitRange: ctx.commitRange,
      commitCount: ctx.commitCount,
      rangeFromOid: ctx.rangeFromOid,
    },
    rangeSession: session,
    attest: {
      ready: !!meta,
      keyId: meta?.keyId || null,
      home: meta ? attestDir(repoRoot) : null,
    },
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log("know-code config (effective)");
  console.log(`  level:         ${config.level}`);
  console.log(`  baseBranch:    ${config.baseBranch}`);
  console.log(`  rangeMode:     ${config.rangeMode}`);
  console.log(`  rangeSeal:     ${config.rangeSeal}`);
  console.log(`  requireAttest: ${config.requireAttest}`);
  console.log(`  requireTrailer:${config.requireTrailer}`);
  console.log(`  requireGradeProposal: ${config.requireGradeProposal ?? true}`);
  console.log(`  allowSelfScore: ${config.allowSelfScore ?? false}`);
  console.log(`  quiz scope:    ${ctx.scope}`);
  console.log(`  quiz hash:     ${ctx.diffHash.slice(0, 16)}…`);
  console.log(`  attest ready:  ${payload.attest.ready}`);
  if (session) {
    console.log(`  range active:  from ${session.fromOid.slice(0, 12)}…`);
  }
  console.log(`  home config:   ${homeConfigPath()}`);
}

export function cmdConfigSet(key: string, value: string): void {
  const repoRoot = findGitRoot();
  setConfigValue(repoRoot, key, value);
  console.log(`know-code: config set ${key}=${value}`);
}
