import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../auth/roleLabels';
import { useLocale } from '../i18n/LocaleProvider';

export function AccountMenu() {
  const { t } = useLocale();
  const { currentUser, email, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="account-menu__trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account.openMenu')}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-menu__avatar" aria-hidden="true">{initial}</span>
        <span className="account-menu__identity">
          <span className="account-menu__name">{currentUser.name}</span>
          <span className="account-menu__role">{roleLabel}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open ? (
        <div className="account-menu__dropdown" role="menu" aria-label={t('account.menu')}>
          {(email || organization) ? (
            <div className="account-menu__summary">
              {email ? <span className="account-menu__email">{email}</span> : null}
              {organization ? <span className="account-menu__organization">{organization}</span> : null}
            </div>
          ) : null}
          <Link role="menuitem" className="account-menu__item" to="/profile" onClick={close}>{t('account.profile')}</Link>
          <Link role="menuitem" className="account-menu__item" to="/settings" onClick={close}>{t('account.settings')}</Link>
          <div className="account-menu__separator" role="separator" />
          <button role="menuitem" className="account-menu__item account-menu__item--danger" type="button" onClick={() => { close(); void signOut(); }}>
            {t('account.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
