import { useId, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { useLocale } from '../i18n/LocaleProvider';

export function SettingsPage() {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const [activeTabId, setActiveTabId] = useState('personal');
  if (!currentUser) return null;
  const tabs = [
    { id: 'personal', label: t('settings.personal'), description: t('settings.personalDescription') },
    ...(currentUser.role === 'project_leader' ? [{ id: 'project', label: t('settings.project'), description: t('settings.projectDescription') }] : []),
    ...(currentUser.role === 'hr' ? [{ id: 'hr', label: t('settings.hr'), description: t('settings.hrDescription') }] : []),
    ...(currentUser.role === 'administrator' ? [{ id: 'system', label: t('settings.system'), description: t('settings.systemDescription') }] : []),
  ];
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const idBase = useId();

  return (
    <section className="business-page" aria-labelledby="settings-page-title">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <div className="settings-tabs" role="tablist" aria-label={t('settings.categories')}>
        {tabs.map((tab) => <button key={tab.id} id={`${idBase}-${tab.id}-tab`} type="button" role="tab" aria-selected={tab.id === active.id} aria-controls={tab.id === active.id ? `${idBase}-${tab.id}-panel` : undefined} className="settings-tab" onClick={() => setActiveTabId(tab.id)}>{tab.label}</button>)}
      </div>
      <section id={`${idBase}-${active.id}-panel`} className="settings-panel form-card form-section" role="tabpanel" aria-label={active.label} aria-labelledby={`${idBase}-${active.id}-tab`}>
        <h2>{active.label}</h2>
        <p>{active.description}</p>
        <p className="reports-coming-soon">{t('settings.notImplemented')}</p>
      </section>
    </section>
  );
}
