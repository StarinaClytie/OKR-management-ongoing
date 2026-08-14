import { useId, useRef, type KeyboardEvent } from 'react';
import { useLocale } from '../../i18n/LocaleProvider';

export interface WidgetTab<T extends string> {
  id: T;
  label: string;
}

export interface WidgetTabsProps<T extends string> {
  tabs: readonly WidgetTab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  idBase?: string;
}

export function WidgetTabs<T extends string>({ tabs, activeTab, onChange, idBase }: WidgetTabsProps<T>) {
  const { t } = useLocale();
  const generatedId = useId();
  const instanceId = idBase ?? generatedId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function activate(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    onChange(tab.id);
    refs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex === undefined) return;
    event.preventDefault();
    activate(nextIndex);
  }

  return (
    <div className="widget-tabs" role="tablist" aria-label={t('visualization.tablist')}>
      {tabs.map((tab, index) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(node) => { refs.current[index] = node; }}
            id={`${instanceId}-${tab.id}-tab`}
            className="widget-tabs__tab"
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={selected ? `${instanceId}-${tab.id}-panel` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
