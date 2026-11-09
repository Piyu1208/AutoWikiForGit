import { Router } from "express";
import { inngest } from "../inngest/client.js";
import { parseRepo } from "../services/github.js";

const router = Router();

const MAX_HISTORY_MESSAGES = 10; // keep the Inngest event payload small
const MAX_MESSAGE_CHARS = 4000;

// History lives in the frontend; we only validate and trim what it sends.
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_HISTORY_MESSAGES);
}

async function startChatJob(repo, question, history) {
  const { repoKey } = parseRepo(repo);

  const { ids } = await inngest.send({
    name: "chat/question.requested",
    data: { repo: repoKey, question, history: sanitizeHistory(history) },
  });

  return { status: "queued", eventIds: ids, message: "check your inngest" };
}

router.post("/", async (req, res) => {
  const { repo, question, history } = req.body ?? {};

  if (!repo || !question) {
    return res.status(400).json({ error: "repo and question are required" });
  }
  if (history !== undefined && !Array.isArray(history)) {
    return res.status(400).json({ error: "history must be an array" });
  }

  try {
    res.status(202).json(await startChatJob(repo, question, history));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;