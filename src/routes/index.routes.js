import { Router } from "express";
import { inngest } from "../inngest/client.js";
import { parseRepo } from "../services/github.js";

const router = Router();

router.post("/", async (req, res) => {
  const githubToken = req.body.githubToken || process.env.GITHUB_TOKEN;
  const { owner, repo } = parseRepo(req.body.repo);


  await inngest.send({
    name: "repo/index.requested",
    data: {githubToken, owner, repo },
  });

  res.json("Repo Indexing");
});

export default router;