import type { AnswerProfile, AudienceProfile, LanguageLevel } from '../types.js'

const LANGUAGE_LEVELS = new Set<LanguageLevel>(['child', 'teen', 'adult'])
const AUDIENCES = new Set<AudienceProfile>(['patient', 'business'])

const SIMPLE_TERMS: Array<[RegExp, string]> = [
  [/\bintranasal corticosteroids?\b/gi, 'nose steroid spray'],
  [/\bintranasal steroids?\b/gi, 'nose steroid spray'],
  [/\bintranasal antihistamines?\b/gi, 'nose antihistamine spray'],
  [/\bcorticosteroids?\b/gi, 'steroid medicine'],
  [/\bantihistamines?\b/gi, 'allergy medicine'],
  [/\bepistaxis\b/gi, 'nosebleeds'],
  [/\bdrowsiness\b/gi, 'feeling sleepy'],
  [/\bsedation\b/gi, 'sleepiness'],
  [/\bcongestion\b/gi, 'stuffy nose'],
  [/\brhinitis medicamentosa\b/gi, 'worse stuffy nose from overusing spray'],
  [/\brebound congestion\b/gi, 'stuffy nose that comes back worse'],
  [/\badherence\b/gi, 'taking medicine as told'],
  [/\bpediatric\b/gi, 'for children'],
  [/\ballergen avoidance\b/gi, 'staying away from things that trigger allergies'],
  [/\bsaline irrigation\b/gi, 'rinsing the nose with salt water'],
  [/\bmonotherapy\b/gi, 'using only one medicine'],
  [/\bcombination therapy\b/gi, 'using two medicines together'],
  [/\bsystemic decongestants?\b/gi, 'decongestant pills'],
  [/\btopical nasal decongestants?\b/gi, 'nose decongestant spray'],
  [/\bfirst-generation\b/gi, 'older-type'],
  [/\bsecond-generation\b/gi, 'newer-type'],
  [/\bmoderate-severe\b/gi, 'medium to strong'],
  [/\befficacy\b/gi, 'how well it works'],
  [/\bcontraindicat(?:ion|ed)\b/gi, 'should not be used'],
]

const TEEN_TERMS: Array<[RegExp, string]> = [
  [/\bintranasal corticosteroids?\b/gi, 'steroid nose sprays'],
  [/\bepistaxis\b/gi, 'nosebleeds (epistaxis)'],
  [/\brhinitis medicamentosa\b/gi, 'rebound congestion from overusing decongestant sprays'],
  [/\badherence\b/gi, 'sticking to the treatment plan'],
  [/\bmonotherapy\b/gi, 'one medicine alone'],
  [/\bcombination therapy\b/gi, 'two medicines together'],
]

export function parseAnswerProfile(input: unknown): AnswerProfile {
  const raw = (input ?? {}) as Partial<AnswerProfile>
  const languageLevel = LANGUAGE_LEVELS.has(raw.languageLevel as LanguageLevel)
    ? (raw.languageLevel as LanguageLevel)
    : 'adult'
  const audience = AUDIENCES.has(raw.audience as AudienceProfile)
    ? (raw.audience as AudienceProfile)
    : 'patient'
  return { languageLevel, audience }
}

function applyTerms(text: string, terms: Array<[RegExp, string]>): string {
  return terms.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text)
}

function simplifyForLevel(text: string, level: LanguageLevel): string {
  if (level === 'child') {
    return applyTerms(text, SIMPLE_TERMS)
      .replace(/\bpatients?\b/gi, 'people')
      .replace(/\bclinicians?\b/gi, 'doctors')
      .replace(/\btherapy\b/gi, 'treatment')
      .replace(/\bsymptoms?\b/gi, 'allergy feelings')
  }
  if (level === 'teen') {
    return applyTerms(text, TEEN_TERMS)
  }
  return text
}

function shortenForChild(findings: string[]): string[] {
  return findings.slice(0, 3).map((finding) => {
    const simplified = simplifyForLevel(finding, 'child')
    const firstStop = simplified.search(/[.!?]/)
    if (firstStop > 20 && firstStop < 140) {
      return simplified.slice(0, firstStop + 1)
    }
    return simplified.length > 140 ? `${simplified.slice(0, 137)}...` : simplified
  })
}

export function formatProfiledAnswer(
  question: string,
  findings: string[],
  documentNames: string[],
  profile: AnswerProfile,
): string {
  const levelled =
    profile.languageLevel === 'child'
      ? shortenForChild(findings)
      : findings.map((finding) => simplifyForLevel(finding, profile.languageLevel))

  const sourcesLine = `Sources: ${documentNames.join(', ')}.`

  if (profile.audience === 'business') {
    const audienceLabel =
      profile.languageLevel === 'child'
        ? 'Child-friendly patient channel'
        : profile.languageLevel === 'teen'
          ? 'Teen / high-school channel'
          : 'Adult channel'

    return [
      'Decision brief',
      `Query: ${question}`,
      `Audience channel: ${audienceLabel}`,
      '',
      'Key outcomes',
      ...levelled.map((finding, index) => `- O${index + 1}: ${finding}`),
      '',
      'Operational notes',
      '- Prioritize safety, adherence, age fit, pregnancy considerations, and time-to-relief.',
      '- Use retrieved guideline passages only; escalate unclear cases to clinical review.',
      '',
      sourcesLine,
    ].join('\n')
  }

  if (profile.languageLevel === 'child') {
    return [
      'Here is a simple answer for you:',
      '',
      ...levelled.map((finding, index) => `${index + 1}) ${finding}`),
      '',
      'Please ask a grown-up or a doctor before changing any medicine.',
      sourcesLine,
    ].join('\n')
  }

  if (profile.languageLevel === 'teen') {
    return [
      `About your question (“${question}”):`,
      '',
      'What the guidelines say in plain language:',
      ...levelled.map((finding, index) => `${index + 1}. ${finding}`),
      '',
      'Tip: keep using treatment through pollen season even if you feel better, unless a clinician says otherwise.',
      sourcesLine,
    ].join('\n')
  }

  return [
    `Answer for patients — ${question}`,
    '',
    'What this means for you:',
    ...levelled.map((finding, index) => `${index + 1}. ${finding}`),
    '',
    'This is educational information based on uploaded guidelines, not a personal diagnosis.',
    sourcesLine,
  ].join('\n')
}

export function buildLlmSystemPrompt(profile: AnswerProfile): string {
  const levelInstruction =
    profile.languageLevel === 'child'
      ? 'Write for a child roughly 8–11 years old: short sentences, everyday words, no unexplained jargon.'
      : profile.languageLevel === 'teen'
        ? 'Write for a high-school teen: clear and direct, explain medical terms briefly in parentheses when needed.'
        : 'Write for an adult reader with standard health literacy; precise wording is fine.'

  const audienceInstruction =
    profile.audience === 'business'
      ? 'Format as a concise business/decision brief with bullets: key outcomes, risks, and operational notes.'
      : 'Format as patient-facing guidance with actionable takeaways and a short safety reminder.'

  return [
    'You are MediRAG, an assistant for medical guideline Q&A.',
    'Answer ONLY from the provided context.',
    'Prioritize practical results: side effects, adherence, age considerations, pregnancy safety, and how quickly symptoms improve.',
    'Avoid long methodology summaries.',
    levelInstruction,
    audienceInstruction,
    'If the context is insufficient, say so clearly.',
  ].join(' ')
}
