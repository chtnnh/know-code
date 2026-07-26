#!/usr/bin/env node
import { cmdAsk } from "./commands/ask.js";
import { cmdCheck } from "./commands/check.js";
import { cmdCommit } from "./commands/commit.js";
import { cmdHash } from "./commands/hash.js";
import { cmdInit } from "./commands/init.js";
import { cmdPass } from "./commands/pass.js";
import { cmdStatus } from "./commands/status.js";
import { cmdVerify } from "./commands/verify.js";

const HELP = `know-code — block commit/push/PR until you can explain the diff

Usage:
  know-code init [--level lite|standard|deep] [--base-branch main]
                 [--agents claude,cursor,codex] [--require-trailer]
  know-code check
  know-code pass [--level lite|standard|deep] [--hash <diffHash>]
  know-code ask [--quiz .know-code/quiz.json] [--port 3847] [--no-open]
  know-code commit -m "<message>" [--no-trailer] [--] [git commit args...]
  know-code status [--json]
  know-code hash [--json]
  know-code verify [--require-all]
  know-code help

Environment:
  KNOW_CODE_LEVEL       Override quiz level
  KNOW_CODE_OVERRIDE=1  Bypass gate once (logged)
  KNOW_CODE_QUIZ_PORT   Port for browser quiz UI (default 3847)

Docs: https://github.com/chtnnh/know-code
`;

function parseArgs(argv: string[]): {
  command: string;
  flags: Record<string, string | boolean>;
  rest: string[];
} {
  const [command = "help", ...rest0] = argv;
  if (command === "commit") {
    return { command, flags: {}, rest: rest0 };
  }
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < rest0.length; i++) {
    const arg = rest0[i];
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = rest0[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { command, flags, rest };
}

function main(): void {
  const { command, flags, rest } = parseArgs(process.argv.slice(2));

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
        });
        break;
      case "check":
        cmdCheck();
        break;
      case "pass":
        cmdPass({
          level: typeof flags.level === "string" ? flags.level : undefined,
          hash: typeof flags.hash === "string" ? flags.hash : undefined,
        });
        break;
      case "status":
        cmdStatus(flags.json === true);
        break;
      case "hash":
        cmdHash(flags.json === true);
        break;
      case "verify":
        cmdVerify({ requireAll: flags["require-all"] === true });
        break;
      case "ask":
        void cmdAsk({
          quiz: typeof flags.quiz === "string" ? flags.quiz : undefined,
          port: typeof flags.port === "string" ? flags.port : undefined,
          noOpen: flags["no-open"] === true,
        }).catch((err) => {
          console.error(`know-code: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        });
        return;
      case "commit":
        cmdCommit(rest[0] === "--" ? rest.slice(1) : rest);
        break;
      case "help":
      case "--help":
      case "-h":
        console.log(HELP);
        break;
      case "version":
      case "--version":
      case "-v":
        console.log("0.1.0");
        break;
      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`know-code: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
