import type { AudienceProfile, LanguageLevel } from '../types'

interface ProfileControlsProps {
  languageLevel: LanguageLevel
  audience: AudienceProfile
  onLanguageLevelChange: (value: LanguageLevel) => void
  onAudienceChange: (value: AudienceProfile) => void
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

export function ProfileControls({
  languageLevel,
  audience,
  onLanguageLevelChange,
  onAudienceChange,
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
    </section>
  )
}
