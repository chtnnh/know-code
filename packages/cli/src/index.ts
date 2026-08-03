#!/usr/bin/env node
import { cmdAsk } from "./commands/ask.js";
import { cmdCheck } from "./commands/check.js";
import { cmdCommit } from "./commands/commit.js";
import { cmdConfig } from "./commands/config.js";
import { cmdGrade } from "./commands/grade.js";
import { cmdHash } from "./commands/hash.js";
import { cmdInit } from "./commands/init.js";
import { cmdPass } from "./commands/pass.js";
import {
  cmdRangeAbort,
  cmdRangeBegin,
  cmdRangeSeal,
  cmdRangeStatus,
} from "./commands/range.js";
import { cmdSkills } from "./commands/skills.js";
import { cmdStatus } from "./commands/status.js";
import { cmdTaught } from "./commands/taught.js";
import { cmdVerify } from "./commands/verify.js";
import { cmdOverride } from "./override.js";
import { cmdQuestions } from "./questions.js";
import { cmdAttestInit } from "./seal.js";

const HELP = `know-code — block commit/push/PR until you can explain the diff

Usage:
  know-code init [--level lite|standard|deep] [--base-branch main]
                 [--agents claude,cursor,codex] [--require-trailer] [--workflow]
  know-code config [--json]     # effective repo + home config
  know-code attest-init [--force] [--passphrase <secret>]
  know-code range begin [--from <ref>]
  know-code range status [--json]
  know-code range seal [--rewrite] [--passphrase <secret>]
  know-code range abort
  know-code questions [--json] [--from <ref>] [--level …]
  know-code taught [--skip] [--hash <diffHash>] [--passphrase <secret>]
  know-code ask [--quiz .know-code/quiz.json] [--port 3847] [--timeout 1800] [--no-open]
  know-code grade --score <0-1> --hash <diffHash> [--level …] [--passphrase <secret>]
  know-code pass --level <lite|standard|deep> --hash <diffHash> [--passphrase <secret>]
  know-code check
  know-code commit -m "<message>" [--no-trailer]
  know-code override
  know-code status|hash|verify [--require-all] [--require-range-trailers]
  know-code skills [--global] [--agents …] [-y]
  know-code version|help

Flow (range — one quiz per feature branch):
  attest-init → range begin → taught → questions → ask → grade → pass → commit → range seal → push

Config: ~/.know-code/config.json (defaults) + .know-code/config.json (local, gitignored)
Docs: https://kc.chtnnhfoundation.org/docs/config
`;

function parseArgs(argv: string[]): {
  command: string;
  subcommand?: string;
  flags: Record<string, string | boolean>;
  rest: string[];
} {
  const [command = "help", sub0, ...rest0] = argv;
  if (command === "commit") {
    const all = sub0 ? [sub0, ...rest0] : rest0;
    return { command, flags: {}, rest: all };
  }
  if (command === "range") {
    const flags: Record<string, string | boolean> = {};
    const rest: string[] = [];
    const subcommand = sub0 && !sub0.startsWith("--") ? sub0 : undefined;
    const flagArgs = subcommand ? rest0 : [sub0, ...rest0].filter(Boolean);
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
  const { command, subcommand, flags, rest } = parseArgs(process.argv.slice(2));
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
          requireTrailer: flags["require-trailer"] === true,
          workflow: flags.workflow === true,
        });
        break;
      case "config":
        cmdConfig(flags.json === true);
        break;
      case "attest-init":
        void cmdAttestInit({
          force: flags.force === true,
          passphrase,
        }).catch(failAsync);
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
            cmdRangeAbort();
            break;
          default:
            console.error("know-code range: use begin | status | seal | abort\n");
            process.exit(1);
        }
        break;
      case "questions":
        cmdQuestions({
          json: flags.json === true,
          from: typeof flags.from === "string" ? flags.from : undefined,
          level: typeof flags.level === "string" ? flags.level : undefined,
        });
        break;
      case "check":
        cmdCheck();
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
          score: typeof flags.score === "string" ? flags.score : undefined,
          hash: typeof flags.hash === "string" ? flags.hash : undefined,
          level: typeof flags.level === "string" ? flags.level : undefined,
          passphrase,
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
        cmdStatus(flags.json === true);
        break;
      case "hash":
        cmdHash(flags.json === true);
        break;
      case "verify":
        cmdVerify({
          requireAll: flags["require-all"] === true,
          requireRangeTrailers: flags["require-range-trailers"] === true,
        });
        break;
      case "ask":
        void cmdAsk({
          quiz: typeof flags.quiz === "string" ? flags.quiz : undefined,
          port: typeof flags.port === "string" ? flags.port : undefined,
          timeout: typeof flags.timeout === "string" ? flags.timeout : undefined,
          noOpen: flags["no-open"] === true,
        }).catch(failAsync);
        return;
      case "commit":
        cmdCommit(rest[0] === "--" ? rest.slice(1) : rest);
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
        console.log("0.1.4");
        break;
      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    failAsync(err);
  }
}

main();
