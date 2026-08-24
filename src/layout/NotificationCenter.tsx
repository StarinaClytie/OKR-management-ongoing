import { X } from 'lucide-react';
import { createContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { UserNotification } from '../domain/types';
import type { NotificationState } from '../hooks/useNotifications';
import { useLocale } from '../i18n/LocaleProvider';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import type { MessageKey } from '../i18n/messages';

export interface NotificationCenterProps {
  notifications: NotificationState;
  onClose(): void;
  openReportFromNotification(reportId: string): Promise<void>;
  openResourceFromNotification(resourceId: string): void;
}

export interface NotificationCenterContextValue {
  notifications: NotificationState;
  openReportFromNotification(reportId: string): Promise<void>;
  openResourceFromNotification(resourceId: string): void;
}

export const NotificationCenterContext = createContext<NotificationCenterContextValue | undefined>(undefined);

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function notificationMessageKey(type: UserNotification['type']): MessageKey {
  if (type === 'daily_report_comment') return 'notifications.dailyReportComment';
  if (type === 'daily_report_confirmed') return 'notifications.dailyReportConfirmed';
  return 'notifications.resourceOwnerAssigned';
}

export function NotificationCenter({
  notifications,
  onClose,
  openReportFromNotification,
  openResourceFromNotification,
}: NotificationCenterProps) {
  const { t } = useLocale();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [actionError, setActionError] = useState<MessageKey>();
  onCloseRef.current = onClose;

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function labelFor(item: UserNotification) {
    return t(notificationMessageKey(item.type), { actor: item.actorName });
  }

  async function markOne(item: UserNotification) {
    setActionError(undefined);
    await notifications.markRead(item.id);
  }

  async function markAll() {
    setActionError(undefined);
    await notifications.markAllRead();
  }

  async function openNotification(item: UserNotification) {
    setActionError(undefined);
    const marked = await notifications.markRead(item.id);
    if (!marked) return;
    try {
      if ((item.type === 'daily_report_comment' || item.type === 'daily_report_confirmed') && item.reportId) {
        onClose();
        await openReportFromNotification(item.reportId);
      } else if (item.type === 'resource_owner_assigned' && item.resourceId) {
        onClose();
        openResourceFromNotification(item.resourceId);
      }
    } catch {
      setActionError(repositoryErrorKey('unknown'));
    }
  }

  const visibleError = actionError ?? (notifications.error ? repositoryErrorKey(notifications.error) : undefined);

  const panel = (
    <div className="modal-scrim notification-center__scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        className="modal-panel notification-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
      >
        <header className="notification-center__header">
          <div>
            <h2 id={titleId}>{t('notifications.title')}</h2>
            <p aria-live="polite">{notifications.unreadCount > 0
              ? t('notifications.unreadCount', { count: notifications.unreadCount })
              : t('notifications.noneUnread')}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" aria-label={t('notifications.close')} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="notification-center__actions">
          <button type="button" className="button button--secondary" disabled={notifications.unreadCount === 0} onClick={() => void markAll()}>
            {t('notifications.markAllRead')}
          </button>
        </div>

        {notifications.loading && notifications.items.length === 0 ? <p role="status">{t('notifications.loading')}</p> : null}
        {visibleError ? <p className="form-error" role="alert">{t(visibleError)}</p> : null}
        {!notifications.loading && notifications.items.length === 0 ? <p className="data-table__empty">{t('notifications.empty')}</p> : null}

        {notifications.items.length > 0 ? (
          <ol className="notification-center__list">
            {notifications.items.map((item) => {
              const label = labelFor(item);
              return (
                <li key={item.id} className={`notification-center__item${item.readAt === null ? ' notification-center__item--unread' : ''}`}>
                  <button type="button" className="notification-center__open" onClick={() => void openNotification(item)}>{label}</button>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                  {item.readAt === null ? (
                    <button type="button" className="text-button" aria-label={t('notifications.markOneRead', { label })} onClick={() => void markOne(item)}>
                      {t('notifications.markRead')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
        {notifications.hasMore ? (
          <button type="button" className="button button--secondary" disabled={notifications.loading} onClick={() => void notifications.loadMore()}>
            {notifications.loading ? t('notifications.loading') : t('notifications.loadMore')}
          </button>
        ) : null}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? panel : createPortal(panel, document.body);
}
