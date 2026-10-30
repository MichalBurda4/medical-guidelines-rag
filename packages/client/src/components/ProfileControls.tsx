import type { AudienceProfile, LanguageLevel, LlmAvailability, LlmProvider } from '../contract'

interface ProfileControlsProps {
  languageLevel: LanguageLevel
  audience: AudienceProfile
  llm: LlmProvider | null
  llmAvailability: LlmAvailability
  healthStatus: 'checking' | 'ready'
  onLanguageLevelChange: (value: LanguageLevel) => void
  onAudienceChange: (value: AudienceProfile) => void
  onLlmChange: (value: LlmProvider) => void
}

const LANGUAGE_OPTIONS: Array<{ value: LanguageLevel; label: string; hint: string }> = [
  { value: 'child', label: 'Child', hint: 'Simple words' },
  { value: 'teen', label: 'Teen', hint: 'Plain + brief terms' },
  { value: 'adult', label: 'Adult', hint: 'Full wording' },
]

const AUDIENCE_OPTIONS: Array<{ value: AudienceProfile; label: string; hint: string }> = [
  { value: 'patient', label: 'Patient', hint: 'Actionable guidance' },
  { value: 'business', label: 'Business', hint: 'Decision brief' },
]

const LLM_OPTIONS: Array<{
  value: LlmProvider
  label: string
  hint: string
  unavailable: string
}> = [
  {
    value: 'openai',
    label: 'OpenAI',
    hint: 'gpt-4o-mini',
    unavailable: 'Set OPENAI_API_KEY',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    hint: 'deepseek-chat',
    unavailable: 'Set DEEPSEEK_API_KEY',
  },
]

export function ProfileControls({
  languageLevel,
  audience,
  llm,
  llmAvailability,
  healthStatus,
  onLanguageLevelChange,
  onAudienceChange,
  onLlmChange,
}: ProfileControlsProps) {
  return (
    <section className="profile-controls">
      <div className="profile-group">
        <h2>Language level</h2>
        <div className="profile-options" role="radiogroup" aria-label="Language level">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={languageLevel === option.value ? 'active' : ''}
              aria-pressed={languageLevel === option.value}
              onClick={() => onLanguageLevelChange(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="profile-group">
        <h2>Audience</h2>
        <div className="profile-options" role="radiogroup" aria-label="Audience profile">
          {AUDIENCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={audience === option.value ? 'active' : ''}
              aria-pressed={audience === option.value}
              onClick={() => onAudienceChange(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="profile-group">
        <h2>Answer model</h2>
        {llm === null && (
          <p className="llm-missing">
            {healthStatus === 'checking' ? (
              'Checking which answer models are available…'
            ) : (
              <>
                No LLM configured — set OPENAI_API_KEY or DEEPSEEK_API_KEY in
                <code> .env</code> at the repo root and restart the API.
              </>
            )}
          </p>
        )}
        <div className="profile-options" role="radiogroup" aria-label="Answer model">
          {LLM_OPTIONS.map((option) => {
            const enabled = llmAvailability[option.value]
            return (
              <button
                key={option.value}
                type="button"
                className={llm === option.value ? 'active' : ''}
                aria-pressed={llm === option.value}
                disabled={!enabled}
                title={!enabled ? option.unavailable : undefined}
                onClick={() => onLlmChange(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{enabled ? option.hint : option.unavailable}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
