import type { ReactNode, Ref } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

export interface PageHeaderProps {
  title: string;
  description: string;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean; buttonRef?: Ref<HTMLButtonElement> };
  children?: ReactNode;
}

export function PageHeader({ title, description, primaryAction, children }: PageHeaderProps) {
  const { t } = useLocale();
  return (
    <header className="page-header">
      <div>
        <p className="page-header__eyebrow">{t('common.workspace')}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-header__actions">
        {children}
        {primaryAction && (
          <button ref={primaryAction.buttonRef} className="button button--primary" type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            {primaryAction.label}
          </button>
        )}
      </div>
    </header>
  );
}
