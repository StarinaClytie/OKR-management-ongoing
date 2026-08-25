import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import type { User } from '../domain/types';
import type { AppMode } from '../data/types';
import { users } from '../mocks/users';

const selectableUserIds = new Set([
  'user-administrator',
  'user-management',
  'user-project-leader',
  'user-employee',
  'user-hr',
  'user-zhang-san',
  'user-li-ming',
  'user-wang-fang',
  'user-chen-hao',
]);

export const selectableUsers = users.filter((user) => selectableUserIds.has(user.id));

export interface SignUpResult {
  error: { message: string } | null;
}

export interface AuthContextValue {
  status: 'loading' | 'signed_out' | 'pending_approval' | 'inactive' | 'account_error' | 'email_verification_pending' | 'recovery' | 'ready';
  mode: AppMode;
  currentUser: User | undefined;
  email?: string;
  selectableUsers: readonly User[];
  selectUser: (userId: string) => void;
  signOut: () => Promise<void>;
  signUp?: (displayName: string, email: string, password: string) => Promise<SignUpResult>;
  refreshProfile?: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps extends PropsWithChildren {
  initialUserId?: string;
}

export function AuthProvider({ children, initialUserId = 'user-employee' }: AuthProviderProps) {
  const [currentUserId, setCurrentUserId] = useState(initialUserId);
  const currentUser = selectableUsers.find((user) => user.id === currentUserId);
  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      status: currentUser ? 'ready' : 'account_error',
      mode: 'demo',
      email: undefined,
      selectableUsers,
      selectUser: setCurrentUserId,
      signOut: async () => undefined,
      signUp: async () => ({ error: null }),
      refreshProfile: async () => undefined,
    }),
    [currentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 中使用');
  }
  return context;
}
