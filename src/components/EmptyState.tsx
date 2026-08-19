export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  primaryAction?: EmptyStateAction;
}

export function EmptyState({ title, description, primaryAction }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {primaryAction ? (
        <button className="button button--primary" type="button" onClick={primaryAction.onClick}>
          {primaryAction.label}
        </button>
      ) : null}
    </section>
  );
}
