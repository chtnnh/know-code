#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cmdAmend } from "./commands/amend.js";
import { cmdAsk } from "./commands/ask.js";
import { cmdCheck } from "./commands/check.js";
import { cmdCommit } from "./commands/commit.js";
import { cmdConfig, cmdConfigSet } from "./commands/config.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdGrade } from "./commands/grade.js";
import { cmdHash } from "./commands/hash.js";
import { cmdInit } from "./commands/init.js";
import { cmdPass } from "./commands/pass.js";
import {
  cmdRangeAbort,
  cmdRangeBegin,
  cmdRangeContinue,
  cmdRangeSeal,
  cmdRangeStatus,
} from "./commands/range.js";
import { cmdReset } from "./commands/reset.js";
import { cmdShip } from "./commands/ship.js";
import { cmdSkills } from "./commands/skills.js";
import { cmdStatus } from "./commands/status.js";
import { cmdTaught } from "./commands/taught.js";
import { cmdVerify } from "./commands/verify.js";
import { cmdQuizValidate } from "./commands/quiz-validate.js";
import { CANONICAL_FLOW } from "./grading.js";
import { findGitRoot } from "./paths.js";
import { uninstallGitHooks, uninstallAgentHooks } from "./hooks.js";
import { cmdOverride } from "./override.js";
import { cmdQuestions } from "./questions.js";
import { cmdAttestInit } from "./seal.js";

