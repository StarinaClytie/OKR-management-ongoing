import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleProvider';

interface DailyObjectiveFieldProps {
  objective: string;
  objectiveError: string | null;
  progress?: number;
  progressError: string | null;
  averageReference: number | null;
  onObjectiveChange: (value: string) => void;
  onProgressChange: (value: number | undefined) => void;
}

export function DailyObjectiveField({
  objective,
  objectiveError,
  progress,
  progressError,
  averageReference,
  onObjectiveChange,
  onProgressChange,
}: DailyObjectiveFieldProps) {
  const { t } = useLocale();
  const [examplesVisible, setExamplesVisible] = useState(false);

  return (
    <section className="daily-objective-field form-card form-section" aria-labelledby="daily-objective-heading">
      <div className="daily-field-heading">
        <h2 id="daily-objective-heading">{t('daily.objectiveTitle')}</h2>
        <p>{t('daily.objectiveHint')}</p>
      </div>
      <label htmlFor="daily-objective">{t('daily.objective')}</label>
      <textarea
        id="daily-objective"
        autoFocus
        value={objective}
        aria-invalid={objectiveError ? 'true' : undefined}
        aria-describedby={objectiveError ? 'daily-objective-error' : undefined}
        onChange={(event) => onObjectiveChange(event.target.value)}
        placeholder={t('daily.objectivePlaceholder')}
        rows={3}
      />
      {objectiveError && <p id="daily-objective-error" className="form-error" role="alert">{objectiveError}</p>}
      <button
        type="button"
        className="text-button"
        aria-expanded={examplesVisible}
        aria-controls="daily-objective-examples"
        onClick={() => setExamplesVisible((visible) => !visible)}
      >
        {examplesVisible ? t('daily.hideObjectiveExamples') : t('daily.showObjectiveExamples')}
      </button>
      {examplesVisible && (
        <section id="daily-objective-examples" className="daily-objective-field__examples" aria-label={t('daily.objectiveExamples')}>
          <dl>
            <div><dt>{t('daily.verbNoun')}</dt><dd>{t('daily.verbNounExample')}</dd></div>
            <div><dt>{t('daily.verbAdjectiveNoun')}</dt><dd>{t('daily.verbAdjectiveNounExample')}</dd></div>
            <div><dt>{t('daily.adverbVerbNoun')}</dt><dd>{t('daily.adverbVerbNounExample')}</dd></div>
            <div><dt>{t('daily.whatWhy')}</dt><dd>{t('daily.whatWhyExample')}</dd></div>
          </dl>
          <ul>
            <li>{t('daily.objectiveRule1')}</li>
            <li>{t('daily.objectiveRule2')}</li>
            <li>{t('daily.objectiveRule3')}</li>
            <li>{t('daily.objectiveRule4')}</li>
          </ul>
        </section>
      )}
      <div className="daily-objective-field__progress">
        <div>
          <label htmlFor="daily-objective-progress">{t('daily.objectiveProgress')}</label>
          <input
            id="daily-objective-progress"
            type="number"
            min="0"
            max="100"
            inputMode="decimal"
            value={progress ?? ''}
            required
            aria-invalid={progressError ? 'true' : undefined}
            onChange={(event) => onProgressChange(event.target.value === '' ? undefined : Number(event.target.value))}
            aria-describedby={progressError ? 'daily-objective-progress-error' : undefined}
          />
          {progressError && <p id="daily-objective-progress-error" className="form-error" role="alert">{progressError}</p>}
        </div>
        <p className="daily-reference">{t('daily.averageReference', { value: averageReference === null ? '—' : `${averageReference}%` })}</p>
      </div>
    </section>
  );
}
