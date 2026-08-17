import { useId } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PermissionGate } from '../auth/PermissionGate';
import { can } from '../auth/permissionService';
import type { PermissionResource } from '../domain/permissions';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const permissionReasonKeys: Record<string, MessageKey> = {
  '需要登录': 'permission.loginRequired',
  '没有访问权限': 'permission.denied',
  '缺少资源上下文': 'permission.resourceMissing',
  '资源上下文不完整': 'permission.resourceIncomplete',
  '操作与资源类型不匹配': 'permission.resourceMismatch',
  '下载或导出需要明确操作授权': 'permission.explicitGrantRequired',
  '严格机密资源需要明确授权': 'permission.restrictedGrantRequired',
  '机密附件或文档需要明确授权': 'permission.confidentialGrantRequired',
  '上行范围仅开放 OKR 摘要': 'permission.summaryOnly',
  '系统管理权限不包含业务正文权限': 'permission.adminNoBusinessBody',
};

export interface ExportGuardProps {
  resource: PermissionResource;
  label: string;
  onExport: () => void;
}

export function ExportGuard({ resource, label, onExport }: ExportGuardProps) {
  const { t } = useLocale();
  const { currentUser } = useAuth();
  const decision = can(currentUser, 'record.export', resource);
  const reasonId = useId();

  return (
    <PermissionGate
      action="record.export"
      resource={resource}
      fallback={
        <div className="export-guard export-guard--denied">
          <button className="button" type="button" disabled aria-describedby={reasonId}>
            {label}
          </button>
          <p role="status">{t('permission.exportDenied')}</p>
          <span id={reasonId}>{t('permission.reason', { reason: permissionReasonKeys[decision.reason] ? t(permissionReasonKeys[decision.reason]) : t('permission.denied') })}</span>
        </div>
      }
    >
      <button className="button" type="button" onClick={onExport}>
        {label}
      </button>
    </PermissionGate>
  );
}
