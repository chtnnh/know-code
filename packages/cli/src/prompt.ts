import { createInterface } from "node:readline";
import { stdin, stderr } from "node:process";

function promptSecretVisible(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stderr, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Hidden passphrase prompt when stdin is a TTY with raw mode support. */
export function promptSecretHidden(question: string): Promise<string> {
  if (!stdin.isTTY) {
    return promptSecretVisible(question);
  }

  return new Promise((resolve, reject) => {
    stderr.write(question);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          cleanup();
          stderr.write("\n");
          resolve(password);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          password = password.slice(0, -1);
        } else if (char >= " " || char === "\t") {
          password += char;
        }
      }
    };

    const cleanup = () => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    stdin.on("data", onData);
    stdin.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}
