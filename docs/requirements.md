# Requirements – Project 10: RAG chatbot for medical guideline analysis

## 1. Purpose

An interactive chatbot built on a RAG (Retrieval-Augmented Generation) architecture, with an
interface that lets users add their own documents.

The main goal is to move away from simply summarising study methodology towards **extracting
practical results and concrete answers** to the user's questions.

## 2. Focus areas and target groups

### Key analysis areas (Phase I)

- **Side effects** – safety of the drug / therapy
- **Adherence** – following recommendations and the treatment plan
- **Patient age** – differences by age group
- **Pregnancy** – considerations and safety
- **Effect** – how quickly symptoms resolve

### Stakeholders

- Patients
- Business staff

### Language levels

- Child
- High-school student
- Adult

## 3. Milestones for the next meeting

| # | Task | Status | Where |
|---|---|---|---|
| 1 | Simple UI: working chat view with file upload | Done | `packages/client/src/components/ChatPanel.tsx`, `DocumentPanel.tsx` |
| 2 | RAG module: retrieve context from documents, generate result-oriented answers | Done | `packages/server/app/rag/` (FastAPI + Chroma + Ollama embeddings) |
| 3 | Multi-level language: adapt answers to age group (child / teen / adult) | Done | `packages/server/app/rag/profile.py` (system prompt) |
| 4 | Audience profiling: adapt message format for patients and business | Done | `packages/server/app/rag/profile.py` (system prompt) |
| 5 | Test on the provided hay-fever materials | Done | `sample-guidelines/hay-fever.txt`, `npm run test:hay-fever` |
| 6 | Containerisation: front, back, vector store and embedding service | Done | `compose.yaml`, `compose.dev.yaml`, `packages/*/Dockerfile` |

## 4. Architecture decisions

- Retrieval uses **local embeddings**: Ollama `/api/embed` with `bge-m3`, so no embedding
  provider is contacted and no API key is needed for retrieval.
- Vectors are stored in **Chroma** (separate compose service, persistent volume). The document
  catalogue lives in Chroma too, so a restart no longer loses the document list.
- Similarity is cosine (`1 - Chroma distance`); a single threshold `RETRIEVAL_MIN_SCORE` decides
  whether the documents answer the question at all.
- Retrieval is a **LangGraph agent**: the vector query is a tool, and when a literal search finds
  nothing above the threshold the graph rewrites the question and searches again
  (`RETRIEVAL_MAX_REWRITES`, default 2) before refusing. Rewriting rephrases only — it never adds
  facts — which fixes vocabulary mismatch without weakening the threshold.
- Answers require an LLM (`openai` or `deepseek`). The previous template path and the BM25
  lexical retrieval were removed: both relied on hardcoded domain word lists and could not
  generalise to arbitrary uploaded guidelines.
- Everything runs through Docker Compose; the API refuses to start without Chroma, the embedding
  model and an LLM key.

## 5. Open points

- No cross-encoder reranking; the top-k of a single dense retrieval is used directly.
- Uploaded files themselves are not stored, only the extracted text and its vectors.
- Language level and audience quality depend on the LLM following the system prompt; there is no
  automated linguistic evaluation.
