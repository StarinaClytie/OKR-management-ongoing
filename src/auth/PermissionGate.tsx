import type { PropsWithChildren, ReactNode } from 'react';
import type { Action, PermissionResource } from '../domain/permissions';
import { useAuth } from './AuthContext';
import { can } from './permissionService';

export interface PermissionGateProps extends PropsWithChildren {
  action: Action;
  resource?: PermissionResource;
  fallback?: ReactNode;
}

export function PermissionGate({ action, resource, fallback = null, children }: PermissionGateProps) {
  const { currentUser } = useAuth();

  return can(currentUser, action, resource).allowed ? <>{children}</> : <>{fallback}</>;
}
