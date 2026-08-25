import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createRepository } from './repositoryFactory';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}));

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
        signUp: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
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

  it('constructs the browser auth client with skipAutoInitialize so the provider owns initialization', () => {
    const repository = createRepository({
      mode: 'supabase',
      supabaseUrl: 'https://project.supabase.co',
      supabaseAnonKey: 'publishable-key',
    });

    expect(repository.mode).toBe('supabase');
    // The default factory must defer the GoTrueClient constructor's automatic
    // initialize() so SupabaseAuthProvider can subscribe before driving it.
    expect(vi.mocked(createClient)).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'publishable-key',
      { auth: { skipAutoInitialize: true } },
    );
  });
});
