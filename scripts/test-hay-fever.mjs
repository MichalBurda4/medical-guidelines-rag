import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API = process.env.API_URL ?? 'http://localhost:3001/api'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const samplePath = path.join(root, 'sample-guidelines', 'hay-fever.txt')

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}

async function main() {
  const health = await fetch(`${API}/health`)
  if (!health.ok) throw new Error('API is not reachable. Start with npm run dev.')

  const existing = await (await fetch(`${API}/documents`)).json()
  for (const doc of existing.documents ?? []) {
    await fetch(`${API}/documents/${doc.id}`, { method: 'DELETE' })
  }

  const file = await readFile(samplePath)
  const form = new FormData()
  form.append('files', new Blob([file], { type: 'text/plain' }), 'hay-fever.txt')

  const uploadResponse = await fetch(`${API}/documents`, { method: 'POST', body: form })
  const uploaded = await uploadResponse.json()
  if (!uploadResponse.ok) throw new Error(uploaded.error || 'Upload failed')

  console.log(`Indexed ${uploaded.documents[0].name} (${uploaded.documents[0].chunkCount} chunks)`)

  const cases = [
    {
      name: 'Point 3 — child language',
      body: {
        question: 'What are the side effects of nose steroid sprays?',
        languageLevel: 'child',
        audience: 'patient',
      },
      expect: [/simple answer|grown-up|nose steroid spray|nosebleeds/i],
    },
    {
      name: 'Point 3 — teen language',
      body: {
        question: 'How fast do antihistamines help hay fever symptoms?',
        languageLevel: 'teen',
        audience: 'patient',
      },
      expect: [/plain language|1–3 hours|minutes|pollen season/i],
    },
    {
      name: 'Point 4 — business profile',
      body: {
        question: 'What operational points matter for hay fever season?',
        languageLevel: 'adult',
        audience: 'business',
      },
      expect: [/Decision brief|Key outcomes|Operational notes/i],
    },
    {
      name: 'Point 5 — pregnancy safety on hay fever materials',
      body: {
        question: 'Is treatment safe in pregnancy?',
        languageLevel: 'adult',
        audience: 'patient',
      },
      expect: [/pregnan|budesonide|saline|decongestant/i],
    },
    {
      name: 'Point 5 — adherence on hay fever materials',
      body: {
        question: 'Why does adherence matter for intranasal steroids?',
        languageLevel: 'adult',
        audience: 'patient',
      },
      expect: [/adherence|spray technique|pollen season|1–2 weeks/i],
    },
  ]

  let failed = 0
  for (const testCase of cases) {
    const result = await postJson(`${API}/chat`, testCase.body)
    const text = `${result.answer}\n${JSON.stringify(result.sources ?? [])}`
    const ok = testCase.expect.every((pattern) => pattern.test(text))
    const sourceOk = (result.sources?.length ?? 0) > 0
    const pass = ok && sourceOk
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${testCase.name}`)
    if (!pass) {
      failed += 1
      console.log(`  answer preview: ${result.answer.slice(0, 220).replace(/\n/g, ' / ')}`)
      console.log(`  sources: ${result.sources?.length ?? 0}`)
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`)
    process.exit(1)
  }

  console.log('\nAll hay-fever profile tests passed.')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
