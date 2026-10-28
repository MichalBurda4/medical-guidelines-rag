# MediRAG

A RAG chatbot for medical guidelines. Upload guideline documents, ask a question, and get a
practical, source-backed answer adapted to the reader's language level (child / teen / adult)
and audience (patient / business).

Requirements and project status: [`docs/requirements.md`](docs/requirements.md).

## Getting started

```bash
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:3001

### Optional: LLM answers

Without configuration, answers are assembled from retrieved passages by templates. To generate
them with OpenAI, set before starting:

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini   # optional, this is the default
```

## Supported files

`.txt`, `.md`, `.csv`, `.pdf`, `.docx` – up to 10 files, 20 MB each.

## Testing

With `npm run dev` running:

```bash
npm run test:hay-fever
```

This **removes all indexed documents**, uploads `sample-guidelines/hay-fever.txt` and checks
answers for each language level and audience.

## Project structure

npm workspaces monorepo. Run all commands from the repo root.

```
packages/
  shared/   @medirag/shared  – types shared by client and server (API contract)
  server/   @medirag/server  – Express API
    src/index.ts               HTTP routes
    src/rag/                   parse → chunk → store → retrieve → generate / profile
  client/   @medirag/client  – React + Vite frontend
sample-guidelines/            test material
scripts/                      end-to-end tests
docs/                         requirements
```

| Command | What it does |
|---|---|
| `npm run dev` | API + web together (`dev:api` / `dev:web` for one side) |
| `npm run typecheck` | Type-check all packages |
| `npm run build` | Type-check + production build of the client |
| `npm run lint` | Lint the whole repo |

Add a dependency to one package with `npm install <pkg> -w @medirag/server` (or `@medirag/client`).

## Limitations

- Documents are kept in memory and lost on restart.
- Retrieval is keyword-based (TF-IDF), not semantic embeddings.
