import { useRef, useState, type DragEvent } from 'react'
import type {
  AudienceProfile,
  DocumentRecord,
  LanguageLevel,
  LlmAvailability,
  LlmProvider,
} from '../contract'
import { ProfileControls } from './ProfileControls'

export type HealthStatus = 'checking' | 'ready'

interface DocumentPanelProps {
  documents: DocumentRecord[]
  uploading: boolean
  languageLevel: LanguageLevel
  audience: AudienceProfile
  llm: LlmProvider | null
  llmAvailability: LlmAvailability
  healthStatus: HealthStatus
  onLanguageLevelChange: (value: LanguageLevel) => void
  onAudienceChange: (value: AudienceProfile) => void
  onLlmChange: (value: LlmProvider) => void
  onAdd: (files: FileList | File[]) => void
  onRemove: (id: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentPanel({
  documents,
  uploading,
  languageLevel,
  audience,
  llm,
  llmAvailability,
  healthStatus,
  onLanguageLevelChange,
  onAudienceChange,
  onLlmChange,
  onAdd,
  onRemove,
}: DocumentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    if (event.dataTransfer.files.length > 0) {
      onAdd(event.dataTransfer.files)
    }
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <span>+</span>
          MediRAG
        </div>
        <p>RAG chatbot for medical guideline analysis</p>
      </div>

      <div
        className={`upload-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <strong>{uploading ? 'Indexing…' : 'Add documents'}</strong>
        <span>PDF, TXT, DOCX, MD — drag & drop or click</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.docx,.md,.csv"
          disabled={uploading}
          onChange={(event) => {
            if (event.target.files) {
              onAdd(event.target.files)
              event.target.value = ''
            }
          }}
        />
      </div>

      <ProfileControls
        languageLevel={languageLevel}
        audience={audience}
        llm={llm}
        llmAvailability={llmAvailability}
        healthStatus={healthStatus}
        onLanguageLevelChange={onLanguageLevelChange}
        onAudienceChange={onAudienceChange}
        onLlmChange={onLlmChange}
      />

      <section className="docs-section">
        <h2>Loaded files ({documents.length})</h2>
        {documents.length === 0 ? (
          <p className="empty-docs">
            No documents yet. Upload guidelines so the chatbot can retrieve context from them.
          </p>
        ) : (
          <ul className="docs-list">
            {documents.map((doc) => (
              <li key={doc.id} className="doc-item">
                <span className="name">{doc.name}</span>
                <span className="meta">
                  {formatSize(doc.size)}
                  {doc.chunkCount != null ? ` · ${doc.chunkCount} chunks` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(doc.id)}
                  aria-label={`Remove ${doc.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
