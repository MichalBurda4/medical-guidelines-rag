# MediRAG

A RAG chatbot for medical guidelines. Upload guideline documents, ask a question, and get a
practical, source-backed answer adapted to the reader's language level (child / teen / adult)
and audience (patient / business).

Retrieval runs on **local embeddings** (Ollama) stored in **Chroma**; the answer itself is
written by a cloud LLM (OpenAI or DeepSeek). There is no template/offline answer path — an LLM
key is required.

Requirements and project status: [`docs/requirements.md`](docs/requirements.md).

## Quick start (Docker)

Needs Docker Desktop (or Docker Engine + Compose v2).

```bash
cp .env.example .env
# put OPENAI_API_KEY or DEEPSEEK_API_KEY into that file
npm run docker:up
```

`npm run docker:up` is `docker compose up -d --build --wait`. No `--env-file` flag is needed:
`api` and the `ollama-pull` job both load the repo-root `.env` through `env_file`, and
`ollama-pull` resolves `EMBEDDING_MODEL` inside the container, so the pulled model and the model
the API requests cannot drift apart. Compose also reads that same root `.env` for `${...}`
interpolation, so the image tags below it are configured from one place.

The `.env` is **never** copied into an image: it holds the LLM key, and a copied file stays
readable in the image layers forever (`docker save` → extract → plaintext key).

- Web UI: http://localhost:8080
- API: http://localhost:3001/api/health

The first `up` also pulls the embedding model (`bge-m3`, ~1.1 GB) into the `ollama_models`
volume; expect a few minutes. Later starts reuse it.

`docker compose up --wait` returns a non-zero exit code instead of hanging when a service
cannot become healthy. So does `npm run docker:up`. If that happens, `npm run docker:logs` shows
the reason — the API refuses to start without a reachable Chroma, a pulled embedding model and
an LLM key.

| Service | Role | Exposed |
|---|---|---|
| `web` | nginx serving the built React app, proxying `/api` | `8080` |
| `api` | FastAPI + RAG pipeline | `3001` |
| `chroma` | vector store (chunks + document catalogue) | `127.0.0.1:8000` (debug) |
| `ollama` | local embedding model | `127.0.0.1:11434` (debug) |
| `ollama-pull` | one-shot: pulls `EMBEDDING_MODEL` before `api` starts | – |

### Development with hot reload

```bash
npm run docker:dev
```

`compose.dev.yaml` is a complete stack with the same five services as `compose.yaml`; only
`api` and `web` run in dev mode:

| Service | Production (`compose.yaml`) | Development (`compose.dev.yaml`) |
|---|---|---|
| `api` | image built from source, `uvicorn` | `uvicorn --reload`, `packages/server/app` bind-mounted |
| `web` | nginx serving the built bundle on `8080` | Vite dev server with HMR on `5173` |
| `chroma`, `ollama`, `ollama-pull` | identical | identical (same volumes) |

- Web UI: http://localhost:5173 (HMR for `client/`)
- API reloads on changes in `packages/server/app`

Both files declare `name: medirag`, so they share the `ollama_models` and `chroma_data`
volumes: switching between them neither re-downloads the embedding model nor loses indexed
documents. Stop one stack before starting the other — they publish the same ports.

`VITE_PROXY_TARGET=http://api:3001` is set in the dev file, because `localhost` inside the Vite
container points at the container itself.

### Common commands

| Command | What it does |
|---|---|
| `npm run docker:up` | build + start everything, wait for health |
| `npm run docker:dev` | dev stack (Vite HMR + API reload) |
| `npm run docker:logs` | follow API logs |
| `npm run docker:down` | stop the stack (volumes survive) |
| `docker compose down -v` | stop and **delete** the Chroma data and downloaded models |
| `npm run typecheck` | `tsc -b` over the client |
| `npm run lint` | oxlint over the JS/TS packages |
| `npm run build` | typecheck + production build of the client |
| `npm run test:hay-fever` | end-to-end test against `http://localhost:3001/api` |

`npm run test:hay-fever` **deletes every indexed document**, uploads
`sample-guidelines/hay-fever.txt` and checks each language level and audience, plus the
guardrails: off-topic questions must return no sources, and deleting a document must clear it
from the catalogue.

