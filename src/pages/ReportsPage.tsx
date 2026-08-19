import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { DailyReportsPage } from './DailyReportsPage';
import { WeeklyReportsPage } from './WeeklyReportsPage';

type ReportTab = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const tabs: readonly { id: ReportTab; labelKey: MessageKey }[] = [
  { id: 'daily', labelKey: 'reports.tab.daily' },
  { id: 'weekly', labelKey: 'reports.tab.weekly' },
  { id: 'monthly', labelKey: 'reports.tab.monthly' },
  { id: 'quarterly', labelKey: 'reports.tab.quarterly' },
  { id: 'yearly', labelKey: 'reports.tab.yearly' },
];

function isReportTab(value: string | null): value is ReportTab {
  return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'quarterly' || value === 'yearly';
}

export function ReportsPage() {
  const { t } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const idBase = useId();
  const requested = searchParams.get('tab');
  const activeTab: ReportTab = isReportTab(requested) ? requested : 'daily';
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  const selectTab = (tab: ReportTab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', tab);
      return next;
    });
  };

  return (
    <section className="business-page" aria-labelledby="reports-page-title">
      <div className="filter-row reports-tabs" role="tablist" aria-label={t('reports.title')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${idBase}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            aria-controls={`${idBase}-${tab.id}-panel`}
            className={`reports-tab${tab.id === activeTab ? ' reports-tab--active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'daily' ? (
        <section id={`${idBase}-daily-panel`} role="tabpanel" aria-labelledby={`${idBase}-daily-tab`}>
          <DailyReportsPage />
        </section>
      ) : activeTab === 'weekly' ? (
        <section id={`${idBase}-weekly-panel`} role="tabpanel" aria-labelledby={`${idBase}-weekly-tab`}>
          <WeeklyReportsPage />
        </section>
      ) : (
        <section id={`${idBase}-${active.id}-panel`} role="tabpanel" aria-labelledby={`${idBase}-${active.id}-tab`} className="page-section form-card">
          <h2>{t(active.labelKey)}</h2>
          <p className="reports-coming-soon">{t('reports.comingSoon')}</p>
          <p>{t('reports.placeholderDescription')}</p>
        </section>
      )}
    </section>
  );
}
