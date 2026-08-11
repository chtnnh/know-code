/** Git env/config knobs that can disable hooks without argv tokens. */
export const GIT_CONFIG_ENV_RE =
  /^GIT_CONFIG_(?:GLOBAL|SYSTEM|COUNT|KEY_\d+|VALUE_\d+)$/;

/** True when the process env carries git config overrides. */
export function gitConfigEnvOverridesSet(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Object.keys(env).some((k) => GIT_CONFIG_ENV_RE.test(k));
}

/** Config assignment that can redirect or disable hooks. */
export function configValueBypassesHooks(value: string): boolean {
  return (
    /\bcore\.hooksPath\b/i.test(value) || /\binclude\.path\b/i.test(value)
  );
}

/** Strip git config env overrides before spawning git from know-code commit/amend. */
export function sanitizedGitProcessEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of Object.keys(out)) {
    if (GIT_CONFIG_ENV_RE.test(k)) delete out[k];
  }
  return out;
}
