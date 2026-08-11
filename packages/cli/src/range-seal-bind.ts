import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readConfig } from "./config.js";
import { readGateSafe, writeGate } from "./gate.js";
import { git } from "./git.js";
import { knowCodeDir, sealedHeadBindingPath } from "./paths.js";
import { clearRangeSeal, readRangeSeal } from "./range.js";
import { assertSigned, sealPayload } from "./seal.js";
import type { GateReceipt, SealedHeadBindingReceipt } from "./types.js";

function readSealedHeadBindingFile(
  repoRoot: string,
): SealedHeadBindingReceipt | null {
  const path = sealedHeadBindingPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(
      readFileSync(path, "utf8"),
    ) as SealedHeadBindingReceipt;
    if (data.version !== 1 || !data.sealedHeadOid) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSealedHeadBindingFile(
  repoRoot: string,
  receipt: SealedHeadBindingReceipt,
): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(
    sealedHeadBindingPath(repoRoot),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}

function clearSealedHeadBindingFile(repoRoot: string): void {
  const path = sealedHeadBindingPath(repoRoot);
  if (existsSync(path)) unlinkSync(path);
}

function trustedSealedOid(
  repoRoot: string,
  fileLabel: string,
  payload: { sealedHeadOid?: string; sig?: string; keyId?: string } | null,
): string | null {
  if (!payload?.sealedHeadOid) return null;
  const config = readConfig(repoRoot);
  if (!config.requireAttest) return payload.sealedHeadOid;
  try {
    assertSigned(
      repoRoot,
      fileLabel,
      payload as Record<string, unknown> & { sig?: string; keyId?: string },
    );
    return payload.sealedHeadOid;
  } catch {
    return null;
  }
}

/** Bound tip from range-seal, sealed-head-binding, or gate (redundant sources). */
export function sealedHeadBinding(repoRoot: string): string | null {
  const config = readConfig(repoRoot);
  // Prefer signed range-seal; then gate. Standalone binding file only when attest
  // is on (unsigned agent-minted binding must not bind HEAD when attest is off).
  return (
    trustedSealedOid(repoRoot, "range-seal.json", readRangeSeal(repoRoot)) ??
    (config.requireAttest
      ? trustedSealedOid(
          repoRoot,
          "sealed-head-binding.json",
          readSealedHeadBindingFile(repoRoot),
        )
      : null) ??
    trustedSealedOid(repoRoot, "gate.json", readGateSafe(repoRoot))
  );
}

/** When a sealed HEAD is bound, shipping only at that commit. */
export function headMatchesRangeSeal(repoRoot: string): boolean {
  const bound = sealedHeadBinding(repoRoot);
  if (!bound) return true;
  const head = git(["rev-parse", "HEAD"], repoRoot, { allowFail: true });
  return head === bound;
}

export async function bindGateSealedHead(
  repoRoot: string,
  sealedHeadOid: string,
  opts: { passphrase?: string; diffHash?: string } = {},
): Promise<void> {
  const gate = readGateSafe(repoRoot);
  if (!gate) return;
  const config = readConfig(repoRoot);
  const { keyId: _keyId, sig: _sig, ...rest } = gate;
  const updated: Omit<GateReceipt, "keyId" | "sig"> = {
    ...rest,
    sealedHeadOid,
    headRef: sealedHeadOid,
  };
  if (config.requireAttest) {
    const sealed = (await sealPayload(
      repoRoot,
      updated as unknown as Record<string, unknown>,
      opts,
    )) as unknown as GateReceipt;
    writeGate(repoRoot, sealed);
  } else {
    writeGate(repoRoot, updated as GateReceipt);
  }

  const bindingUnsigned: Omit<SealedHeadBindingReceipt, "keyId" | "sig"> = {
    version: 1,
    sealedHeadOid,
    boundAt: new Date().toISOString(),
    ...(opts.diffHash ? { diffHash: opts.diffHash } : {}),
  };
  if (config.requireAttest) {
    const sealedBinding = (await sealPayload(
      repoRoot,
      bindingUnsigned as unknown as Record<string, unknown>,
      opts,
    )) as unknown as SealedHeadBindingReceipt;
    writeSealedHeadBindingFile(repoRoot, sealedBinding);
  } else {
    writeSealedHeadBindingFile(
      repoRoot,
      bindingUnsigned as SealedHeadBindingReceipt,
    );
  }
}

/**
 * Sealed tip already reachable from the remote base: the push the seal
 * authorized has happened, so the seal is consumed. Only remote refs count —
 * HEAD always descends from the sealed tip on the *local* branch, so a local
 * check would treat every unpushed seal as consumed.
 */
function sealConsumedByRemote(repoRoot: string, sealedOid: string): boolean {
  const base = `origin/${readConfig(repoRoot).baseBranch}`;
  const baseOid = git(["rev-parse", "--verify", "--quiet", base], repoRoot, {
    allowFail: true,
  });
  if (!baseOid) return false;
  // merge-base(sealed, base) === sealed  ⇔  sealed is an ancestor of base.
  const mb = git(["merge-base", sealedOid, base], repoRoot, {
    allowFail: true,
  });
  return mb !== "" && mb === sealedOid;
}

/**
 * Consume seal artifacts superseded by a fresh human pass. A new human-sealed
 * gate re-attests the current work, so a stale range-seal/binding can only
 * block legitimate shipping — it authorizes nothing the new gate does not.
 *
 * Superseded means: pinned to a commit other than HEAD, or pinned to a tip
 * that is already on the remote base (the seal's push happened; the next
 * batch starts with HEAD still at the sealed tip). Only a just-sealed,
 * not-yet-pushed tip at HEAD is kept — it must stay rewrite-open for its
 * pending push.
 *
 * SECURITY: callers must invoke this only after sealPayload succeeded (human
 * TTY passphrase). Agent-runnable commands (range begin, check, hooks) must
 * never call it — an agent unbinding a sealed HEAD is exactly the exploit the
 * binding exists to stop.
 */
export function clearSupersededSealArtifacts(repoRoot: string): string[] {
  const head = git(["rev-parse", "HEAD"], repoRoot, { allowFail: true });
  const superseded = (oid: string): boolean =>
    oid !== head || sealConsumedByRemote(repoRoot, oid);
  const cleared: string[] = [];
  const seal = readRangeSeal(repoRoot);
  if (seal?.sealedHeadOid && superseded(seal.sealedHeadOid)) {
    clearRangeSeal(repoRoot);
    cleared.push("range-seal.json");
  }
  const binding = readSealedHeadBindingFile(repoRoot);
  if (binding?.sealedHeadOid && superseded(binding.sealedHeadOid)) {
    clearSealedHeadBindingFile(repoRoot);
    cleared.push("sealed-head-binding.json");
  }
  return cleared;
}

/** Clears gate + binding file on abort (unsigned gates only; signed gates keep binding). */
export function clearGateSealedHeadBinding(repoRoot: string): void {
  const gate = readGateSafe(repoRoot);
  const config = readConfig(repoRoot);
  if (gate?.sealedHeadOid && !config.requireAttest) {
    const { sealedHeadOid: _removed, ...updated } = gate;
    writeGate(repoRoot, updated as GateReceipt);
  }
  if (!config.requireAttest) {
    clearSealedHeadBindingFile(repoRoot);
  }
}
