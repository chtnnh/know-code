import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readConfig } from "./config.js";
import { assertSigned } from "./seal.js";
import { gatePath, knowCodeDir } from "./paths.js";
import type { GateReceipt, Level } from "./types.js";

export function readGate(repoRoot: string): GateReceipt | null {
  const path = gatePath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as GateReceipt;
    if (data.version !== 1 || !data.diffHash || !data.level) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeGate(repoRoot: string, receipt: GateReceipt): void {
  mkdirSync(knowCodeDir(repoRoot), { recursive: true });
  writeFileSync(gatePath(repoRoot), `${JSON.stringify(receipt, null, 2)}\n`);
}

export function isGateValid(
  receipt: GateReceipt | null,
  diffHash: string,
  requiredLevel: Level,
): boolean {
  if (!receipt) return false;
  if (receipt.diffHash !== diffHash) return false;
  const order: Record<Level, number> = { lite: 1, standard: 2, deep: 3 };
  return order[receipt.level] >= order[requiredLevel];
}

/** Hash/level match plus valid human Ed25519 seal. */
export function isSignedGateOpen(
  repoRoot: string,
  receipt: GateReceipt | null,
  diffHash: string,
  requiredLevel: Level,
): boolean {
  if (!isGateValid(receipt, diffHash, requiredLevel) || !receipt) return false;
  const config = readConfig(repoRoot);
  if (!config.requireAttest) return true;
  try {
    assertSigned(
      repoRoot,
      "gate.json",
      receipt as unknown as Record<string, unknown> & {
        sig?: string;
        keyId?: string;
      },
    );
    return true;
  } catch {
    return false;
  }
}
