import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import type { Action, PermissionResource } from '../domain/permissions';
import { useAuth } from './AuthContext';
import { can } from './permissionService';

export interface ProtectedRouteProps extends PropsWithChildren {
  action: Action;
  resource?: PermissionResource;
}

export function ProtectedRoute({ action, resource, children }: ProtectedRouteProps) {
  const { currentUser } = useAuth();

  if (!can(currentUser, action, resource).allowed) {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}
