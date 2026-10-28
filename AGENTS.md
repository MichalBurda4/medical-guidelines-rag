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

npm workspaces monorepo – three packages under `packages/`:

- `packages/shared` (`@medirag/shared`) – types used by both sides: profiles, `DocumentRecord`,
  `ChatSource`, API request/response shapes. Types only, no runtime code, no build step.
- `packages/server` (`@medirag/server`) – Express 5 API on port 3001, run with `tsx`
  - `GET/POST /api/documents`, `DELETE /api/documents/:id`, `POST /api/chat`, `GET /api/health`
  - `src/rag/`: `parse` → `chunk` → `store` (in-memory) → `retrieve` (TF-IDF) → `generate` / `profile`
- `packages/client` (`@medirag/client`) – React 19 + Vite frontend; Vite proxies `/api` to :3001
- LLM is optional. Chat body field `llm`: `template` | `openai` | `deepseek`.
  Keys: `OPENAI_API_KEY` (model `OPENAI_MODEL`, default `gpt-4o-mini`) and
  `DEEPSEEK_API_KEY` (model `DEEPSEEK_MODEL`, default `deepseek-chat`).
  Missing key, HTTP error or empty content always falls back to the template path.
  `GET /api/health` reports `{ ok, llm: { openai, deepseek } }` so the UI can disable missing providers.

Anything that crosses the HTTP boundary goes in `@medirag/shared`, never duplicated per side.
Add a dependency to the package that uses it: `npm install <pkg> -w @medirag/server`.

## Commands (run from the repo root)

- `npm run dev` – API + web together (`dev:api` / `dev:web` for one side)
- `npm run typecheck` – `tsc -b` over all three packages
- `npm run build` – typecheck + Vite production build
- `npm run lint` – oxlint over the whole repo
- `npm run test:hay-fever` – end-to-end test against a running API. **Deletes all indexed documents.**

## Ground rules

- Answers must be grounded in retrieved context only; never add medical facts that are not in the documents.
- Patient-facing output keeps a safety / "not a diagnosis" reminder.
- Always return sources alongside the answer.
- After changing retrieval, generation or profiles, run `npm run test:hay-fever`.
