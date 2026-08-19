import { useState } from 'react';
import type { DashboardData } from '../../data/types';
import { getRiskCoordinate, type RiskLevel } from '../../domain/riskScore';
import { prepareVisualizationData } from './visualizationData';
import { useLocale, type LocaleContextValue } from '../../i18n/LocaleProvider';

export interface RiskMatrixWidgetProps {
  data: DashboardData;
}

const levels = [3, 2, 1] as const;
const levelKeys = { low: 'risk.lowEvent', medium: 'risk.mediumEvent', high: 'risk.highEvent', critical: 'risk.criticalEvent' } as const;

function executionStatusEffect(score: number, t: LocaleContextValue['t']): string {
  if (score === 9) return t('risk.effectCritical');
  if (score === 6) return t('risk.effectHigh');
  return t('risk.effectNone');
}

function eventSeverity(level: RiskLevel, t: LocaleContextValue['t']): string {
  return t(levelKeys[level]);
}

export function RiskMatrixWidget({ data }: RiskMatrixWidgetProps) {
  const { t } = useLocale();
  const { risks } = prepareVisualizationData(data, { unknownMember: t('table.member') });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = risks.find((risk) => risk.id === selectedId);

  if (risks.length === 0) {
    return <p className="visualization-empty">{t('risk.empty')}</p>;
  }

  return (
    <div className="risk-matrix-wrap">
      <p className="visualization-description">{t('risk.description')}</p>
      <details open>
        <summary>{t('risk.calculation')}</summary>
        <p><strong>{t('risk.eventVsStatus')}</strong>{t('risk.eventVsStatusSeparator')}{t('risk.eventVsStatusDetail')}</p>
        <p>{t('risk.probabilityDefinitions')}</p>
        <p>{t('risk.impactDefinitions')}</p>
        <p>{t('risk.formula')}</p>
        <ul>
          <li>{t('risk.lowRule')}</li>
          <li>{t('risk.mediumRule')}</li>
          <li>{t('risk.highRule')}</li>
          <li>{t('risk.criticalRule')}</li>
        </ul>
        <p>{t('risk.example')}</p>
      </details>
      <div className="risk-matrix" role="region" tabIndex={0} aria-label={t('risk.matrixScrollable')}>
        <span className="risk-matrix__axis risk-matrix__axis--y">{t('risk.probabilityAxis')}</span>
        <div className="risk-matrix__grid">
          {levels.flatMap((probability) =>
            ([1, 2, 3] as const).map((impact) => {
              const coordinate = getRiskCoordinate(probability, impact);
              const cellRisks = risks.filter((risk) => risk.probability === probability && risk.impact === impact);
              return (
                <section
                  key={`${probability}-${impact}`}
                  className={`risk-cell risk-cell--level-${probability + impact}`}
                  aria-label={t('risk.cellLabel', { probability: probability === 3 ? t('risk.high') : probability === 2 ? t('risk.medium') : t('risk.low'), impact: impact === 3 ? t('risk.high') : impact === 2 ? t('risk.medium') : t('risk.low'), score: coordinate.score })}
                >
                  {cellRisks.map((risk) => (
                    <button type="button" className="risk-marker" aria-label={t('risk.viewDetails', { title: risk.title })} onClick={() => setSelectedId(risk.id)} key={risk.id}>
                      <span className="risk-marker__shape" aria-hidden="true">◆</span>
                      <strong>{risk.title}</strong>
                      <small>{t(risk.probability === 3 ? 'risk.probabilityHigh' : risk.probability === 2 ? 'risk.probabilityMedium' : 'risk.probabilityLow')} · {t(risk.impact === 3 ? 'risk.impactHigh' : risk.impact === 2 ? 'risk.impactMedium' : 'risk.impactLow')}</small>
                    </button>
                  ))}
                </section>
              );
            }),
          )}
        </div>
        <span className="risk-matrix__axis risk-matrix__axis--x">{t('risk.impactAxis')}</span>
      </div>
      {selected && <section className="risk-details" role="region" aria-label={t('risk.details')}>
        <h3>{selected.title}</h3>
        <p>{t('risk.score', { probability: selected.probability, impact: selected.impact, score: selected.score })}</p>
        <p>{t('risk.severity', { severity: eventSeverity(selected.level, t) })}</p>
        <p>{t('risk.statusEffect', { effect: executionStatusEffect(selected.score, t) })}</p>
        <dl>
          <dt>{t('risk.reason')}</dt><dd>{selected.reason}</dd>
          <dt>{t('risk.owner')}</dt><dd>{selected.ownerName}</dd>
          <dt>{t('risk.mitigation')}</dt><dd>{selected.mitigation}</dd>
          <dt>{t('risk.reviewed')}</dt><dd>{selected.lastReviewedAt}</dd>
        </dl>
      </section>}
    </div>
  );
}
