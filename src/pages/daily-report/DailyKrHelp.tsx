import { useId, useState } from 'react';
import type { DailyKrType } from '../../domain/dailyEntry';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

const guidanceKeys: Record<DailyKrType, { label: MessageKey; formula: MessageKey; example: MessageKey; caution: MessageKey; rule: MessageKey }> = {
  quantity: { label: 'daily.krType.quantity', formula: 'daily.quantityFormula', example: 'daily.quantityExample', caution: 'daily.quantityCaution', rule: 'daily.quantityRule' },
  ratio: { label: 'daily.krType.ratio', formula: 'daily.ratioFormula', example: 'daily.ratioExample', caution: 'daily.ratioCaution', rule: 'daily.ratioRule' },
  milestone: { label: 'daily.krType.milestone', formula: 'daily.milestoneFormula', example: 'daily.milestoneExample', caution: 'daily.milestoneCaution', rule: 'daily.milestoneRule' },
  subjective: { label: 'daily.krType.subjective', formula: 'daily.subjectiveFormula', example: 'daily.subjectiveExample', caution: 'daily.subjectiveCaution', rule: 'daily.subjectiveRule' },
};

interface DailyKrHelpProps {
  type: DailyKrType;
  className?: string;
}

export function DailyKrHelp({ type, className = '' }: DailyKrHelpProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const guidance = guidanceKeys[type];

  return (
    <section className={`daily-entry-help ${className}`.trim()} aria-label={t('daily.help')}>
      <p className="daily-entry-help__eyebrow">{t('daily.guidanceTitle', { type: t(guidance.label) })}</p>
      <p>{t('daily.formula', { formula: t(guidance.formula) })}</p>
      <p>{t('daily.examplePrefix')}<span>{t(guidance.example)}</span></p>
      <p>{t('daily.caution', { caution: t(guidance.caution) })}</p>
      <button
        type="button"
        className="text-button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? t('daily.hideRules') : t('daily.showRules')}
      </button>
      {expanded && <p id={contentId} className="daily-entry-help__full-rule">{t(guidance.rule)}</p>}
    </section>
  );
}
