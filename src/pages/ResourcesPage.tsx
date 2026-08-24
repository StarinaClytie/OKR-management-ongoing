import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/permissionService';
import { DataTable } from '../components/DataTable';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { ResourceFormModal, type ResourceFormValues } from '../components/ResourceFormModal';
import { ResourceStatusBadge } from '../components/ResourceStatusBadge';
import { resourceCategories, resourceCategoryKeys, resourceStatusKeys, resourceStatuses } from '../components/resourceLabels';
import type { OkrRepository, OrganizationUser, Resource } from '../data/types';
import type { PermissionScope } from '../domain/permissions';
import type { ResourceCategory, ResourceStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import { repository } from '../lib/supabase';

function quantityLabel(resource: Resource): string {
  if (resource.quantity === null) return '—';
  return resource.unit ? `${resource.quantity} ${resource.unit}` : String(resource.quantity);
}

export function ResourcesPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser } = useAuth();

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ResourceCategory | ''>('');
  const [status, setStatus] = useState<ResourceStatus | ''>('');
  const [owner, setOwner] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<OrganizationUser[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dataRepository.listResources();
      if (!result.ok) {
        setLoadError('common.requestFailed');
        return;
      }
      setLoadError(null);
      setResources(result.data);
    } catch {
      setLoadError('common.requestFailed');
    } finally {
      setLoading(false);
    }
  }, [dataRepository]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let active = true;
    if (!currentUser || dataRepository.mode !== 'supabase') {
      setOwnerOptions([]);
      setOwnersLoading(false);
      return () => { active = false; };
    }

    setOwnersLoading(true);
    void dataRepository.listEligibleResourceOwners()
      .then((result) => {
        if (!active) return;
        setOwnerOptions(result.ok ? result.data : []);
      })
      .catch(() => {
        if (active) setOwnerOptions([]);
      })
      .finally(() => {
        if (active) setOwnersLoading(false);
      });
    return () => { active = false; };
  }, [currentUser, dataRepository]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const resource of resources) map.set(resource.ownerId, resource.ownerName || '—');
    return Array.from(map.entries());
  }, [resources]);

  if (!currentUser) return null;

  const createScope: PermissionScope = {
    resourceId: 'resource-create',
    resourceType: 'resource',
    ownerId: currentUser.id,
    classification: 'internal',
  };

  const visible = resources.filter((resource) => {
    if (!showArchived && resource.status === 'archived') return false;
    if (search.trim() !== '' && !resource.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (category !== '' && resource.category !== category) return false;
    if (status !== '' && resource.status !== status) return false;
    if (owner !== '' && resource.ownerId !== owner) return false;
    return true;
  });

  const totals = {
    all: resources.length,
    available: resources.filter((resource) => resource.status === 'available').length,
    issues: resources.filter((resource) => ['maintenance', 'damaged', 'missing', 'out_of_stock'].includes(resource.status)).length,
    missingDamaged: resources.filter((resource) => resource.status === 'missing' || resource.status === 'damaged').length,
  };

  function toNumber(value: string): number | null {
    return value.trim() === '' ? null : Number(value);
  }

  async function handleCreate(values: ResourceFormValues) {
    setSubmitting(true);
    setFormError(undefined);
    const created = await dataRepository.createResource({
      ownerId: values.ownerId,
      name: values.name,
      category: values.category,
      resourceKind: values.resourceKind,
      description: values.description,
      location: values.location,
      purchaseDate: values.purchaseDate === '' ? null : values.purchaseDate,
      purchaseVendor: values.purchaseVendor,
      purchaseReference: values.purchaseReference,
      usageNotes: values.usageNotes,
      manualUrl: values.manualUrl,
      quantity: toNumber(values.quantity),
      unit: values.unit,
    });
    if (!created.ok) {
      setSubmitting(false);
      setFormError(t(repositoryErrorKey(created.error.code)));
      return;
    }

    // Optional instructions attachment. The resource is already persisted, so an
    // upload failure must never roll it back — it only downgrades the notice.
    let attachmentFailed = false;
    if (values.attachmentFile) {
      const uploaded = await dataRepository.uploadResourceAttachment(created.data.id, values.attachmentFile);
      attachmentFailed = !uploaded.ok;
    }

    setSubmitting(false);
    setCreateOpen(false);
    setNotice(attachmentFailed ? 'resources.createSuccessAttachmentFailed' : 'resources.createSuccess');
    await refresh();
  }

  return (
    <section className="business-page" aria-labelledby="resources-page-title">
      <PageHeader
        title={t('resources.title')}
        description={t('resources.description')}
        primaryAction={dataRepository.mode === 'supabase' && can(currentUser, 'resource.create', createScope).allowed ? { label: t('resources.create'), onClick: () => { setFormError(undefined); setCreateOpen(true); } } : undefined}
      />
      {notice ? <p className="page-notice" role="status">{t(notice)}</p> : null}

      <div className="metric-row">
        <MetricCard label={t('resources.summary.total')} value={totals.all} />
        <MetricCard label={t('resources.summary.available')} value={totals.available} />
        <MetricCard label={t('resources.summary.issues')} value={totals.issues} />
        <MetricCard label={t('resources.summary.missingDamaged')} value={totals.missingDamaged} />
      </div>

      <section className="resources-filter-card" aria-label={t('resources.title')}>
        <div className="resources-filter-card__search-row" data-testid="resources-search-row">
          <input
            type="search"
            aria-label={t('resources.searchPlaceholder')}
            placeholder={t('resources.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="resources-filter-card__filter-row" data-testid="resources-filter-row">
          <label>
            {t('resources.filterCategory')}
            <select aria-label={t('resources.filterCategory')} value={category} onChange={(event) => setCategory(event.target.value as ResourceCategory | '')}>
              <option value="">{t('resources.allCategories')}</option>
              {resourceCategories.map((item) => <option key={item} value={item}>{t(resourceCategoryKeys[item])}</option>)}
            </select>
          </label>
          <label>
            {t('resources.filterStatus')}
            <select aria-label={t('resources.filterStatus')} value={status} onChange={(event) => setStatus(event.target.value as ResourceStatus | '')}>
              <option value="">{t('resources.allStatuses')}</option>
              {resourceStatuses.map((item) => <option key={item} value={item}>{t(resourceStatusKeys[item])}</option>)}
            </select>
          </label>
          <label>
            {t('resources.filterOwner')}
            <select aria-label={t('resources.filterOwner')} value={owner} onChange={(event) => setOwner(event.target.value)}>
              <option value="">{t('resources.allOwners')}</option>
              {owners.map(([ownerId, ownerName]) => <option key={ownerId} value={ownerId}>{ownerName}</option>)}
            </select>
          </label>
          <button className="button button--secondary" type="button" onClick={() => setShowArchived((value) => !value)}>
            {showArchived ? t('resources.hideArchived') : t('resources.showArchived')}
          </button>
        </div>
      </section>

      {loading ? (
        <p role="status">{t('common.loading')}</p>
      ) : loadError ? (
        <p role="alert">{t(loadError)}</p>
      ) : (
        <DataTable
          ariaLabel={t('resources.title')}
          rows={visible}
          getRowKey={(resource) => resource.id}
          emptyMessage={t('resources.empty')}
          columns={[
            { key: 'name', label: t('table.resource'), render: (resource) => <Link className="text-link" to={`/resources/${resource.id}`}>{resource.name}</Link> },
            { key: 'category', label: t('table.category'), render: (resource) => t(resourceCategoryKeys[resource.category]) },
            { key: 'status', label: t('table.status'), render: (resource) => <ResourceStatusBadge status={resource.status} /> },
            { key: 'location', label: t('table.location'), render: (resource) => resource.location },
            { key: 'owner', label: t('table.owner'), render: (resource) => resource.ownerName || '—' },
            { key: 'quantity', label: t('table.quantity'), render: (resource) => quantityLabel(resource) },
            { key: 'updated', label: t('table.updated'), render: (resource) => resource.updatedAt.slice(0, 10) },
          ]}
        />
      )}

      {createOpen ? (
        <ResourceFormModal
          title={t('resources.createTitle')}
          mode="create"
          initial={{
            ownerId: currentUser.id,
            name: '', category: 'other', resourceKind: 'durable', description: '', location: '',
            purchaseDate: '', purchaseVendor: '', purchaseReference: '', quantity: '', unit: '',
            usageNotes: '', manualUrl: '', attachmentFile: null, status: 'available',
          }}
          ownerOptions={ownerOptions}
          ownersLoading={ownersLoading}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => void handleCreate(values)}
          onClose={() => { setCreateOpen(false); setFormError(undefined); setSubmitting(false); }}
        />
      ) : null}
    </section>
  );
}
