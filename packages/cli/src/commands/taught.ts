import { writeTaught, type TaughtReceipt } from "../attest.js";
import { readConfig } from "../config.js";
import { resolveQuizContext } from "../hash.js";
import { findGitRoot } from "../paths.js";
import { sealPayload } from "../seal.js";

/**
 * Record that know-code-teach ran (or the human skipped) for the current index hash.
 * Requires human attest passphrase — agents cannot forge a valid seal.
 */
export async function cmdTaught(opts: {
  skip?: boolean;
  hash?: string;
  passphrase?: string;
}): Promise<void> {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);

  if (opts.hash && opts.hash !== ctx.diffHash) {
    console.error(
      `know-code: provided hash does not match current diff.\n` +
        `  provided: ${opts.hash}\n` +
        `  current:  ${ctx.diffHash}`,
    );
    process.exit(1);
  }

  if (opts.skip) {
    console.error(
      "know-code: recording teach SKIP — only use when the human explicitly skipped teaching.",
    );
  }

  const unsigned: Omit<TaughtReceipt, "keyId" | "sig"> = {
    version: 1,
    diffHash: ctx.diffHash,
    taughtAt: new Date().toISOString(),
    skipped: opts.skip === true,
  };

  try {
    const sealed = (await sealPayload(
      repoRoot,
      unsigned as unknown as Record<string, unknown>,
      { passphrase: opts.passphrase },
    )) as unknown as TaughtReceipt;
    writeTaught(repoRoot, sealed);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(
    `know-code: taught sealed (${opts.skip ? "skipped" : "taught"}) for ${ctx.diffHash.slice(0, 12)}…`,
  );
}
