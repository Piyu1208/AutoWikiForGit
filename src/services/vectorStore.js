import { createHash } from "node:crypto";
import { Pinecone } from "@pinecone-database/pinecone";

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

// Indexes with an `embed` field accept at most 96 documents per upsert.
const UPSERT_BATCH_SIZE = 96;
const DEFAULT_TOP_K = 5;

// Name of the string field in your index schema that has `embed` set
// (text-embedding-3-small). Pinecone embeds this field on write and on search.
const TEXT_FIELD = process.env.PINECONE_TEXT_FIELD ?? "chunk_text";

function repoToNamespace(repo) {
  return repo.replace("/", "-");
}

function getIndex(namespace) {
  const indexName = process.env.PINECONE_INDEX;
  return pc.index({ name: indexName }).namespace(namespace);
}

function normalizeDocuments(documents) {
  return documents
    .map((doc) => ({
      pageContent:
        typeof doc.pageContent === "string" ? doc.pageContent : "",
      metadata: doc.metadata ?? {},
    }))
    .filter((doc) => doc.pageContent.trim().length > 0);
}

function buildRecordId(repo, metadata, content) {
  return createHash("sha256")
    .update(`${repo}:${metadata.path ?? ""}:${content}`)
    .digest("hex");
}

export async function saveChunks(repo, documents) {
  const chunks = normalizeDocuments(documents);

  if (!chunks.length) {
    return { saved: false, chunkCount: 0 };
  }

  const namespace = repoToNamespace(repo);
  const index = getIndex(namespace);

  // Plain text only: Pinecone embeds TEXT_FIELD itself.
  const records = chunks.map((doc) => ({
    _id: buildRecordId(repo, doc.metadata, doc.pageContent),
    [TEXT_FIELD]: doc.pageContent,
    path: doc.metadata.path ?? "",
    repo: doc.metadata.repo ?? repo,
  }));

  for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
    await index.documents.upsert({
      documents: records.slice(i, i + UPSERT_BATCH_SIZE),
    });
  }

  return { saved: true, chunkCount: chunks.length };
}

function toSearchDocument(match) {
  // Documents API returns fields flattened on the match (not under `fields`).
  const fields = match.fields ?? match;

  return {
    pageContent: fields[TEXT_FIELD] ?? "",
    metadata: {
      path: fields.path,
      repo: fields.repo,
    },
    score: match._score,
  };
}

export async function search(repo, question, topK = DEFAULT_TOP_K) {
  const namespace = repoToNamespace(repo);
  const index = getIndex(namespace);

  // Pinecone embeds the query text with the field's model.
  const response = await index.documents.search({
    topK,
    scoreBy: [
      {
        type: "embed",
        fields: [TEXT_FIELD],
        query: question,
      },
    ],
    includeFields: [TEXT_FIELD, "path", "repo"],
  });

  // Documents API returns `matches` (the old Records API used `result.hits`).
  const matches = response.matches ?? response.result?.hits ?? [];

  return matches
    .map(toSearchDocument)
    .filter((doc) => doc.pageContent.trim().length > 0);
}