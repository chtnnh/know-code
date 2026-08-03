/**
 * Minimum quiz question count from diff shape + level.
 * Agents MUST run `know-code questions` before writing quiz.json.
 */
import { readConfig } from "./config.js";
import { git, mergeBase, resolveBaseRef, revListCount } from "./git.js";
import { findGitRoot } from "./paths.js";
import { readRangeSession } from "./range.js";
import { isLevel, type Level } from "./types.js";

export const LEVEL_BASE: Record<Level, number> = {
  lite: 2,
  standard: 4,
  deep: 7,
};

export const LEVEL_CAP: Record<Level, number> = {
  lite: 3,
  standard: 6,
  deep: 10,
};

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  swift: "swift",
  scala: "scala",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  sql: "sql",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  toml: "toml",
  css: "css",
  scss: "css",
  html: "html",
  vue: "vue",
  svelte: "svelte",
};

const SENSITIVE_RE =
  /(^|\/)(auth|crypto|secret|passwd|password|oauth|saml|jwt|firewall|migrate|migration|schema|\.env)/i;

export interface QuotaSignals {
  level: Level;
  fromRef: string;
  toRef: string;
  commitCount: number;
  filesChanged: number;
  linesChanged: number;
  languages: string[];
  sensitivePaths: boolean;
}

export interface QuotaResult {
  /** Exact minimum questions the agent must write. */
  minQuestions: number;
  level: Level;
  base: number;
  cap: number;
  bonuses: Array<{ reason: string; delta: number }>;
  signals: QuotaSignals;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseNumstat(
  repoRoot: string,
  from: string,
  to: string,
): { files: number; lines: number; paths: string[] } {
  const raw = git(["diff", "--numstat", `${from}...${to}`], repoRoot, {
    allowFail: true,
  });
  let files = 0;
  let lines = 0;
  const paths: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const add = parts[0] === "-" ? 0 : Number(parts[0]) || 0;
    const del = parts[1] === "-" ? 0 : Number(parts[1]) || 0;
    files += 1;
    lines += add + del;
    paths.push(parts[2]);
  }
  return { files, lines, paths };
}

function languagesFromPaths(paths: string[]): string[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const base = p.split("/").pop() || p;
    const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
    const lang = EXT_LANG[ext];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

export function resolveQuotaFrom(
  repoRoot: string,
  configBaseBranch: string,
  explicitFrom?: string,
): string {
  if (explicitFrom) return explicitFrom;
  const session = readRangeSession(repoRoot);
  if (session) return session.fromOid;
  const baseRef = resolveBaseRef(repoRoot, configBaseBranch);
  const head = git(["rev-parse", "HEAD"], repoRoot, { allowFail: true });
  if (!head) return "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
  return mergeBase(repoRoot, baseRef, head);
}

export function collectQuotaSignals(
  repoRoot: string,
  level: Level,
  fromRef: string,
): QuotaSignals {
  const toRef = "HEAD";
  const commitCount = revListCount(repoRoot, fromRef, toRef);
  const { files, lines, paths } = parseNumstat(repoRoot, fromRef, toRef);

  // Include staged-but-uncommitted delta vs HEAD when present.
  const staged = git(["diff", "--numstat", "--cached"], repoRoot, {
    allowFail: true,
  });
  let filesChanged = files;
  let linesChanged = lines;
  const allPaths = [...paths];
  if (staged.trim()) {
    for (const line of staged.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const add = parts[0] === "-" ? 0 : Number(parts[0]) || 0;
      const del = parts[1] === "-" ? 0 : Number(parts[1]) || 0;
      filesChanged += 1;
      linesChanged += add + del;
      allPaths.push(parts[2]);
    }
  }

  const languages = languagesFromPaths(allPaths);
  const sensitivePaths = allPaths.some((p) => SENSITIVE_RE.test(p));

  return {
    level,
    fromRef,
    toRef,
    commitCount,
    filesChanged,
    linesChanged,
    languages,
    sensitivePaths,
  };
}

export function computeQuestionQuota(signals: QuotaSignals): QuotaResult {
  const base = LEVEL_BASE[signals.level];
  const cap = LEVEL_CAP[signals.level];
  const bonuses: Array<{ reason: string; delta: number }> = [];

  const lineT1 = signals.level === "deep" ? 80 : signals.level === "standard" ? 150 : 250;
  const lineT2 = signals.level === "deep" ? 300 : signals.level === "standard" ? 500 : 800;
  if (signals.linesChanged >= lineT1) {
    bonuses.push({ reason: `linesChanged≥${lineT1}`, delta: 1 });
  }
  if (signals.linesChanged >= lineT2) {
    bonuses.push({ reason: `linesChanged≥${lineT2}`, delta: 1 });
  }
  if (signals.filesChanged >= 6) {
    bonuses.push({ reason: "filesChanged≥6", delta: 1 });
  }
  if (signals.filesChanged >= 15) {
    bonuses.push({ reason: "filesChanged≥15", delta: 1 });
  }
  if (signals.commitCount >= 3) {
    bonuses.push({ reason: "commitCount≥3", delta: 1 });
  }
  if (signals.commitCount >= 6) {
    bonuses.push({ reason: "commitCount≥6", delta: 1 });
  }
  if (signals.languages.length >= 2 && signals.level !== "lite") {
    bonuses.push({ reason: "multi-language diff", delta: 1 });
  }
  if (signals.sensitivePaths) {
    bonuses.push({ reason: "sensitive paths (auth/crypto/migration/…)", delta: 1 });
  }

  const raw = base + bonuses.reduce((s, b) => s + b.delta, 0);
  const minQuestions = clamp(raw, base, cap);

  return {
    minQuestions,
    level: signals.level,
    base,
    cap,
    bonuses,
    signals,
  };
}

export function cmdQuestions(opts: {
  json?: boolean;
  from?: string;
  level?: string;
}): void {
  const repoRoot = findGitRoot();
  const config = readConfig(repoRoot);
  let level = config.level;
  if (opts.level) {
    if (!isLevel(opts.level)) {
      console.error(`know-code: invalid level "${opts.level}"`);
      process.exit(1);
    }
    level = opts.level;
  }

  const fromRef = resolveQuotaFrom(repoRoot, config.baseBranch, opts.from);
  const signals = collectQuotaSignals(repoRoot, level, fromRef);
  const result = computeQuestionQuota(signals);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`know-code questions`);
  console.log(`  minQuestions: ${result.minQuestions}`);
  console.log(`  level:        ${result.level} (base ${result.base}, cap ${result.cap})`);
  console.log(`  range:        ${result.signals.fromRef.slice(0, 12)}…..${result.signals.toRef}`);
  console.log(`  commits:      ${result.signals.commitCount}`);
  console.log(`  files:        ${result.signals.filesChanged}`);
  console.log(`  lines:        ${result.signals.linesChanged}`);
  console.log(
    `  languages:    ${result.signals.languages.join(", ") || "(none detected)"}`,
  );
  if (result.bonuses.length) {
    console.log(`  bonuses:`);
    for (const b of result.bonuses) {
      console.log(`    +${b.delta} ${b.reason}`);
    }
  }
  console.log(
    `know-code: write exactly ${result.minQuestions} questions in .know-code/quiz.json (not fewer).`,
  );
}
