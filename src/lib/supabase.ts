import type { AppMode } from '../data/types';
import { createRepository } from '../data/repositoryFactory';

export function readAppMode(value: string | undefined): AppMode {
  if (!value || value === 'demo') return 'demo';
  if (value === 'supabase') return 'supabase';
  throw new Error(`不支持的 VITE_APP_MODE: ${value}`);
}

export const appMode = readAppMode(import.meta.env.VITE_APP_MODE);
export const repository = createRepository({
  mode: appMode,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
