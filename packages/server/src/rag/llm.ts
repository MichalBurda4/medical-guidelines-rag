import type { LlmAvailability, LlmProvider } from '@medirag/shared'

type CloudProvider = Exclude<LlmProvider, 'template'>

interface CloudConfig {
  baseURL: string
  apiKeyEnv: string
  modelEnv: string
  defaultModel: string
}

const CLOUD: Record<CloudProvider, CloudConfig> = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
  },
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return value === 'template' || value === 'openai' || value === 'deepseek'
}

function cloudKeyPresent(provider: CloudProvider): boolean {
  return Boolean(process.env[CLOUD[provider].apiKeyEnv]?.trim())
}

export function llmAvailability(): LlmAvailability {
  return {
    openai: cloudKeyPresent('openai'),
    deepseek: cloudKeyPresent('deepseek'),
  }
}

export function parseLlmProvider(input: unknown): LlmProvider | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = (input as { llm?: unknown }).llm
  return isLlmProvider(raw) ? raw : undefined
}

export function resolveLlmProvider(requested: LlmProvider | undefined): LlmProvider {
  if (requested === 'template') return 'template'
  if (requested === 'openai') return cloudKeyPresent('openai') ? 'openai' : 'template'
  if (requested === 'deepseek') return cloudKeyPresent('deepseek') ? 'deepseek' : 'template'
  if (cloudKeyPresent('openai')) return 'openai'
  if (cloudKeyPresent('deepseek')) return 'deepseek'
  return 'template'
}

export async function completeChat(
  provider: CloudProvider,
  system: string,
  user: string,
): Promise<string | null> {
  const config = CLOUD[provider]
  const apiKey = process.env[config.apiKeyEnv]?.trim()
  if (!apiKey) return null

  const model = process.env[config.modelEnv]?.trim() || config.defaultModel

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  }
}
