import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import type { User } from '../domain/types';
import { users } from '../mocks/users';

const selectableUserIds = new Set([
  'user-administrator',
  'user-management',
  'user-project-leader',
  'user-employee',
  'user-hr',
]);

export const selectableUsers = users.filter((user) => selectableUserIds.has(user.id));

export interface AuthContextValue {
  currentUser: User | undefined;
  selectableUsers: readonly User[];
  selectUser: (userId: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps extends PropsWithChildren {
  initialUserId?: string;
}

export function AuthProvider({ children, initialUserId = 'user-employee' }: AuthProviderProps) {
  const [currentUserId, setCurrentUserId] = useState(initialUserId);
  const currentUser = selectableUsers.find((user) => user.id === currentUserId);
  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      selectableUsers,
      selectUser: setCurrentUserId,
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
