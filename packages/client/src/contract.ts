// HTTP contract with the FastAPI backend.
//
// These types mirror `packages/server/app/models.py` and nothing generates them
// automatically, so a change on the Python side must be reflected here by hand.
// They are the only description of the API this app trusts.

export type LanguageLevel = 'child' | 'teen' | 'adult'
export type AudienceProfile = 'patient' | 'business'
export type LlmProvider = 'openai' | 'deepseek'

export interface AnswerProfile {
  languageLevel: LanguageLevel
  audience: AudienceProfile
}

export interface LlmAvailability {
  openai: boolean
  deepseek: boolean
}

export interface EmbeddingInfo {
  model: string
  dim: number | null
  ready: boolean
}

export interface HealthResponse {
  ok: true
  llm: LlmAvailability
  embeddings: EmbeddingInfo
}

export interface DocumentRecord {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: number
  chunkCount: number
}

export interface ChatSource {
  documentName: string
  excerpt: string
  score: number
}

export interface ChatRequest extends Partial<AnswerProfile> {
  question: string
  llm?: LlmProvider
}

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
  profile?: AnswerProfile
  /** Null only for the "no relevant context" refusal, which never reaches an LLM. */
  llm: LlmProvider | null
}

export interface DocumentsResponse {
  documents: DocumentRecord[]
}

export interface DeleteResponse {
  ok: true
}

export interface ApiError {
  error: string
}

// ── UI-only types ─────────────────────────────────────────────────────────────
// These never cross the HTTP boundary; they exist only inside the client.

export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: number
  sources?: ChatSource[]
}
