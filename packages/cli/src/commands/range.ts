import { readConfig } from "../config.js";
import {
  headTrailerSatisfiesCheck,
  isGateOpenForShipping,
  resolveEffectiveQuizState,
} from "../enforcement.js";
import { git } from "../git.js";
import { readGateSafe } from "../gate.js";
import { findGitRoot } from "../paths.js";
import {
  beginRangeSession,
  clearRangeSeal,
  clearRangeSession,
  rangeCommitOids,
  readRangeSession,
  readRangeSeal,
  writeRangeSeal,
} from "../range.js";
import { bindGateSealedHead, clearGateSealedHeadBinding } from "../range-seal-bind.js";
import { assertNotAgentHook, sealPayload } from "../seal.js";
import { applyTrailerToRange } from "../trailers.js";
import type { RangeSealReceipt, RangeSealMode } from "../types.js";

export function cmdRangeBegin(opts: { from?: string }): void {
  const repoRoot = findGitRoot();
  try {
    const session = beginRangeSession(repoRoot, opts.from);
    console.log(`know-code: range began at ${session.fromOid.slice(0, 12)}…`);
    console.log(`know-code: quiz once for commits ${session.fromOid.slice(0, 8)}..HEAD`);
    console.log("know-code: next: taught → questions → ask → grade propose → grade --review → pass → range seal");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

export function cmdRangeStatus(json = false): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const session = readRangeSession(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, config);
  const { ctx, effectiveHash, commitDrift } = state;
  const gate = readGateSafe(repoRoot);
  const seal = readRangeSeal(repoRoot);
  const gateOpen = isGateOpenForShipping(
    repoRoot,
    gate,
    state,
    config.level,
  );

  const payload = {
    active: !!session,
    session,
    quizHash: ctx.diffHash,
    effectiveHash: commitDrift ? effectiveHash : undefined,
    commitDrift,
    scope: ctx.scope,
    commitCount: ctx.commitCount,
    gateOpen,
    rangeSeal: seal,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log("know-code range status");
  console.log(`  active:    ${session ? "yes" : "no"}`);
  if (session) {
    const n = rangeCommitOids(repoRoot, session.fromOid).length;
    console.log(`  from:      ${session.fromOid.slice(0, 12)}… (${n} commits)`);
  }
  console.log(`  hash:      ${ctx.diffHash}`);
  if (commitDrift) {
    console.log(
      `  gate hash: ${effectiveHash} (tree unchanged since pass)`,
    );
  }
  console.log(`  gate:      ${gateOpen ? "open" : "closed"}`);
  console.log(`  sealed:    ${seal ? seal.sealMode : "no"}`);
}

export function cmdRangeAbort(opts: { keepSeal?: boolean } = {}): void {
  const repoRoot = findGitRoot();
  clearRangeSession(repoRoot);
  if (!opts.keepSeal) {
    clearRangeSeal(repoRoot);
    clearGateSealedHeadBinding(repoRoot);
    console.log("know-code: range session and seal cleared.");
  } else {
    console.log("know-code: range session cleared (seal kept).");
  }
}

export function cmdRangeContinue(opts: { yes?: boolean } = {}): void {
  const repoRoot = findGitRoot();
  if (!opts.yes && process.stdin.isTTY) {
    process.stderr.write(
      "Start a new range for upcoming commits? Run with --yes to confirm.\n",
    );
    process.exit(1);
  }
  cmdRangeBegin({});
}

export async function cmdRangeSeal(opts: {
  rewrite?: boolean;
  passphrase?: string;
}): Promise<void> {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const session = readRangeSession(repoRoot);
  const state = resolveEffectiveQuizState(repoRoot, config);
  const { ctx, effectiveHash, commitDrift } = state;
  const gate = readGateSafe(repoRoot);

  if (!session && ctx.scope !== "range") {
    console.error(
      "know-code: no active range. Run `know-code range begin` first (or set rangeMode: range).",
    );
    process.exit(1);
  }

  const fromOid = session?.fromOid ?? ctx.rangeFromOid;
  if (!fromOid) {
    console.error("know-code: cannot determine range start.");
    process.exit(1);
  }

  if (!gate) {
    console.error(
      "know-code: range seal blocked — missing or corrupt .know-code/gate.json.",
    );
    console.error("know-code: next: know-code pass");
    process.exit(1);
  }

  if (!isGateOpenForShipping(repoRoot, gate, state, config.level)) {
    console.error(
      "know-code: range seal requires a signed gate for the current range hash.",
    );
    console.error("know-code: flow: taught → ask → grade → pass → range seal");
    process.exit(1);
  }

  if (commitDrift) {
    console.error(
      `know-code: sealing with tip hash ${ctx.diffHash.slice(0, 12)}… (pass was on ${effectiveHash.slice(0, 12)}…)`,
    );
  }

  const staged = git(["diff", "--cached", "--name-only"], repoRoot, {
    allowFail: true,
  }).trim();
  if (staged) {
    console.error(
      "know-code: range seal blocked — staged changes are not committed yet.",
    );
    console.error("know-code: next: know-code commit -m \"…\"  (then range seal)");
    process.exit(1);
  }

  const sealMode: RangeSealMode =
    opts.rewrite || config.rangeSeal === "rewrite" ? "rewrite" : "receipt";

  if (sealMode === "rewrite") {
    assertNotAgentHook("range seal --rewrite");
    console.error(
      "know-code: WARNING — rewrite mode changes commit SHAs. You will need git push --force-with-lease.",
    );
    try {
      const { rewritten } = applyTrailerToRange(
        repoRoot,
        fromOid,
        ctx.diffHash,
      );
      console.log(
        `know-code: rewrote ${rewritten} commit message(s) with Know-Code-Verified: ${ctx.diffHash.slice(0, 12)}…`,
      );
      console.log("know-code: push with: git push --force-with-lease");
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else if (!headTrailerSatisfiesCheck(repoRoot, state)) {
    console.error(
      "know-code: receipt mode — HEAD must carry Know-Code-Verified before seal.",
    );
    console.error(`  Know-Code-Verified: ${ctx.diffHash}`);
    if (commitDrift) {
      console.error(
        `  (or pass hash while tree unchanged: ${effectiveHash})`,
      );
    }
    console.error(
      'know-code: tip: know-code commit -m "…" on a new commit, or amend HEAD',
    );
    process.exit(1);
  }

  // Bind after rewrite so sealedHeadOid matches the tip that will be pushed.
  const sealedHeadOid = git(["rev-parse", "HEAD"], repoRoot);
  const unsigned: Omit<RangeSealReceipt, "keyId" | "sig"> = {
    version: 1,
    diffHash: ctx.diffHash,
    rangeFromOid: fromOid,
    commitCount: ctx.commitCount,
    sealMode,
    gateKeyId: gate!.keyId || "unsigned",
    sealedAt: new Date().toISOString(),
    sealedHeadOid,
    ...(commitDrift ? { gatePassHash: effectiveHash } : {}),
  };

  try {
    const sealed = (await sealPayload(
      repoRoot,
      unsigned as unknown as Record<string, unknown>,
      { passphrase: opts.passphrase },
    )) as unknown as RangeSealReceipt;
    writeRangeSeal(repoRoot, sealed);
    await bindGateSealedHead(repoRoot, sealedHeadOid, {
      passphrase: opts.passphrase,
      diffHash: ctx.diffHash,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  clearRangeSession(repoRoot);
  console.log(`know-code: range sealed (${sealMode})`);
  console.log("");
  console.log(
    "know-code: start a new range for upcoming commits: know-code range continue --yes",
  );
}

export { rangeHasTipTrailers } from "../trailers.js";