Configuration comes from the environment only. Under Docker, compose injects the repo-root `.env`
through `env_file`; the API never reads or parses `.env` itself. A host run (`npm run dev`) does
not read it either — export the variables in your shell, or pass
`uv run --env-file ../../.env ...` from `packages/server`.

## How it works

```
parse (txt/md/csv/pdf/docx)
  → chunk (section headings + RecursiveCharacterTextSplitter ~900/150)
  → embed (Ollama /api/embed, bge-m3)
  → Chroma (cosine HNSW, one collection for chunks + one for the catalogue)
  → agent (LangGraph: search → rewrite → search …; similarity = 1 - distance,
    drop below RETRIEVAL_MIN_SCORE)
  → LLM (system prompt carries language level + audience) → answer + sources
```

- **Chunks stay section-scoped.** The heading is kept in the chunk text and in metadata, so
  "Pregnancy" remains searchable and the LLM sees which section a passage came from.
- **Answers are grounded.** When a literal search finds nothing above the similarity threshold the
  agent rewrites the query and searches again (see `RETRIEVAL_MAX_REWRITES`). Only if every attempt
  is empty does the API reply that the documents do not cover the question — **with no sources** —
  instead of asking the LLM to answer from its own knowledge.
- **Sources reflect the prompt.** The returned `sources` are exactly the passages given to the
  LLM, not everything retrieval looked at.
- **Language level and audience are prompt-driven.** No regex rewriting of the answer; the level
  instructions live in `app/rag/profile.py`.

### Tuning retrieval

`RETRIEVAL_MIN_SCORE` (default `0.48`) is the only relevance knob and it is model-specific.
Measured with `bge-m3` on `sample-guidelines/hay-fever.txt`: on-topic questions score
0.537–0.697, off-topic questions (capital of France, broken leg, sourdough…) score 0.242–0.442.
Raise the threshold if off-topic questions come back with sources; lower it if valid questions
are refused. Re-measure after adding real guidelines — a larger corpus shifts the range.
`RETRIEVAL_TOP_K` controls how many passages reach the LLM.

`RETRIEVAL_MAX_REWRITES` (default `2`) is how many times the agent may rephrase the question after
a literal search found nothing above the threshold. Rewriting exists because a question phrased in
user vocabulary ("what operational points matter for hay fever season") can sit just under the
threshold even when the document has a whole section about it — the rewrite moves it from 0.476 to
≈0.71 without lowering the threshold, which would readmit off-topic questions.

### Speed on macOS

Ollama in Docker runs on CPU (no Metal inside the VM), so embedding a large PDF takes tens of
seconds. Options, in order of effort:

1. Give Docker Desktop at least 6 CPUs and 8 GB RAM (`OLLAMA_KEEP_ALIVE=30m` already keeps the
   model warm between requests).
2. Run Ollama natively (`brew install ollama && ollama serve`) and point the API at it:
   `OLLAMA_BASE_URL=http://host.docker.internal:11434`. Embedding gets the full Apple GPU.

## Supported files

`.txt`, `.md`, `.csv`, `.pdf`, `.docx` — up to 10 files, 20 MB each.

## Project structure

```
packages/
  server/   FastAPI + Chroma + Ollama embeddings
    app/main.py              HTTP routes, startup preflight
    app/rag/embed.py         Ollama embedding client
    app/rag/retrieve.py      Chroma client + similarity search
    app/rag/store.py         document catalogue + chunk writes
    app/rag/generate.py      prompt assembly, answer, sources
    app/rag/profile.py       language level / audience system prompt
    app/rag/parse.py         file → text
    app/rag/chunk.py         section-aware chunking
  client/   React + Vite frontend (nginx image in production)
    src/contract.ts          HTTP contract types (mirror of app/models.py)
compose.yaml                 production stack (nginx + built front)
compose.dev.yaml             development stack (same services, hot reload)
sample-guidelines/           test material
scripts/                     end-to-end tests
docs/                        requirements
```

## Limitations

- Documents and vectors persist in Chroma; uploaded files themselves are not stored (only the
  extracted text), so a document cannot be re-chunked without re-uploading it.
- Retrieval is dense-only. An exact keyword or code that the embedding model does not represent
  well (rare drug names, dosages) may rank lower than a semantically similar passage.
- Changing `EMBEDDING_MODEL` switches the collection name; previously indexed documents stay
  in the old collection and are not listed until re-uploaded.
- Chat requires network access to OpenAI/DeepSeek. Embeddings and retrieval are fully local.
