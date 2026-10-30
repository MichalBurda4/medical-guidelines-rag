import type {
  AnswerProfile,
  ApiError,
  ChatRequest,
  ChatResponse,
  DocumentRecord,
  DocumentsResponse,
  HealthResponse,
  LlmProvider,
} from './contract'

const API_BASE = '/api'

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as Partial<ApiError>
    return data.error || `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as HealthResponse
}

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const response = await fetch(`${API_BASE}/documents`)
  if (!response.ok) throw new Error(await readError(response))
  const data = (await response.json()) as DocumentsResponse
  return data.documents
}

export async function uploadDocuments(files: FileList | File[]): Promise<DocumentRecord[]> {
  const form = new FormData()
  for (const file of Array.from(files)) {
    form.append('files', file)
  }

  const response = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new Error(await readError(response))
  const data = (await response.json()) as DocumentsResponse
  return data.documents
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readError(response))
}

export async function askQuestion(
  question: string,
  profile: AnswerProfile,
  llm: LlmProvider,
): Promise<ChatResponse> {
  const body: ChatRequest = {
    question,
    languageLevel: profile.languageLevel,
    audience: profile.audience,
    llm,
  }
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as ChatResponse
}
