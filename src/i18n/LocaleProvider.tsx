import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import { translate, type Locale, type MessageKey } from './messages';

const STORAGE_KEY = 'northstar.locale';

function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en';
}

export function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; in-memory switching still works.
  }
}

export interface LocaleContextValue {
  locale: Locale;
  setLocale(locale: Locale): Promise<void>;
  t(key: MessageKey, values?: Record<string, string | number>): string;
}

const fallbackContext: LocaleContextValue = {
  locale: 'zh-CN',
  setLocale: async () => undefined,
  t: (key, values) => translate('zh-CN', key, values),
};

const LocaleContext = createContext<LocaleContextValue>(fallbackContext);

export interface LocaleProviderProps extends PropsWithChildren {
  repository: OkrRepository;
}

export function LocaleProvider({ children, repository }: LocaleProviderProps) {
  const { currentUser, mode, status } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const persistenceQueue = useRef<Promise<void>>(Promise.resolve());

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (status !== 'ready' || !isLocale(currentUser?.preferredLocale)) return;
    setLocaleState(currentUser.preferredLocale);
    storeLocale(currentUser.preferredLocale);
  }, [currentUser?.id, currentUser?.preferredLocale, status]);

  const setLocale = useCallback(async (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    storeLocale(nextLocale);
    if (mode === 'supabase' && status === 'ready' && currentUser) {
      const write = persistenceQueue.current.then(async () => {
        try {
          await repository.setMyLocale(nextLocale);
        } catch {
          // A failed remote preference write must not roll back or disable the interface.
        }
      });
      persistenceQueue.current = write;
      await write;
    }
  }, [currentUser, mode, repository, status]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (key, values) => translate(locale, key, values),
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
