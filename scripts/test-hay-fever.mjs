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
  if (!health.ok) throw new Error('API is not reachable. Start it with `docker compose up -d`.')
  const healthBody = await health.json()

  if (healthBody.ok !== true) throw new Error('GET /api/health must return { ok: true }.')
  if (typeof healthBody.llm?.openai !== 'boolean' || typeof healthBody.llm?.deepseek !== 'boolean') {
    throw new Error('GET /api/health must return llm: { openai, deepseek } booleans.')
  }
  if (healthBody.embeddings?.ready !== true) {
    throw new Error(
      `Embedding model is not ready (model: ${healthBody.embeddings?.model ?? 'unknown'}). ` +
        'Check that Ollama is running and the model is pulled.',
    )
  }

  const provider = healthBody.llm.openai ? 'openai' : healthBody.llm.deepseek ? 'deepseek' : null
  if (provider === null) {
    throw new Error('No LLM configured. Set OPENAI_API_KEY or DEEPSEEK_API_KEY.')
  }
  console.log(`LLM: ${provider} · embeddings: ${healthBody.embeddings.model}`)

  // The test owns the whole index: start from empty so leftovers cannot make
  // an assertion pass on stale data.
  const existing = await (await fetch(`${API}/documents`)).json()
  for (const doc of existing.documents ?? []) {
    await fetch(`${API}/documents/${doc.id}`, { method: 'DELETE' })
  }
  const afterCleanup = await (await fetch(`${API}/documents`)).json()
  if ((afterCleanup.documents ?? []).length !== 0) {
    throw new Error('Cleanup failed: documents are still indexed.')
  }

  const file = await readFile(samplePath)
  const form = new FormData()
  form.append('files', new Blob([file], { type: 'text/plain' }), 'hay-fever.txt')

  const uploadResponse = await fetch(`${API}/documents`, { method: 'POST', body: form })
  const uploaded = await uploadResponse.json()
  if (!uploadResponse.ok) throw new Error(uploaded.error || 'Upload failed')
  const record = uploaded.documents[0]
  console.log(`Indexed ${record.name} (${record.chunkCount} chunks)`)

  if (!record.chunkCount || record.chunkCount < 1) {
    throw new Error('Uploaded document has no chunks.')
  }

  const cases = [
    {
      name: 'Child language — side effects',
      body: {
        question: 'What are the side effects of nose steroid sprays?',
        languageLevel: 'child',
        audience: 'patient',
      },
      expect: [/nose|bleed|stuffy|sleep|doctor|grown-?up/i],
    },
    {
      name: 'Teen language — speed of relief',
      body: {
        question: 'How fast do antihistamines help hay fever symptoms?',
        languageLevel: 'teen',
        audience: 'patient',
      },
      expect: [/hour|minute|day|fast|quick|relief/i],
    },
    {
      name: 'Adult patient — pregnancy safety',
      body: {
        question: 'Is treatment safe in pregnancy?',
        languageLevel: 'adult',
        audience: 'patient',
      },
      expect: [/pregnan|budesonide|saline|decongestant/i],
    },
    {
      name: 'Adult patient — adherence',
      body: {
        question: 'Why does adherence matter for intranasal steroids?',
        languageLevel: 'adult',
        audience: 'patient',
      },
      expect: [/adheren|technique|regular|pollen|week/i],
    },
    {
      name: 'Business audience — decision brief',
      // `audience` changes the answer format, not which documents answer. This
      // case checks the brief structure on a question that retrieves directly;
      // the operational-question case below covers the rewrite path.
      body: {
        question: 'What are the key safety points for pregnant patients?',
        languageLevel: 'adult',
        audience: 'business',
      },
      expect: [/outcome|risk|operational|pregnan|safety|budesonide/i],
    },
    {
      // The literal query lands at ~0.47 (below RETRIEVAL_MIN_SCORE); the agent
      // must rewrite it towards service-delivery wording instead of refusing.
      // Before the LangGraph rewrite loop this case returned "could not find
      // relevant context", which made the business profile unusable.
      name: 'Business audience — operational question is answered via rewrite',
      body: {
        question: 'What operational points matter for hay fever season?',
        languageLevel: 'adult',
        audience: 'business',
      },
      expect: [/operational|stock|staff|demand|education|pregnan|risk/i],
    },
    {
      // Retrieval must not invent confidence when nothing matches.
      name: 'Guardrail — off-topic question is refused',
      body: {
        question: 'What is the capital of France?',
        languageLevel: 'adult',
        audience: 'patient',
      },
      expect: [/could not find relevant context/i],
      sources: 'none',
    },
    {
      name: 'Guardrail — unrelated medical question is refused',
      body: {
        question: 'How do I treat a broken leg?',
        languageLevel: 'adult',
        audience: 'patient',
      },
      expect: [/could not find relevant context/i],
      sources: 'none',
    },
  ]

  let failed = 0
  for (const testCase of cases) {
    const result = await postJson(`${API}/chat`, testCase.body)
    const text = `${result.answer}\n${JSON.stringify(result.sources ?? [])}`
    const expectationsOk = (testCase.expect ?? []).every((pattern) => pattern.test(text))
    const sourceCount = result.sources?.length ?? 0
    const sourcesOk = testCase.sources === 'none' ? sourceCount === 0 : sourceCount > 0

    // The refusal path never calls an LLM; every other path must report one.
    const llmOk = testCase.sources === 'none' ? result.llm === null : result.llm === provider

    const pass = expectationsOk && sourcesOk && llmOk
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${testCase.name}`)
    if (!pass) {
      failed += 1
      console.log(`  answer preview: ${result.answer.slice(0, 240).replace(/\n/g, ' / ')}`)
      console.log(`  sources: ${sourceCount}  llm: ${result.llm}`)
      if (!expectationsOk) console.log('  missing expected pattern')
      if (!sourcesOk) console.log('  source count outside expectation')
      if (!llmOk) console.log(`  expected llm: ${testCase.sources === 'none' ? 'null' : provider}`)
    }
  }

  // Deleting must remove both the chunk collection rows and the catalogue row.
  const deleteResponse = await fetch(`${API}/documents/${record.id}`, { method: 'DELETE' })
  if (!deleteResponse.ok) throw new Error('DELETE /api/documents/:id failed.')
  const remaining = await (await fetch(`${API}/documents`)).json()
  if ((remaining.documents ?? []).length !== 0) {
    failed += 1
    console.log('FAIL  Document delete did not clear the catalogue')
  } else {
    console.log('PASS  Document delete clears the catalogue')
  }

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`)
    process.exit(1)
  }

  console.log('\nAll hay-fever tests passed.')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
