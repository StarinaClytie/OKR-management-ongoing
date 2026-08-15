import { createClient } from '@supabase/supabase-js';
import { DemoOkrRepository } from './demoRepository';
import { SupabaseOkrRepository } from './supabaseRepository';
import type { AppMode, OkrRepository, SupabaseClientLike } from './types';

interface RepositoryFactoryOptions {
  mode: AppMode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  createSupabaseClient?: (url: string, key: string) => SupabaseClientLike;
}

export function createRepository(options: RepositoryFactoryOptions): OkrRepository {
  if (options.mode === 'demo') return new DemoOkrRepository();
  if (!options.supabaseUrl?.trim()) throw new Error('Supabase 模式缺少 VITE_SUPABASE_URL');
  if (!options.supabaseAnonKey?.trim()) throw new Error('Supabase 模式缺少 VITE_SUPABASE_ANON_KEY');
  const factory = options.createSupabaseClient ?? ((url, key) => createClient(url, key) as unknown as SupabaseClientLike);
  return new SupabaseOkrRepository(factory(options.supabaseUrl, options.supabaseAnonKey));
}
