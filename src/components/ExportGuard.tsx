import { cloneElement, type ReactElement, type SyntheticEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PermissionGate } from '../auth/PermissionGate';
import { can } from '../auth/permissionService';
import type { PermissionResource } from '../domain/permissions';

export interface ExportGuardProps {
  resource: PermissionResource;
  children: ReactElement<{ disabled?: boolean; 'aria-disabled'?: boolean }>;
}

export function ExportGuard({ resource, children }: ExportGuardProps) {
  const { currentUser } = useAuth();
  const decision = can(currentUser, 'record.export', resource);
  const blockActivation = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <PermissionGate
      action="record.export"
      resource={resource}
      fallback={
        <div
          className="export-guard export-guard--denied"
          onClickCapture={blockActivation}
          onPointerDownCapture={blockActivation}
          onKeyDownCapture={blockActivation}
          onKeyUpCapture={blockActivation}
        >
          {cloneElement(children, { disabled: true, 'aria-disabled': true })}
          <p role="status">你没有导出该记录的权限</p>
          <span>原因：{decision.reason}</span>
        </div>
      }
    >
      {children}
    </PermissionGate>
  );
}
