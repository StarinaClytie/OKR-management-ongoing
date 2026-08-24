import { ChevronDown } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../auth/roleLabels';
import { useLocale } from '../i18n/LocaleProvider';
import { NotificationCenter, NotificationCenterContext } from './NotificationCenter';

export interface AccountMenuProps {
  compact?: boolean;
  onNavigate?: () => void;
  onNotificationsOpen?: () => void;
  onNotificationsClose?: () => void;
}

export function AccountMenu({ compact = false, onNavigate, onNotificationsOpen, onNotificationsClose }: AccountMenuProps) {
  const { t } = useLocale();
  const { currentUser, email, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const notificationCenter = useContext(NotificationCenterContext);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  if (!currentUser) return null;

  const initial = currentUser.name.trim().charAt(0).toUpperCase() || '?';
  const roleLabel = t(roleLabels[currentUser.role]);
  const organization = currentUser.organization;

  function close() {
    setOpen(false);
  }

  function navigate() {
    close();
    onNavigate?.();
  }

  function toggleMenu() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void notificationCenter?.notifications.refresh();
  }

  function openNotifications() {
    close();
    onNotificationsOpen?.();
    setNotificationsOpen(true);
    void notificationCenter?.notifications.refresh();
  }

  const unreadCount = notificationCenter?.notifications.unreadCount ?? 0;
  const triggerLabel = unreadCount > 0
    ? t('notifications.accountUnread', { count: unreadCount })
    : t('account.openMenu');

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className={`account-menu__trigger${compact ? ' account-menu__trigger--compact' : ''}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={compact ? t('account.openMenu') : undefined}
        onClick={toggleMenu}
      >
        <span className="account-menu__avatar" aria-hidden="true">{initial}</span>
        {unreadCount > 0 ? <span className="account-menu__notification-dot" aria-hidden="true" /> : null}
        {!compact ? (
          <>
            <span className="account-menu__identity">
              <span className="account-menu__name">{currentUser.name}</span>
              <span className="account-menu__role">{roleLabel}</span>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </>
        ) : null}
      </button>

      {open ? (
        <div className="account-menu__dropdown" role="menu" aria-label={t('account.menu')}>
          {(compact || email || organization) ? (
            <div className="account-menu__summary">
              {compact ? (
                <span className="account-menu__compact-identity">
                  <strong>{currentUser.name}</strong>
                  <span>{roleLabel}</span>
                </span>
              ) : null}
              {email ? <span className="account-menu__email">{email}</span> : null}
              {organization ? <span className="account-menu__organization">{organization}</span> : null}
            </div>
          ) : null}
          {notificationCenter ? (
            <button role="menuitem" className="account-menu__item" type="button" onClick={openNotifications}>
              {t('notifications.open', { count: unreadCount })}
            </button>
          ) : null}
          <Link role="menuitem" className="account-menu__item" to="/profile" onClick={navigate}>{t('account.profile')}</Link>
          <Link role="menuitem" className="account-menu__item" to="/settings" onClick={navigate}>{t('account.settings')}</Link>
          <div className="account-menu__separator" role="separator" />
          <button role="menuitem" className="account-menu__item account-menu__item--danger" type="button" onClick={() => { close(); void signOut(); }}>
            {t('account.signOut')}
          </button>
        </div>
      ) : null}
      {notificationsOpen && notificationCenter ? (
        <NotificationCenter
          notifications={notificationCenter.notifications}
          onClose={() => {
            setNotificationsOpen(false);
            if (onNotificationsClose) onNotificationsClose();
            else triggerRef.current?.focus();
          }}
          openReportFromNotification={notificationCenter.openReportFromNotification}
          openResourceFromNotification={notificationCenter.openResourceFromNotification}
        />
      ) : null}
    </div>
  );
}
