import type { AppMode } from '../data/types';
import { createRepository } from '../data/repositoryFactory';
import { SupabaseOkrRepository } from '../data/supabaseRepository';
import { AdminUserService } from '../services/adminUserService';
import { ResourceNotificationService } from '../services/resourceNotificationService';

export function readAppMode(value: string | undefined): AppMode {
  if (!value || value === 'demo') return 'demo';
  if (value === 'supabase') return 'supabase';
  throw new Error(`不支持的 VITE_APP_MODE: ${value}`);
}

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const appMode = readAppMode(import.meta.env.VITE_APP_MODE);
export const repository = createRepository({
  mode: appMode,
  supabaseUrl,
  supabaseAnonKey,
});

export const adminUserService = repository instanceof SupabaseOkrRepository
  ? new AdminUserService(repository.client)
  : undefined;

export const resourceNotificationService = repository instanceof SupabaseOkrRepository
  ? new ResourceNotificationService(repository.client)
  : undefined;
