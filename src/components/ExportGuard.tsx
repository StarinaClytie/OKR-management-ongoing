import { useAuth } from '../auth/AuthContext';
import { PermissionGate } from '../auth/PermissionGate';
import { can } from '../auth/permissionService';
import type { PermissionResource } from '../domain/permissions';

export interface ExportGuardProps {
  resource: PermissionResource;
  label: string;
  onExport: () => void;
}

export function ExportGuard({ resource, label, onExport }: ExportGuardProps) {
  const { currentUser } = useAuth();
  const decision = can(currentUser, 'record.export', resource);

  return (
    <PermissionGate
      action="record.export"
      resource={resource}
      fallback={
        <div className="export-guard export-guard--denied">
          <button className="button" type="button" disabled aria-describedby="export-guard-reason">
            {label}
          </button>
          <p role="status">你没有导出该记录的权限</p>
          <span id="export-guard-reason">原因：{decision.reason}</span>
        </div>
      }
    >
      <button className="button" type="button" onClick={onExport}>
        {label}
      </button>
    </PermissionGate>
  );
}
