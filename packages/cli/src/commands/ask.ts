import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { readConfig, resolveLevel } from "../config.js";
import { writeAnswers, assertTaughtForHash } from "../attest.js";
import { hasUnstagedTrackedChanges, unstagedTrackedFileNames } from "../git.js";
import { resolveQuizContext } from "../hash.js";
import {
  collectQuotaSignals,
  computeQuestionQuota,
  resolveQuotaFrom,
} from "../questions.js";
import { findGitRoot, knowCodeDir } from "../paths.js";

export interface QuizQuestion {
  id: string;
  prompt: string;
}

export interface QuizSpec {
  diffHash: string;
  level: string;
  title?: string;
  questions: QuizQuestion[];
}

export interface QuizAnswer {
  id: string;
  answer: string;
}

export interface QuizResult {
  diffHash: string;
  level: string;
  answers: QuizAnswer[];
  submittedAt: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [url]);
  } else if (platform === "win32") {
    execFile("cmd", ["/c", "start", "", url]);
  } else {
    execFile("xdg-open", [url]);
  }
}

function renderPage(quiz: QuizSpec): string {
  const title = quiz.title || "know-code quiz";
  const fields = quiz.questions
    .map(
      (q, i) => `
      <section class="q">
        <label for="${escapeHtml(q.id)}">
          <span class="n">Q${i + 1}</span>
          <span class="p">${escapeHtml(q.prompt)}</span>
        </label>
        <textarea id="${escapeHtml(q.id)}" name="${escapeHtml(q.id)}" rows="5" required placeholder="Type your answer here…"></textarea>
      </section>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #141414;
      --fg: #ededed;
      --muted: #9a9a9a;
      --line: #2a2a2a;
      --field: #1c1c1c;
      --accent: #e8e8e8;
      --accent-fg: #111;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
    }
    main {
      max-width: 40rem;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 4rem;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 600;
      margin: 0 0 0.35rem;
      letter-spacing: -0.02em;
    }
    .meta {
      color: var(--muted);
      font-size: 0.85rem;
      margin-bottom: 2rem;
    }
    .meta code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.8em;
    }
    .q { margin-bottom: 1.75rem; }
    label { display: block; margin-bottom: 0.6rem; }
    .n {
      display: inline-block;
      min-width: 1.75rem;
      color: var(--muted);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      margin-right: 0.4rem;
    }
    .p { white-space: pre-wrap; }
    textarea {
      width: 100%;
      display: block;
      resize: vertical;
      background: var(--field);
      color: var(--fg);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0.75rem 0.85rem;
      font: inherit;
      line-height: 1.45;
    }
    textarea:focus {
      outline: 2px solid #555;
      outline-offset: 1px;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 6px;
      background: var(--accent);
      color: var(--accent-fg);
      font: inherit;
      font-weight: 600;
      padding: 0.7rem 1.1rem;
      cursor: pointer;
    }
    button:disabled { opacity: 0.5; cursor: wait; }
    .done {
      margin-top: 2rem;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--muted);
      display: none;
    }
    .done.show { display: block; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">
      Level <strong>${escapeHtml(quiz.level)}</strong>
      · hash <code>${escapeHtml(quiz.diffHash.slice(0, 12))}…</code>
      · Question <span id="progress">1</span> of ${quiz.questions.length}
      · answers stay in this form (not the agent chat)
    </p>
    <form id="quiz">
      ${fields}
      <button type="submit" id="submit">Submit answers</button>
    </form>
    <p class="done" id="done">Answers submitted. You can close this tab and return to the agent.</p>
  </main>
  <script>
    const form = document.getElementById("quiz");
    const done = document.getElementById("done");
    const btn = document.getElementById("submit");
    const progress = document.getElementById("progress");
    const storageKey = "know-code-quiz-" + ${JSON.stringify(quiz.diffHash)};
    try {
      const draft = localStorage.getItem(storageKey);
      if (draft) {
        const saved = JSON.parse(draft);
        for (const [id, val] of Object.entries(saved)) {
          const el = document.getElementById(id);
          if (el) el.value = val;
        }
      }
    } catch (_) {}
    form.querySelectorAll("textarea").forEach((ta) => {
      ta.addEventListener("input", () => {
        const data = {};
        form.querySelectorAll("textarea").forEach((t) => { data[t.id] = t.value; });
        try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch (_) {}
        const filled = [...form.querySelectorAll("textarea")].filter((t) => t.value.trim()).length;
        if (progress) progress.textContent = String(Math.max(1, filled));
      });
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      const data = new FormData(form);
      const answers = [];
      for (const [id, answer] of data.entries()) {
        answers.push({ id, answer: String(answer).trim() });
      }
      const res = await fetch("/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        btn.disabled = false;
        let msg = "Submit failed";
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch (_) {}
        alert(msg);
        return;
      }
      try { localStorage.removeItem(storageKey); } catch (_) {}
      form.style.opacity = "0.45";
      form.querySelectorAll("textarea,button").forEach((el) => { el.disabled = true; });
      done.classList.add("show");
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadQuiz(path: string): QuizSpec {
  const raw = JSON.parse(readFileSync(path, "utf8")) as QuizSpec;
  if (!raw.diffHash || !raw.level || !Array.isArray(raw.questions) || !raw.questions.length) {
    throw new Error("Invalid quiz file: need diffHash, level, and questions[]");
  }
  for (const q of raw.questions) {
    if (!q.id || !q.prompt) throw new Error("Each question needs id and prompt");
  }
  return raw;
}

export async function cmdAsk(opts: {
  quiz?: string;
  port?: string;
  noOpen?: boolean;
  /** Seconds to wait for browser submit; default 1800 (30m). */
  timeout?: string;
}): Promise<void> {
  const repoRoot = findGitRoot();
  if (hasUnstagedTrackedChanges(repoRoot)) {
    const files = unstagedTrackedFileNames(repoRoot);
    const preview = files
      .slice(0, 20)
      .map((f) => `  ! ${f}`)
      .join("\n");
    const more =
      files.length > 20 ? `\n  … +${files.length - 20} more` : "";
    throw new Error(
      "ask refused — unstaged tracked edits are not in the quiz hash.\n" +
        "The gate would close immediately after pass (E01).\n" +
        "git add or stash these paths first:\n" +
        `${preview}${more}\n` +
        "tip: know-code hash --explain",
    );
  }
  const quizPath =
    opts.quiz || join(knowCodeDir(repoRoot), "quiz.json");
  if (!existsSync(quizPath)) {
    throw new Error(
      `Quiz file not found: ${quizPath}\nWrite questions with the know-code skill, then re-run.`,
    );
  }

  const quiz = loadQuiz(quizPath);
  const config = readConfig(repoRoot);
  const ctx = resolveQuizContext(repoRoot, config);
  if (quiz.diffHash !== ctx.diffHash) {
    throw new Error(
      `Quiz diffHash does not match current ${ctx.scope} hash.\n` +
        `  quiz:    ${quiz.diffHash}\n` +
        `  current: ${ctx.diffHash}\n` +
        `Re-run know-code questions and rewrite quiz.json.`,
    );
  }
  const fromRef = resolveQuotaFrom(repoRoot, config.baseBranch, ctx.rangeFromOid);
  const level = resolveLevel(repoRoot, quiz.level);
  if (config.enforcePipeline) {
    try {
      assertTaughtForHash(repoRoot, ctx.diffHash);
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  const quota = computeQuestionQuota(
    collectQuotaSignals(repoRoot, level, fromRef),
  );
  if (quiz.questions.length < quota.minQuestions) {
    throw new Error(
      `Quiz has ${quiz.questions.length} questions but need at least ${quota.minQuestions}.\n` +
        `Run: know-code questions`,
    );
  }
  const port = Number(opts.port || process.env.KNOW_CODE_QUIZ_PORT || "3847");
  const timeoutSec = Number(
    opts.timeout || process.env.KNOW_CODE_QUIZ_TIMEOUT || "1800",
  );
  let settled = false;

  const result = await new Promise<QuizResult>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        await handle(req, res, quiz, (answers) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const payload: QuizResult = {
            diffHash: quiz.diffHash,
            level: quiz.level,
            answers,
            submittedAt: new Date().toISOString(),
          };
          server.close();
          resolve(payload);
        });
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(String(err));
      }
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(
        new Error(
          `Quiz timed out after ${timeoutSec}s with no submission. Re-run know-code ask.`,
        ),
      );
    }, Math.max(1, timeoutSec) * 1000);
    timer.unref?.();

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} in use — try: know-code ask --port <other>`,
          ),
        );
      } else {
        reject(err);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}/`;
      console.error(`know-code: quiz UI at ${url}`);
      console.error("know-code: answer in the browser form (not the agent chat).");
      console.error(`know-code: timeout ${timeoutSec}s`);
      if (!opts.noOpen) openBrowser(url);
    });
  });

  writeAnswers(repoRoot, result);
  const outPath = join(knowCodeDir(repoRoot), "answers.json");
  console.error(`know-code: answers written → ${outPath}`);
  console.log(JSON.stringify(result, null, 2));
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  quiz: QuizSpec,
  onSubmit: (answers: QuizAnswer[]) => void,
): Promise<void> {
  const url = req.url || "/";

  if (req.method === "GET" && (url === "/" || url.startsWith("/?"))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderPage(quiz));
    return;
  }

  if (req.method === "POST" && url === "/submit") {
    const body = JSON.parse(await readBody(req)) as { answers?: QuizAnswer[] };
    const answers = body.answers || [];
    const requiredIds = new Set(quiz.questions.map((q) => q.id));
    const answeredIds = new Set(answers.map((a) => a.id));
    for (const id of requiredIds) {
      if (!answeredIds.has(id)) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: `missing answer for ${id}` }));
        return;
      }
    }
    if (!answers.length) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "no answers" }));
      return;
    }
    for (const a of answers) {
      if (!String(a.answer || "").trim()) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: `empty answer for ${a.id}` }));
        return;
      }
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    // Resolve after response flushes
    setTimeout(() => onSubmit(answers), 50);
    return;
  }

  res.writeHead(404);
  res.end("not found");
}
