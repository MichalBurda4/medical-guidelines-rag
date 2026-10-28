import type { ChatSource } from '@medirag/shared'

export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: number
  sources?: ChatSource[]
}
