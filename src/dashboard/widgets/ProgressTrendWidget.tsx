import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { MetricCard } from '../../components/MetricCard';
import type { DashboardData } from '../../data/types';
import { prepareVisualizationData } from './visualizationData';
import { useLocale } from '../../i18n/LocaleProvider';

export interface ProgressTrendWidgetProps {
  data: DashboardData;
}

export function ProgressTrendWidget({ data }: ProgressTrendWidgetProps) {
  const { t } = useLocale();
  const { trendPoints } = prepareVisualizationData(data);
  const latest = trendPoints.at(-1);
  const latestActual = latest?.actual;

  if (trendPoints.length < 8) {
    return (
      <div className="trend-fallback">
        <p className="visualization-empty">{t('trend.insufficient')}</p>
        <div className="dashboard-metrics">
          <MetricCard label={t('trend.latestActual')} value={latestActual === undefined ? '—' : `${latestActual}%`} detail={latestActual === undefined ? t('trend.noActual') : t('trend.latestScope')} />
          <MetricCard label={t('trend.latestPlan')} value={`${latest?.planned ?? 0}%`} detail={t('trend.latestScope')} />
        </div>
      </div>
    );
  }

  return (
    <div className="trend-chart">
      <div className="trend-chart__heading">
        <div>
          <strong>{t('trend.recent')}</strong>
          <span>{t('trend.period', { start: trendPoints[0].weekOf, end: latest?.weekOf ?? '' })}</span>
        </div>
        <span>{t('trend.unit')}</span>
      </div>
      <div className="trend-chart__legend" aria-label={t('trend.legend')}>
        <span><i className="trend-legend trend-legend--actual" />{t('trend.actual')}</span>
        <span><i className="trend-legend trend-legend--planned" />{t('trend.planned')}</span>
      </div>
      <details><summary>{t('trend.calculation')}</summary><p>{t('trend.calculationDetail')}</p></details>
      <p className="trend-chart__count">{t('trend.pointCount', { count: trendPoints.length })}</p>
      <div className="trend-chart__scroll" tabIndex={0} aria-label={t('trend.scrollable')}>
        <LineChart
          width={760}
          height={280}
          data={trendPoints}
          margin={{ top: 12, right: 20, bottom: 12, left: 0 }}
          role="img"
          aria-label={t('trend.chartLabel')}
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="weekOf" tick={{ fontSize: 11 }} interval={1} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
          <Line dataKey="actual" name={t('trend.actual')} type="monotone" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
          <Line dataKey="planned" name={t('trend.planned')} type="monotone" stroke="#64748b" strokeWidth={2} strokeDasharray="7 5" dot={false} />
        </LineChart>
      </div>
    </div>
  );
}
