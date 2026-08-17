import { Bell, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';
import { RoleSwitcher } from './RoleSwitcher';
import { Sidebar } from './Sidebar';
import { useMediaQuery } from './useMediaQuery';
import { useAuth } from '../auth/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useLocale } from '../i18n/LocaleProvider';

const quarters = ['topbar.quarter1', 'topbar.quarter2', 'topbar.quarter3', 'topbar.quarter4'] as const;

export function AppShell() {
  const { t } = useLocale();
  const { mode } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quarter, setQuarter] = useState<(typeof quarters)[number]>('topbar.quarter3');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const restoreMenuFocus = useRef(false);
  const modalOpen = isMobile && mobileOpen;

  function closeMobileDrawer() {
    restoreMenuFocus.current = true;
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!modalOpen && restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      menuButtonRef.current?.focus();
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    const drawer = drawerRef.current;
    const focusableElements = () => Array.from(drawer?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    focusableElements()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileDrawer();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusableElements();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;

      const focusIsOutside = !drawer?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  useEffect(() => {
    if (!isMobile && mobileOpen) {
      restoreMenuFocus.current = false;
      setMobileOpen(false);
    }
  }, [isMobile, mobileOpen]);

  return (
    <div className="app-shell">
      {!isMobile ? <Sidebar variant="desktop" onNavigate={() => setMobileOpen(false)} /> : null}
      {isMobile ? (
        <Sidebar
          variant="mobile"
          mobileOpen={mobileOpen}
          onNavigate={closeMobileDrawer}
          onClose={closeMobileDrawer}
          drawerRef={drawerRef}
        />
      ) : null}
      {modalOpen && <button className="sidebar-scrim" tabIndex={-1} type="button" aria-label={t('navigation.closeScrim')} aria-hidden="true" onClick={closeMobileDrawer} />}
      <div className="app-shell__main" inert={modalOpen} aria-hidden={modalOpen ? true : undefined}>
        <header className="app-topbar">
          {isMobile ? (
            <button
              ref={menuButtonRef}
              className="icon-button app-topbar__menu"
              type="button"
              aria-label={t('navigation.open')}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          ) : null}
          <label className="quarter-selector">
            <span className="app-topbar__eyebrow">{t('topbar.period')}</span>
            <select aria-label={t('topbar.selectQuarter')} value={quarter} onChange={(event) => setQuarter(event.target.value as typeof quarter)}>
              {quarters.map((option) => <option key={option} value={option}>{t(option)}</option>)}
            </select>
          </label>
          <div className="app-topbar__actions">
            <LanguageSwitcher />
            <button className="icon-button" type="button" aria-label={t('topbar.notifications')}>
              <Bell size={19} />
            </button>
            <RoleSwitcher />
            {mode === 'supabase' ? <AccountMenu /> : null}
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
