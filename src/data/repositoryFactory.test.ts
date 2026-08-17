import { describe, expect, it, vi } from 'vitest';
import { createRepository } from './repositoryFactory';

describe('createRepository', () => {
  it('keeps demo mode isolated from Supabase construction', () => {
    const createSupabaseClient = vi.fn();
    const repository = createRepository({ mode: 'demo', createSupabaseClient });

    expect(repository.mode).toBe('demo');
    expect(createSupabaseClient).not.toHaveBeenCalled();
  });

  it('fails fast when Supabase mode has no URL', () => {
    expect(() => createRepository({
      mode: 'supabase',
      supabaseUrl: '',
      supabaseAnonKey: 'publishable-key',
      createSupabaseClient: vi.fn(),
    })).toThrow('VITE_SUPABASE_URL');
  });

  it('fails fast when Supabase mode has no publishable key', () => {
    expect(() => createRepository({
      mode: 'supabase',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: '',
      createSupabaseClient: vi.fn(),
    })).toThrow('VITE_SUPABASE_ANON_KEY');
  });

  it('constructs Supabase exactly once with validated public configuration', () => {
    const client = {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
      storage: { from: vi.fn(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove: vi.fn() })) },
    };
    const createSupabaseClient = vi.fn(() => client);
    const repository = createRepository({
      mode: 'supabase',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'publishable-key',
      createSupabaseClient,
    });

    expect(repository.mode).toBe('supabase');
    expect(createSupabaseClient).toHaveBeenCalledWith('https://project.supabase.co', 'publishable-key');
  });
});
