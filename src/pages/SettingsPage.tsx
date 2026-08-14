import { useId, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

interface SettingsState {
  ownerId: string | undefined;
  notice: MessageKey | null;
  activeTab: string;
  reminders: boolean;
}

export function SettingsPage() {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const [state, setState] = useState<SettingsState>(() => ({ ownerId: currentUser?.id, notice: null, activeTab: 'personal', reminders: true }));
  if (!currentUser) return null;
  const tabs = [
    { id: 'personal', label: t('settings.personal'), description: t('settings.personalDescription') },
    ...(currentUser.role === 'project_leader' ? [{ id: 'project', label: t('settings.project'), description: t('settings.projectDescription') }] : []),
    ...(currentUser.role === 'hr' ? [{ id: 'hr', label: t('settings.hr'), description: t('settings.hrDescription') }] : []),
    ...(currentUser.role === 'administrator' ? [{ id: 'system', label: t('settings.system'), description: t('settings.systemDescription') }] : []),
  ];
  const ownedState: SettingsState = state.ownerId === currentUser.id ? state : { ownerId: currentUser.id, notice: null, activeTab: 'personal', reminders: true };
  const activeTab = tabs.some((tab) => tab.id === ownedState.activeTab) ? ownedState.activeTab : tabs[0].id;
  const idBase = useId();
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <section className="business-page" aria-labelledby="settings-page-title">
      <PageHeader title={t('settings.title')} description={t('settings.description')} primaryAction={{ label: t('settings.save'), onClick: () => setState({ ...ownedState, notice: 'settings.saved' }) }} />
      {ownedState.notice && <p className="page-notice" role="status">{t(ownedState.notice)}</p>}
      <div className="settings-tabs" role="tablist" aria-label={t('settings.categories')}>
        {tabs.map((tab) => <button key={tab.id} id={`${idBase}-${tab.id}-tab`} type="button" role="tab" aria-selected={tab.id === activeTab} aria-controls={tab.id === activeTab ? `${idBase}-${tab.id}-panel` : undefined} className="settings-tab" onClick={() => setState({ ...ownedState, activeTab: tab.id, notice: null })}>{tab.label}</button>)}
      </div>
      <section id={`${idBase}-${active.id}-panel`} className="settings-panel form-card form-section" role="tabpanel" aria-label={active.label} aria-labelledby={`${idBase}-${active.id}-tab`}><h2>{active.label}</h2><p>{active.description}</p><label className="settings-toggle"><input type="checkbox" checked={ownedState.reminders} onChange={(event) => setState({ ...ownedState, reminders: event.target.checked, notice: null })} /> {t('settings.reminders')}</label></section>
    </section>
  );
}
