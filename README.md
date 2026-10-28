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

```
server/
  index.ts        Express API
  rag/            parse → chunk → store → retrieve → generate / profile
src/              React frontend
sample-guidelines/ test material
scripts/          end-to-end tests
docs/             requirements
```

## Limitations

- Documents are kept in memory and lost on restart.
- Retrieval is keyword-based (TF-IDF), not semantic embeddings.
