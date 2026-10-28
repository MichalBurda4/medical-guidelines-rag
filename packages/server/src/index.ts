import type { ChatResponse, DocumentsResponse } from '@medirag/shared'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { buildSources, generateAnswerWithOptionalLlm } from './rag/generate.js'
import { parseAnswerProfile } from './rag/profile.js'
import { retrieveChunks } from './rag/retrieve.js'
import { addDocument, getChunks, listDocuments, removeDocument } from './rag/store.js'

const PORT = Number(process.env.PORT ?? 3001)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/documents', (_req, res) => {
  res.json({ documents: listDocuments() } satisfies DocumentsResponse)
})

app.post('/api/documents', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded.' })
      return
    }

    const documents = []
    for (const file of files) {
      const record = await addDocument(file.originalname, file.buffer, file.mimetype)
      documents.push(record)
    }

    res.status(201).json({ documents } satisfies DocumentsResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.'
    res.status(400).json({ error: message })
  }
})

app.delete('/api/documents/:id', (req, res) => {
  const removed = removeDocument(req.params.id)
  if (!removed) {
    res.status(404).json({ error: 'Document not found.' })
    return
  }
  res.json({ ok: true })
})

app.post('/api/chat', async (req, res) => {
  try {
    const question = String(req.body?.question ?? '').trim()
    if (!question) {
      res.status(400).json({ error: 'Question is required.' })
      return
    }

    const allChunks = getChunks()
    if (allChunks.length === 0) {
      res.json({
        answer:
          'No documents are indexed yet. Upload guideline files first, then ask your question again.',
        sources: [],
      } satisfies ChatResponse)
      return
    }

    const profile = parseAnswerProfile(req.body)
    const retrieved = retrieveChunks(question, allChunks, 4)
    const answer = await generateAnswerWithOptionalLlm(question, retrieved, profile)
    res.json({
      answer,
      sources: buildSources(retrieved),
      profile,
    } satisfies ChatResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat failed.'
    res.status(500).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`MediRAG API listening on http://localhost:${PORT}`)
})
