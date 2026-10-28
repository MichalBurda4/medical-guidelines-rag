import { useEffect, useState } from 'react'
import { askQuestion, deleteDocument, fetchDocuments, fetchHealth, uploadDocuments } from './api'
import { ChatPanel } from './components/ChatPanel'
import { DocumentPanel } from './components/DocumentPanel'
import type {
  AudienceProfile,
  DocumentRecord,
  LanguageLevel,
  LlmAvailability,
  LlmProvider,
} from '@medirag/shared'
import type { ChatMessage } from './types'
import './App.css'

function createId(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [languageLevel, setLanguageLevel] = useState<LanguageLevel>('adult')
  const [audience, setAudience] = useState<AudienceProfile>('patient')
  const [llm, setLlm] = useState<LlmProvider>('template')
  const [llmAvailability, setLlmAvailability] = useState<LlmAvailability>({
    openai: false,
    deepseek: false,
  })

  useEffect(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch(() => {
        // API may still be starting; UI remains usable.
      })

    fetchHealth()
      .then((health) => {
        setLlmAvailability(health.llm)
      })
      .catch(() => {
        // Same as documents: UI stays on the template fallback.
      })
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
        onSend={sendMessage}
      />
    </div>
  )
}
