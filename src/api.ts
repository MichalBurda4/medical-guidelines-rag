import type { AnswerProfile, SourceSnippet, UploadedDocument } from './types'

const API_BASE = '/api'

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export async function fetchDocuments(): Promise<UploadedDocument[]> {
  const response = await fetch(`${API_BASE}/documents`)
  if (!response.ok) throw new Error(await readError(response))
  const data = (await response.json()) as { documents: UploadedDocument[] }
  return data.documents
}

export async function uploadDocuments(files: FileList | File[]): Promise<UploadedDocument[]> {
  const form = new FormData()
  for (const file of Array.from(files)) {
    form.append('files', file)
  }

  const response = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new Error(await readError(response))
  const data = (await response.json()) as { documents: UploadedDocument[] }
  return data.documents
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await readError(response))
}

export async function askQuestion(
  question: string,
  profile: AnswerProfile,
): Promise<{
  answer: string
  sources: SourceSnippet[]
}> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      languageLevel: profile.languageLevel,
      audience: profile.audience,
    }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json()) as { answer: string; sources: SourceSnippet[] }
}