function packageVersion(): string {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = packageVersion();

const HELP = `know-code — block commit/push/PR until you can explain the diff

Usage:
  know-code init [--level lite|standard|deep] [--base-branch main]
                 [--agents claude,cursor,codex] [--require-trailer] [--workflow]
                 [--range-mode auto|index|range] [--range-seal receipt|rewrite]
  know-code config [--json] | config set <key> <value>
  know-code attest-init [--force] [--passphrase <secret>]
  know-code doctor [--json]
  know-code range begin|status|seal|abort|continue [--from <ref>] [--rewrite] [--keep-seal] [--yes]
  know-code questions [--json] [--template] [--from <ref>] [--level …]
  know-code quiz validate [--path .know-code/quiz.json] [--json]
  know-code taught [--skip] [--hash <diffHash>] [--passphrase <secret>]
  know-code ask [--quiz .know-code/quiz.json] [--port 3847] [--timeout 1800] [--no-open]
  know-code grade propose [--json]
  know-code grade --review|--accept [--hash <diffHash>] [--passphrase <secret>]
  know-code pass [--level …] [--hash <diffHash>] [--passphrase <secret>]
  know-code check | ship [--dry-run]
  know-code commit -m "<message>" | -F <file> [--no-trailer]
  know-code amend [-m "…"] [--no-trailer]
  know-code reset [--keep-attest]
  know-code override
  know-code status [--json] [--next]
  know-code hash|verify [--require-all] [--require-range-trailers] [--range-seal]
  know-code hooks uninstall [--agents claude,cursor,codex]
  know-code skills [--global] [--agents …] [-y]
  know-code version|help

Flow (range — one quiz per feature branch):
  attest-init → range begin → ${CANONICAL_FLOW} → push

Docs: https://kc.chtnnhfoundation.org/docs/config
`;

function parseArgs(argv: string[]): {
  command: string;
  subcommand?: string;
  subsub?: string;
  flags: Record<string, string | boolean>;
  rest: string[];
} {
  const [command = "help", sub0, sub1, ...rest0] = argv;
  if (command === "commit" || command === "amend") {
    const all = sub0
      ? [sub0, sub1, ...rest0].filter((x): x is string => !!x)
      : rest0;
    return { command, flags: {}, rest: all };
  }
  if (command === "range" || command === "grade" || command === "hooks" || command === "quiz") {
    const flags: Record<string, string | boolean> = {};
    const rest: string[] = [];
    const subcommand = sub0 && !sub0.startsWith("--") ? sub0 : undefined;
    const subsub =
      subcommand && sub1 && !sub1.startsWith("--") ? sub1 : undefined;
    const flagArgs = subcommand
      ? subsub
        ? rest0
        : sub1
          ? [sub1, ...rest0]
          : rest0
      : [sub0, sub1, ...rest0].filter((x): x is string => !!x);
    for (let i = 0; i < flagArgs.length; i++) {
      const arg = flagArgs[i];
      if (!arg.startsWith("--")) {
        rest.push(arg);
        continue;
      }
      const key = arg.slice(2);
      const next = flagArgs[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    }
    return { command, subcommand, subsub, flags, rest };
  }
  if (command === "config") {
    const subcommand = sub0 && !sub0.startsWith("--") ? sub0 : undefined;
    const flags: Record<string, string | boolean> = {};
    const rest: string[] = [];
    const positional = subcommand
      ? [sub1, ...rest0].filter((x): x is string => !!x)
      : [sub0, ...rest0].filter((x): x is string => !!x && !x.startsWith("--"));
    for (let i = 0; i < positional.length; i++) {
      const arg = positional[i];
      if (!arg.startsWith("--")) {
        rest.push(arg);
        continue;
      }
      const key = arg.slice(2);
      const next = positional[i + 1];
      if (!next || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    }
    return { command, subcommand, flags, rest };
  }
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  const all = sub0 ? [sub0, ...rest0] : rest0;
  for (let i = 0; i < all.length; i++) {
    const arg = all[i];
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = all[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { command, flags, rest };
}

function failAsync(err: unknown): never {
  console.error(`know-code: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

function main(): void {
  const { command, subcommand, subsub, flags, rest } = parseArgs(
    process.argv.slice(2),
  );
  const passphrase =
    typeof flags.passphrase === "string" ? flags.passphrase : undefined;

  try {
    switch (command) {
      case "init":
        cmdInit({
          level: typeof flags.level === "string" ? flags.level : undefined,
          baseBranch:
            typeof flags["base-branch"] === "string"
              ? flags["base-branch"]
              : undefined,
          agents: typeof flags.agents === "string" ? flags.agents : undefined,
          requireTrailer:
            flags["require-trailer"] === true || flags.workflow === true,
          workflow: flags.workflow === true,
          rangeMode:
            typeof flags["range-mode"] === "string"
              ? flags["range-mode"]
              : undefined,
          rangeSeal:
            typeof flags["range-seal"] === "string"
              ? flags["range-seal"]
              : undefined,
          requireAttest:
            flags["require-attest"] === true
              ? true
              : flags["require-attest"] === false
                ? false
                : undefined,
          requireGradeProposal:
            flags["require-grade-proposal"] === false ? false : undefined,
        });
        break;
      case "config":
        if (subcommand === "set") {
          const [key, value] = rest;
          if (!key || value === undefined) {
            console.error("know-code: usage: config set <key> <value>");
            process.exit(1);
          }
          cmdConfigSet(key, value);
          break;
        }
        cmdConfig(flags.json === true);
        break;
      case "attest-init":
        void cmdAttestInit({
          force: flags.force === true,
          passphrase,
        }).catch(failAsync);
        return;
      case "doctor":
        void cmdDoctor(flags.json === true).catch(failAsync);
        return;
      case "range":
        switch (subcommand) {
          case "begin":
            cmdRangeBegin({
              from: typeof flags.from === "string" ? flags.from : undefined,
            });
            break;
          case "status":
            cmdRangeStatus(flags.json === true);
            break;
          case "seal":
            void cmdRangeSeal({
              rewrite: flags.rewrite === true,
              passphrase,
            }).catch(failAsync);
            return;
          case "abort":
            cmdRangeAbort({ keepSeal: flags["keep-seal"] === true });
            break;
          case "continue":
            cmdRangeContinue({ yes: flags.yes === true });
            break;
          default:
            console.error(
              "know-code range: use begin | status | seal | abort | continue\n",
            );
            process.exit(1);
        }
        break;
      case "questions":
        cmdQuestions({
          json: flags.json === true,
          template: flags.template === true,
          from: typeof flags.from === "string" ? flags.from : undefined,
          level: typeof flags.level === "string" ? flags.level : undefined,
        });
        break;
      case "quiz":
        if (subcommand === "validate") {
          cmdQuizValidate({
            path: typeof flags.path === "string" ? flags.path : undefined,
            json: flags.json === true,
          });
          break;
        }
        console.error("know-code quiz: use validate\n");
        process.exit(1);
        break;
      case "check":
        cmdCheck();
        break;
      case "ship":
        cmdShip({ dryRun: flags["dry-run"] === true });
        break;
      case "reset":
        cmdReset({ keepAttest: flags["keep-attest"] === true });
        break;
      case "taught":
        void cmdTaught({
          skip: flags.skip === true,
          hash: typeof flags.hash === "string" ? flags.hash : undefined,
          passphrase,
        }).catch(failAsync);
        return;
      case "grade":
        void cmdGrade({
          subcommand,
          score: typeof flags.score === "string" ? flags.score : undefined,
          hash: typeof flags.hash === "string" ? flags.hash : undefined,
          level: typeof flags.level === "string" ? flags.level : undefined,
          passphrase,
          review: flags.review === true,
          accept: flags.accept === true,
          json: flags.json === true,
        }).catch(failAsync);
        return;
      case "pass":
        void cmdPass({
          level: typeof flags.level === "string" ? flags.level : undefined,
          hash: typeof flags.hash === "string" ? flags.hash : undefined,
          passphrase,
        }).catch(failAsync);
        return;
      case "override":
        void cmdOverride().catch(failAsync);
        return;
      case "status":
        cmdStatus({
          json: flags.json === true,
          next: flags.next !== false,
        });
        break;
      case "hash":
        cmdHash(flags.json === true);
        break;
      case "verify":
        cmdVerify({
          requireAll: flags["require-all"] === true,
          requireRangeTrailers: flags["require-range-trailers"] === true,
          rangeSeal: flags["range-seal"] === true,
        });
        break;
      case "ask":
        void cmdAsk({
          quiz: typeof flags.quiz === "string" ? flags.quiz : undefined,
          port: typeof flags.port === "string" ? flags.port : undefined,
          timeout:
            typeof flags.timeout === "string" ? flags.timeout : undefined,
          noOpen: flags["no-open"] === true,
        }).catch(failAsync);
        return;
      case "commit":
        cmdCommit(rest[0] === "--" ? rest.slice(1) : rest);
        break;
      case "amend":
        cmdAmend(rest[0] === "--" ? rest.slice(1) : rest);
        break;
      case "hooks":
        if (subcommand === "uninstall") {
          uninstallGitHooks(findGitRoot());
          if (flags.agents) {
            const agents = String(flags.agents)
              .split(",")
              .map((a) => a.trim()) as ("claude" | "cursor" | "codex")[];
            uninstallAgentHooks(findGitRoot(), agents);
          }
          console.log("know-code: hooks uninstalled (backups preserved if any)");
          break;
        }
        console.error("know-code hooks: use uninstall\n");
        process.exit(1);
        break;
      case "skills":
        cmdSkills({
          global:
            flags.global === true ||
            flags.g === true ||
            rest.includes("-g") ||
            rest.includes("--global"),
          agents: typeof flags.agents === "string" ? flags.agents : undefined,
          yes: flags.yes === true || flags.y === true || rest.includes("-y"),
        });
        break;
      case "help":
      case "--help":
      case "-h":
        console.log(HELP);
        break;
      case "version":
      case "--version":
      case "-v":
        console.log(VERSION);
        break;
      default:
        console.error(`Unknown command: ${command}\n`);
        console.error(`Run: know-code help`);
        process.exit(1);
    }
  } catch (err) {
    failAsync(err);
  }
}

main();
