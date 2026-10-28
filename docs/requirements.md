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
- Third group – **to be decided**

### Language levels

- Child
- High-school student
- Adult

## 3. Milestones for the next meeting

| # | Task | Status | Where |
|---|---|---|---|
| 1 | Simple UI: working chat view with file upload | Done | `src/components/ChatPanel.tsx`, `DocumentPanel.tsx` |
| 2 | RAG module: retrieve context from documents, generate result-oriented answers | Done | `server/rag/` |
| 3 | Multi-level language: adapt answers to age group (child / teen / adult) | Done | `server/rag/profile.ts` |
| 4 | Audience profiling: adapt message format for patients and business | Done | `server/rag/profile.ts` |
| 5 | Test on the provided hay-fever materials | Done | `sample-guidelines/hay-fever.txt`, `npm run test:hay-fever` |

## 4. Open points

- Define the third stakeholder group.
- Retrieval is keyword-based TF-IDF; no embeddings or vector database yet.
- Documents are stored in memory only and are lost on server restart.
