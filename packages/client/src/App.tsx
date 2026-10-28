import { useEffect, useState } from 'react'
import { askQuestion, deleteDocument, fetchDocuments, fetchHealth, uploadDocuments } from './api'
import { ChatPanel } from './components/ChatPanel'
import { DocumentPanel } from './components/DocumentPanel'
import type {
  AudienceProfile,
  ChatMessage,
  DocumentRecord,
  LanguageLevel,
  LlmAvailability,
  LlmProvider,
} from './contract'
import './App.css'

type HealthStatus = 'checking' | 'ready'

function createId(): string {
  return crypto.randomUUID()
}

function pickProvider(availability: LlmAvailability): LlmProvider | null {
  if (availability.openai) return 'openai'
  if (availability.deepseek) return 'deepseek'
  return null
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [languageLevel, setLanguageLevel] = useState<LanguageLevel>('adult')
  const [audience, setAudience] = useState<AudienceProfile>('patient')
  const [llm, setLlm] = useState<LlmProvider | null>(null)
  // `checking` until the first successful /api/health answer, so the UI does not
  // flash "No LLM configured" while the request is still in flight.
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking')
  const [llmAvailability, setLlmAvailability] = useState<LlmAvailability>({
    openai: false,
    deepseek: false,
  })

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let attempt = 0
    let resolved = false

    const retry = () => {
      if (cancelled) return
      // 1s, 2s, 4s, capped at 10s while the API is unreachable.
      const delay = Math.min(1000 * 2 ** attempt, 10_000)
      attempt += 1
      timer = window.setTimeout(checkHealth, delay)
    }

    const checkHealth = () => {
      fetchHealth()
        .then((health) => {
          if (cancelled) return
          const wasResolved = resolved
          resolved = true
          setLlmAvailability(health.llm)
          setLlm(pickProvider(health.llm))
          setHealthStatus('ready')
          // The first health probe failed while the API was starting, so the
          // catalogue was never loaded. Re-sync it now that the API answers.
          if (!wasResolved) {
            fetchDocuments()
              .then((docs) => {
                if (!cancelled) setDocuments(docs)
              })
              .catch(() => {
                // Keep whatever we already show.
              })
          }
        })
        .catch(() => {
          // Without a retry the UI stayed on "No LLM configured" forever after
          // a single failed probe (e.g. the API was still booting).
          retry()
        })
    }

    fetchDocuments()
      .then((docs) => {
        if (!cancelled) setDocuments(docs)
      })
      .catch(() => {
        // API may still be starting; the health retry reloads the catalogue.
      })

    checkHealth()

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  const addDocuments = async (files: FileList | File[]) => {
    if (Array.from(files).length === 0) return
    setUploading(true)
    try {
      const uploaded = await uploadDocuments(files)
      setDocuments((current) => [...uploaded, ...current])
    } catch (error) {
      const content =
        error instanceof Error ? error.message : 'Failed to upload documents.'
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content,
          createdAt: Date.now(),
        },
      ])
    } finally {
      setUploading(false)
    }
  }

  const removeDocument = async (id: string) => {
    try {
      await deleteDocument(id)
      setDocuments((current) => current.filter((doc) => doc.id !== id))
    } catch (error) {
      const content =
        error instanceof Error ? error.message : 'Failed to remove document.'
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content,
          createdAt: Date.now(),
        },
      ])
    }
  }

  const sendMessage = async (text: string) => {
    if (llm === null) return

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }

    setMessages((current) => [...current, userMessage])
    setIsTyping(true)

    try {
      const { answer, sources } = await askQuestion(text, { languageLevel, audience }, llm)
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: answer,
          createdAt: Date.now(),
          sources,
        },
      ])
    } catch (error) {
      const content =
        error instanceof Error
          ? error.message
          : 'Something went wrong while generating an answer.'
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content,
          createdAt: Date.now(),
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="app">
      <DocumentPanel
        documents={documents}
        uploading={uploading}
        languageLevel={languageLevel}
        audience={audience}
        llm={llm}
        llmAvailability={llmAvailability}
        healthStatus={healthStatus}
        onLanguageLevelChange={setLanguageLevel}
        onAudienceChange={setAudience}
        onLlmChange={setLlm}
        onAdd={addDocuments}
        onRemove={removeDocument}
      />
      <ChatPanel
        messages={messages}
        isTyping={isTyping}
        documentCount={documents.length}
        languageLevel={languageLevel}
        audience={audience}
        llm={llm}
        healthStatus={healthStatus}
        onSend={sendMessage}
      />
    </div>
  )
}
