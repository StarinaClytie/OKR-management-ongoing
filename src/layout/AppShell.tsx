import { Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RoleSwitcher } from './RoleSwitcher';
import { Sidebar } from './Sidebar';
import { useMediaQuery } from './useMediaQuery';
import { useLocale } from '../i18n/LocaleProvider';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'time-tech-okr.sidebar-collapsed';

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage may be unavailable; the in-memory preference still applies.
  }
}

export function AppShell() {
  const { t } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(readSidebarCollapsed);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const restoreMenuFocus = useRef(false);
  const modalOpen = isMobile && mobileOpen;

  function closeMobileDrawer() {
    restoreMenuFocus.current = true;
    setMobileOpen(false);
  }

  function changeDesktopCollapsed(next: boolean) {
    setDesktopCollapsed(next);
    storeSidebarCollapsed(next);
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
      {!isMobile ? (
        <Sidebar
          variant="desktop"
          collapsed={desktopCollapsed}
          onCollapsedChange={changeDesktopCollapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      ) : null}
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
          <div className="app-topbar__actions">
            <RoleSwitcher />
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
