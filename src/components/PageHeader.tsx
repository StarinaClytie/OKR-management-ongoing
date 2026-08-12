import type { ReactNode, Ref } from 'react';

export interface PageHeaderProps {
  title: string;
  description: string;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean; buttonRef?: Ref<HTMLButtonElement> };
  children?: ReactNode;
}

export function PageHeader({ title, description, primaryAction, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <p className="page-header__eyebrow">工作区 · <span className="mock-data-badge">模拟数据</span></p>
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
