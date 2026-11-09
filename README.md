# GitWiki

**Chat with your GitHub repositories using AI.**

GitWiki is a CLI-based Retrieval-Augmented Generation (RAG) application that lets you interact with GitHub repositories through natural language. Simply provide a repository URL, let GitWiki index its contents, and start asking questions about its codebase.

Instead of manually navigating files and searching through code, GitWiki retrieves relevant code snippets and uses an LLM to generate context-aware answers.

## Features

- **Repository Indexing:** Fetches repository files directly from GitHub using the GitHub API.
- **Automated Chunking:** Splits repository content into smaller chunks for efficient retrieval.
- **Vector Search:** Uses Pinecone for embedding generation, vector storage, and similarity search.
- **Context-Aware Conversations:** Supports conversation history and follow-up questions.
- **Automatic Indexing:** Checks whether a repository has already been indexed before initiating indexing.
- **Background Processing:** Uses Inngest to handle repository indexing and question-answering workflows.
- **Source References:** Returns the repository file paths used to generate an answer.

## Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | Runtime environment |
| Express.js | HTTP API server |
| Inngest | Background workflows |
| Octokit | GitHub API integration |
| LangChain | LLM integration |
| OpenAI-compatible API | Answer generation |
| Pinecone | Vector database and embedding generation |
| Nodemon | Development server |

## Architecture

GitWiki uses a CLI as its primary interface, an Express server for handling requests, and Inngest for executing asynchronous workflows.

### Application Flow

1. The user starts GitWiki through the CLI.
2. The CLI asks for a GitHub repository URL.
3. GitWiki checks whether the repository has already been indexed.
4. If it hasn't been indexed, GitWiki triggers the indexing workflow.
5. Once indexing is complete, the user can start asking questions.
6. Questions are processed through the RAG pipeline, and answers are returned with relevant file references.

### Inngest Workflows

GitWiki uses two Inngest functions.

**1. `indexRepo`**

Triggered by the `repo/index.requested` event.

The indexing workflow consists of three steps:

- **Fetch GitHub Files:** Uses Octokit to retrieve repository files.
- **Chunk Files:** Splits the fetched content into smaller documents and associates them with the repository.
- **Save to Pinecone:** Sends the chunks to Pinecone, which generates embeddings using its hosted embedding model and stores them for vector retrieval.

**2. `askQuestionFn`**

Triggered by the `chat/question.requested` event.

The question-answering workflow:

- Receives the repository identifier, question, and conversation history.
- Retrieves relevant chunks from Pinecone using similarity search.
- Uses the retrieved content as context for the LLM.
- Generates an answer grounded in the repository content.
- Returns the answer along with the source file paths.

### RAG Pipeline

The question-answering pipeline also includes query condensation to handle follow-up questions.

```text
User Question + Chat History
          |
          v
   Query Condensation
          |
          v
   Standalone Question
          |
          v
   Pinecone Similarity Search
          |
          v
    Retrieved Documents
          |
          v
    Context Construction
          |
          v
       LLM Call
          |
          v
   Answer + Source Files
```

GitWiki uses the last 10 history messages (5 exchanges) to understand conversational context and rewrite follow-up questions into standalone queries before retrieval.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/)
- npm
- [GitHub Personal Access Token](https://github.com/settings/tokens)
- [Pinecone Account](https://www.pinecone.io/)
- [Inngest CLI](https://www.inngest.com/docs/local-development)

You'll also need an API key for the OpenAI-compatible LLM provider configured in the project.

### Installation

Clone the repository:

```bash
git clone https://github.com/Piyu1208/AutoWikiForGit
cd AutoWikiForGit
```

Install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
INNGEST_DEV=1

PINECONE_INDEX=
PINECONE_API_KEY=

GITHUB_TOKEN=

OPENAI_API_KEY=
```

Configure the variables:

| Variable | Description |
|---|---|
| `INNGEST_DEV` | Enables Inngest development mode |
| `PINECONE_INDEX` | Name of your Pinecone index |
| `PINECONE_API_KEY` | Pinecone API key |
| `GITHUB_TOKEN` | GitHub personal access token |
| `OPENAI_API_KEY` | API key for the OpenAI-compatible LLM provider |

**Note:** The LLM integration currently uses the `gpt-4o-mini` model through the configured OpenAI-compatible API endpoint.

Your Pinecone index must be configured with the appropriate integrated embedding model and vector dimensions expected by the application.

## Running the Application

GitWiki requires three processes running locally.

**1. Start the Inngest Dev Server**

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

This starts the local Inngest dashboard and connects it to your application's Inngest endpoint.

**2. Start the Express Server**

```bash
npm run dev
```

This starts the Node.js application using Nodemon.

**3. Start the CLI**

Open another terminal and run:

```bash
node src/cli.js
```

The CLI will prompt you for a GitHub repository URL, check its indexing status, and initiate indexing if necessary.

Once indexing is complete, you can start chatting with your repository.

## API Reference

GitWiki exposes two application API endpoints.

### 1. Index Repository

`POST /api/index`

Initiates the repository indexing workflow.

**Request Body**

```json
{
  "repo": "https://github.com/owner/repository"
}
```

The repository URL is parsed to extract the owner and repository name. GitWiki then triggers the `indexRepo` Inngest function to fetch, chunk, and index the repository.

### 2. Chat with Repository

`POST /api/chat`

Submits a question about an indexed repository.

**Request Body**

```json
{
  "repo": "owner/repository",
  "question": "Explain the authentication flow in this project.",
  "history": [
    {
      "role": "user",
      "content": "What does this repository do?"
    },
    {
      "role": "assistant",
      "content": "This repository implements..."
    }
  ]
}
```

| Field | Description |
|---|---|
| `repo` | Repository identifier |
| `question` | User's question |
| `history` | Previous conversation messages (optional) |

The endpoint triggers the `askQuestionFn` Inngest function, which retrieves relevant repository content and generates an answer.

## Project Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Express server with Nodemon |
| `npm start` | Starts the Express server |
| `node src/cli.js` | Launches the interactive CLI |

## Project Structure

```text
GitWiki/
├── src/
│   ├── cli.js
│   ├── index.js
│   ├── routes/
│   │   ├── index.routes.js
│   │   └── chat.routes.js
│   ├── inngest/
│   │   ├── client.js
|   |   ├── index.js
│   │   └── functions/
│   │       ├── indexRepo.js
│   │       └── askQuestion.js
│   └── services/
│       ├── github.js
│       ├── chunker.js
│       ├── vectorStore.js
│       └── rag.js
├── .env
├── package.json
└── README.md
```



