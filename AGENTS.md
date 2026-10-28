# MediRAG – medical guideline RAG chatbot

University project (Development Workshop, Project 10). Full requirements: `docs/requirements.md`.

## Goal

Answer user questions from uploaded medical guidelines. Extract **practical results and concrete
answers**, not summaries of study methodology.

Phase I focus areas – prioritise these in retrieval hints, answer selection and prompts:
side effects / safety · adherence · patient age · pregnancy · speed of symptom relief.

## Answer profiles

- `languageLevel`: `child` (~8–11 y) | `teen` (high school) | `adult`
- `audience`: `patient` (actionable guidance) | `business` (decision brief)

Do not add a third audience without an explicit request.

## Architecture

Monorepo with a TypeScript client and a Python API, run with Docker Compose.

- `packages/server` (`@medirag/server`) – FastAPI on port 3001
  - `GET/POST /api/documents`, `DELETE /api/documents/:id`, `POST /api/chat`, `GET /api/health`
  - `app/rag/`: parse → chunk (LangChain splitter) → embed (Ollama) → store (Chroma)
    → retrieve (cosine similarity) → agent (LangGraph) → generate / profile
  - `app/rag/agent.py` is a LangGraph state machine: `retrieve` is the only tool, and when no
    passage clears `RETRIEVAL_MIN_SCORE` the graph rewrites the question (`rag/rewrite.py`) and
    retrieves again, up to `RETRIEVAL_MAX_REWRITES` (default 2) before refusing.
  - Managed with `uv` (`pyproject.toml`). Config in `.env` at the repo root.
- `packages/client` (`@medirag/client`) – React 19 + Vite; Vite proxies `/api` in dev,
  nginx proxies `/api` in production.
- Services in `compose.yaml`: `web` (nginx), `api`, `chroma`, `ollama`, `ollama-pull`.
  `compose.dev.yaml` declares the same five services, with `api` (`uvicorn --reload` + mounted
  `app/`) and `web` (Vite HMR + mounted repo) in dev mode; both files share `name: medirag`
  and therefore the same volumes.

The **LLM is required**: `openai` or `deepseek`. There is no template/offline answer path.
Keys: `OPENAI_API_KEY` (model `OPENAI_MODEL`, default `gpt-4o-mini`) and `DEEPSEEK_API_KEY`
(model `DEEPSEEK_MODEL`, default `deepseek-chat`). Missing key, HTTP error or empty content is
reported as 503/502 — never silently replaced.
`GET /api/health` reports `{ ok, llm: { openai, deepseek }, embeddings: { model, dim, ready } }`.

Embeddings are local and free: Ollama `/api/embed` with `EMBEDDING_MODEL` (default `bge-m3`).
Vectors live in Chroma (`CHROMA_URL`); the collection name is derived from the model, so switching
models never reuses vectors of a different dimension.

Anything that crosses the HTTP boundary must match
`packages/client/src/contract.ts` / `app/models.py`. Nothing generates one from the other, so a
field change on the Python side has to be mirrored in `contract.ts` by hand.
Python deps: edit `packages/server/pyproject.toml`, then `uv sync` in that folder.
Frontend deps: `npm install <pkg> -w @medirag/client`.

## Commands (run from the repo root)

Docker is the supported way to run the project:

- `npm run docker:up` – build + start the stack, wait for health
  (`docker compose up -d --build --wait`; the repo-root `.env` is loaded by the `api` and
  `ollama-pull` services through `env_file`, so no `--env-file` flag is involved)
- `npm run docker:dev` – hot reload: Vite on :5173, uvicorn `--reload`
- `npm run docker:logs` – follow API logs
- `npm run docker:down` – stop the stack; `docker compose down -v` also wipes Chroma + models
- `npm run test:hay-fever` – end-to-end test against a running API. **Deletes all indexed documents.**
- `npm run typecheck` – `tsc -b` over the client
- `npm run build` – typecheck + Vite production build
- `npm run lint` – oxlint over the JS/TS packages

Local `npm run dev` still works for a quick check, but requires Ollama and Chroma on the host
and is not the documented path. It does not read `.env`: export the variables in your shell
(or pass `uv run --env-file ../../.env ...`) — the API never parses `.env` itself.

## Ground rules

- Answers must be grounded in retrieved context only; never add medical facts that are not in
  the documents.
- Patient-facing output keeps a safety / "not a diagnosis" reminder.
- Always return sources alongside the answer, and only the passages actually sent to the LLM.
- Never reintroduce a template answer, a BM25/lexical fallback, or hardcoded domain word lists
  (stopwords, intent boosts, term substitutions). Those were removed for a reason. Query rewriting
  is the sanctioned way to improve a weak match: the LLM rephrases, it never adds facts, and the
  similarity threshold stays untouched.
- After changing retrieval, generation or profiles, run `npm run test:hay-fever`.
