import { ChatOpenAI } from "@langchain/openai";
import { search } from "./vectorStore.js";

const MAX_HISTORY_MESSAGES = 10; // last 5 exchanges

function toText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part.text ?? ""))
      .join("");
  }
  return String(content ?? "");
}

function getLlm() {
  return new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: "https://aicredits.in/v1",
    },
  });
}

// History is owned by the client: [{ role: "user" | "assistant", content: string }, ...]
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-MAX_HISTORY_MESSAGES);
}

// Turns a follow-up like "what about its tests?" into a standalone search query.
async function condenseQuestion(llm, history, question) {
  if (!history.length) return question;

  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const response = await llm.invoke([
    [
      "system",
      "Rewrite the user's latest question as a standalone question that can be understood without the conversation. " +
        "Resolve pronouns and references using the chat history. Do not answer it. " +
        "If it is already standalone, return it unchanged. Output only the question.",
    ],
    ["human", `Chat history:\n${transcript}\n\nLatest question: ${question}`],
  ]);

  return toText(response.content).trim() || question;
}

export async function askQuestion(repo, question, history = [], topK = 5) {
  const llm = getLlm();
  const past = cleanHistory(history);

  const standalone = await condenseQuestion(llm, past, question);
  const docs = await search(repo, standalone, topK);

  if (!docs.length) {
    return {
      answer: "No indexed content was found for this repo. Index it first, then try again.",
      sources: [],
    };
  }

  const context = docs
    .map((doc) => `File: ${doc.metadata.path}\n${doc.pageContent}`)
    .join("\n\n");

  const response = await llm.invoke([
    [
      "system",
      "Answer using the repo context below only. Use the chat history to understand follow-up questions. " +
        "If the context doesn't contain the answer, say so.\n\n" +
        `Repo context:\n${context}`,
    ],
    ...past.map((m) => [m.role === "user" ? "human" : "ai", m.content]),
    ["human", question],
  ]);

  return {
    answer: toText(response.content),
    sources: [...new Set(docs.map((doc) => doc.metadata.path).filter(Boolean))],
  };
}