import { Bell, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RoleSwitcher } from './RoleSwitcher';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && <button className="sidebar-scrim" type="button" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      <div className="app-shell__main">
        <header className="app-topbar">
          <button
            className="icon-button app-topbar__menu"
            type="button"
            aria-label={mobileOpen ? '关闭导航' : '打开导航'}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="app-topbar__context">
            <span className="app-topbar__eyebrow">2026</span>
            <strong>第三季度</strong>
          </div>
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
