import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import type { User } from '../domain/types';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { ProfilePage } from './ProfilePage';

const user: User = {
  id: 'u1',
  name: '陈安',
  role: 'administrator',
  clearance: 'internal',
  title: '系统管理员',
  department: '信息技术部',
  projectIds: [],
  organization: 'Acme',
};

describe('ProfilePage', () => {
  it('shows the signed-in user profile fields', () => {
    const value: AuthContextValue = {
      status: 'ready',
      mode: 'supabase',
      currentUser: user,
      email: 'admin@example.com',
      selectableUsers: [],
      selectUser: vi.fn(),
      signOut: vi.fn(),
    };
    render(
      <AuthContext.Provider value={value}>
        <LocaleProvider repository={{ mode: 'supabase' } as OkrRepository}>
          <ProfilePage />
        </LocaleProvider>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('陈安')).toBeVisible();
    expect(screen.getByText('admin@example.com')).toBeVisible();
    expect(screen.getByText('管理员')).toBeVisible();
    expect(screen.getByText('信息技术部')).toBeVisible();
    expect(screen.getByText('系统管理员')).toBeVisible();
    expect(screen.getByText('Acme')).toBeVisible();
  });
});
