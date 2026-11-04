import "dotenv/config"; // must stay first: vectorStore.js reads env vars on import
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { fetchRepoFiles } from "./services/github.js";
import { chunkFiles } from "./services/chunker.js";
import { saveChunks, isIndexed } from "./services/vectorStore.js";
import { askQuestion } from "./services/rag.js";

// ---------- styling ----------
const useColor = output.isTTY;
const paint = (code) => (text) =>
  useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text);

const c = {
  bold: paint("1"),
  dim: paint("2"),
  cyan: paint("36"),
  green: paint("32"),
  yellow: paint("33"),
  red: paint("31"),
  magenta: paint("35"),
};

const WIDTH = Math.min(output.columns || 80, 90);
const rule = (ch = "─") => c.dim(ch.repeat(WIDTH));

function banner() {
  console.log();
  console.log(rule("═"));
  console.log(c.bold("  AutoWiki for Git") + c.dim("  ·  chat with any GitHub repo"));
  console.log(rule("═"));
}

const info = (msg) => console.log(`${c.cyan("●")} ${msg}`);
const ok = (msg) => console.log(`${c.green("✔")} ${msg}`);
const warn = (msg) => console.log(`${c.yellow("!")} ${msg}`);
const fail = (msg) => console.log(`${c.red("✖")} ${msg}`);

function printUser(text) {
  console.log();
  console.log(c.bold(c.cyan("You")));
  console.log(indent(text));
}

function printAgent(text, sources = []) {
  console.log();
  console.log(c.bold(c.green("Agent")));
  console.log(indent(text.trim()));

  if (sources.length) {
    console.log();
    console.log(indent(c.dim("Sources")));
    for (const s of sources) console.log(indent(c.dim(`• ${s}`)));
  }
  console.log();
  console.log(rule());
}

function indent(text, spaces = 2) {
  const pad = " ".repeat(spaces);
  return String(text)
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function startSpinner(label) {
  if (!output.isTTY) {
    console.log(c.dim(`  ${label}...`));
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    output.write(`\r${c.magenta(frames[i++ % frames.length])} ${c.dim(label)}`);
  }, 80);
  return () => {
    clearInterval(timer);
    output.write("\r" + " ".repeat(label.length + 4) + "\r");
  };
}

// ---------- helpers ----------
function parseRepoInput(raw) {
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) return null;

  return { owner, repo, repoKey: `${owner}/${repo}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilSearchable(repoKey, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isIndexed(repoKey)) return true;
    await sleep(3000);
  }
  return false;
}

async function indexRepo(rl, { owner, repo, repoKey }) {
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    token = (
      await rl.question(
        `${c.cyan("?")} GitHub token ${c.dim("(or set GITHUB_TOKEN; Enter to skip)")}: `,
      )
    ).trim();
  }

  let stop = startSpinner("Fetching files from GitHub");
  let files;
  try {
    files = await fetchRepoFiles(token, owner, repo);
  } finally {
    stop();
  }
  ok(`Fetched ${c.bold(files.length)} files`);

  stop = startSpinner("Chunking files");
  let documents;
  try {
    documents = await chunkFiles(files, repoKey);
  } finally {
    stop();
  }
  ok(`Created ${c.bold(documents.length)} chunks`);

  stop = startSpinner("Embedding and saving to Pinecone");
  let result;
  try {
    result = await saveChunks(repoKey, documents);
  } finally {
    stop();
  }

  if (!result.saved) {
    throw new Error("Nothing to index: the repo produced no text chunks.");
  }
  ok(`Saved ${c.bold(result.chunkCount)} chunks`);

  stop = startSpinner("Waiting for Pinecone to finish indexing");
  const ready = await waitUntilSearchable(repoKey);
  stop();
  if (ready) ok("Repo is searchable");
  else warn("Indexing is still finishing in Pinecone; early answers may be empty.");
}

async function pickRepo(rl) {
  while (true) {
    const raw = await rl.question(
      `\n${c.cyan("?")} GitHub repo link ${c.dim("(https://github.com/owner/repo or owner/repo)")}: `,
    );
    const parsed = parseRepoInput(raw);
    if (!parsed) {
      fail("That doesn't look like a valid repo. Try again.");
      continue;
    }

    const stop = startSpinner(`Checking if ${parsed.repoKey} is indexed`);
    let indexed;
    try {
      indexed = await isIndexed(parsed.repoKey);
    } finally {
      stop();
    }

    if (indexed) {
      ok(`${c.bold(parsed.repoKey)} is already indexed`);
      return parsed;
    }

    info(`${c.bold(parsed.repoKey)} is not indexed yet. Indexing now...`);
    try {
      await indexRepo(rl, parsed);
      return parsed;
    } catch (err) {
      fail(`Indexing failed: ${err.message}`);
    }
  }
}

function printHelp() {
  console.log();
  console.log(indent(c.bold("Commands")));
  console.log(indent(`${c.cyan("/new")}      switch to a different repo`));
  console.log(indent(`${c.cyan("/reindex")}  re-index the current repo`));
  console.log(indent(`${c.cyan("/help")}     show this help`));
  console.log(indent(`${c.cyan("/exit")}     quit`));
}

// ---------- main ----------
async function main() {
  const rl = readline.createInterface({ input, output });
  rl.on("close", () => {
    console.log(`\n${c.dim("Goodbye!")}`);
    process.exit(0);
  });

  banner();
  let current = await pickRepo(rl);

  console.log();
  console.log(rule());
  info(`Chatting about ${c.bold(current.repoKey)}. Type ${c.cyan("/help")} for commands.`);
  console.log(rule());

  while (true) {
    console.log();
    const line = (await rl.question(c.bold(c.cyan("You › ")))).trim();
    if (!line) continue;

    if (line === "/exit" || line === "/quit") {
      rl.close();
      return;
    }
    if (line === "/help") {
      printHelp();
      continue;
    }
    if (line === "/new") {
      current = await pickRepo(rl);
      console.log();
      info(`Now chatting about ${c.bold(current.repoKey)}.`);
      continue;
    }
    if (line === "/reindex") {
      try {
        await indexRepo(rl, current);
      } catch (err) {
        fail(`Indexing failed: ${err.message}`);
      }
      continue;
    }

    // Re-print the question in the transcript format.
    output.write("\x1b[1A\x1b[2K"); // erase the raw input line
    printUser(line);

    const stop = startSpinner("Thinking");
    try {
      const { answer, sources } = await askQuestion(current.repoKey, line);
      stop();
      printAgent(answer, sources);
    } catch (err) {
      stop();
      fail(`Something went wrong: ${err.message}`);
    }
  }
}

main().catch((err) => {
  fail(err.message);
  process.exit(1);
});