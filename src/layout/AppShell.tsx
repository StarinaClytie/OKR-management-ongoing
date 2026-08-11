import { Bell, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RoleSwitcher } from './RoleSwitcher';
import { Sidebar } from './Sidebar';

const quarters = ['第一季度', '第二季度', '第三季度', '第四季度'] as const;

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quarter, setQuarter] = useState<(typeof quarters)[number]>('第三季度');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const restoreMenuFocus = useRef(false);

  function closeMobileDrawer() {
    restoreMenuFocus.current = true;
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen && restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      menuButtonRef.current?.focus();
    }
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMobileDrawer();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <div className="app-shell">
      <Sidebar variant="desktop" onNavigate={() => setMobileOpen(false)} />
      <Sidebar variant="mobile" mobileOpen={mobileOpen} onNavigate={closeMobileDrawer} />
      {mobileOpen && <button className="sidebar-scrim" type="button" aria-label="关闭导航遮罩" onClick={closeMobileDrawer} />}
      <div className="app-shell__main">
        <header className="app-topbar">
          <button
            ref={menuButtonRef}
            className="icon-button app-topbar__menu"
            type="button"
            aria-label={mobileOpen ? '关闭导航' : '打开导航'}
            aria-expanded={mobileOpen}
            onClick={() => mobileOpen ? closeMobileDrawer() : setMobileOpen(true)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <label className="quarter-selector">
            <span className="app-topbar__eyebrow">2026 年 · 季度</span>
            <select aria-label="选择季度" value={quarter} onChange={(event) => setQuarter(event.target.value as typeof quarter)}>
              {quarters.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="app-topbar__actions">
            <button className="icon-button" type="button" aria-label="通知">
              <Bell size={19} />
            </button>
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
