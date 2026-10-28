import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { AudienceProfile, ChatMessage, LanguageLevel, LlmProvider } from '../contract'

interface ChatPanelProps {
  messages: ChatMessage[]
  isTyping: boolean
  documentCount: number
  languageLevel: LanguageLevel
  audience: AudienceProfile
  llm: LlmProvider | null
  healthStatus: 'checking' | 'ready'
  onSend: (text: string) => void
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Models answer with light Markdown (`**Key outcomes**`). The bubble preserves
// newlines via `white-space: pre-wrap`, so only inline emphasis needs mapping —
// everything else stays plain text and is escaped by React.
function renderInlineMarkdown(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
  )
}

function profileLabel(
  languageLevel: LanguageLevel,
  audience: AudienceProfile,
  llm: LlmProvider | null,
  healthStatus: 'checking' | 'ready',
): string {
  const level =
    languageLevel === 'child' ? 'Child' : languageLevel === 'teen' ? 'Teen' : 'Adult'
  const who = audience === 'business' ? 'Business' : 'Patient'
  const model =
    llm === 'openai'
      ? 'OpenAI'
      : llm === 'deepseek'
        ? 'DeepSeek'
        : healthStatus === 'checking'
          ? 'Connecting'
          : 'No LLM'
  return `${level} · ${who} · ${model}`
}

export function ChatPanel({
  messages,
  isTyping,
  documentCount,
  languageLevel,
  audience,
  llm,
  healthStatus,
  onSend,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || isTyping || llm === null) return
    onSend(text)
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div>
          <h1>Guideline chat</h1>
          <p>Ask a question — answers are grounded in retrieved document context</p>
        </div>
        <div className="header-badges">
          <div className="status-pill">{profileLabel(languageLevel, audience, llm, healthStatus)}</div>
          <div className="status-pill muted">
            {documentCount === 0
              ? 'No documents'
              : `${documentCount} ${documentCount === 1 ? 'document' : 'documents'}`}
          </div>
        </div>
      </header>

      <div className="messages" aria-live="polite">
        {messages.length === 0 && !isTyping ? (
          <div className="welcome">
            <h2>Start with a question</h2>
            <p>
              Upload hay fever or other guideline files on the left, set language level and
              audience, then ask about side effects, adherence, age, pregnancy, or symptom relief.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div>
                <div className="bubble">{renderInlineMarkdown(message.content)}</div>
                {message.sources && message.sources.length > 0 && (
                  <div className="sources">
                    <span className="sources-label">Sources</span>
                    {message.sources.map((source, index) => (
                      <div key={`${message.id}-src-${index}`} className="source-item">
                        <strong>{source.documentName}</strong>
                        <span>score {source.score.toFixed(2)}</span>
                        <p>{source.excerpt}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="message-meta">{formatTime(message.createdAt)}</div>
              </div>
            </article>
          ))
        )}

        {isTyping && (
          <article className="message assistant">
            <div className="bubble">
              <span className="typing" aria-label="Assistant is typing">
                <i /><i /><i />
              </span>
            </div>
          </article>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            llm !== null
              ? 'Ask about the guidelines…'
              : healthStatus === 'checking'
                ? 'Connecting to the API…'
                : 'Configure an LLM key in .env at the repo root to ask questions…'
          }
          rows={1}
          aria-label="Message"
          disabled={llm === null}
        />
        <button type="submit" disabled={!draft.trim() || isTyping || llm === null}>
          Send
        </button>
      </form>
    </section>
  )
}
