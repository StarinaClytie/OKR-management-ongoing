import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { OrganizationUser } from '../data/types';
import type { ResourceCategory, ResourceKind, ResourceStatus } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import { validateAttachment } from '../services/attachmentService';
import { resourceCategories, resourceCategoryKeys, resourceKinds, resourceKindKeys, resourceStatuses, resourceStatusKeys } from './resourceLabels';

export interface ResourceFormValues {
  ownerId: string;
  name: string;
  category: ResourceCategory;
  resourceKind: ResourceKind;
  description: string;
  location: string;
  purchaseDate: string;
  purchaseVendor: string;
  purchaseReference: string;
  quantity: string;
  unit: string;
  usageNotes: string;
  manualUrl: string;
  attachmentFile: File | null;
  status: ResourceStatus;
}

export interface ResourceFormModalProps {
  title: string;
  mode: 'create' | 'edit';
  initial: ResourceFormValues;
  ownerName?: string;
  ownerOptions?: OrganizationUser[];
  ownersLoading?: boolean;
  submitting?: boolean;
  error?: string;
  onSubmit: (values: ResourceFormValues) => void;
  onClose: () => void;
}

function isHttpUrl(value: string): boolean {
  if (value.trim() === '') return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ResourceFormModal({
  title,
  mode,
  initial,
  ownerName,
  ownerOptions = [],
  ownersLoading = false,
  submitting = false,
  error,
  onSubmit,
  onClose,
}: ResourceFormModalProps) {
  const { t } = useLocale();
  const [values, setValues] = useState<ResourceFormValues>(initial);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const isCreate = mode === 'create';

  useEffect(() => {
    firstFieldRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function set<K extends keyof ResourceFormValues>(key: K, value: ResourceFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldError(undefined);
  }

  const nameValid = values.name.trim() !== '';
  const locationValid = values.location.trim() !== '';
  const quantityValid = values.quantity.trim() === '' || (Number.isFinite(Number(values.quantity)) && Number(values.quantity) >= 0);
  const manualUrlValid = isHttpUrl(values.manualUrl);
  const referenceValid = isHttpUrl(values.purchaseReference);
  const attachmentError = values.attachmentFile ? validateAttachment(values.attachmentFile) : null;
  const ownerValid = !isCreate || (!ownersLoading && ownerOptions.some((owner) => owner.id === values.ownerId));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!ownerValid) return;
    if (!nameValid) {
      setFieldError(t('resources.validation.nameRequired'));
      return;
    }
    if (!locationValid) {
      setFieldError(t('resources.validation.locationRequired'));
      return;
    }
    if (!quantityValid) {
      setFieldError(t('resources.validation.quantityInvalid'));
      return;
    }
    if (!manualUrlValid) {
      setFieldError(t('resources.validation.manualUrlInvalid'));
      return;
    }
    if (!referenceValid) {
      setFieldError(t('resources.validation.referenceInvalid'));
      return;
    }
    if (attachmentError) {
      setFieldError(attachmentError.message);
      return;
    }
    setFieldError(undefined);
    onSubmit({ ...values, name: values.name.trim(), location: values.location.trim() });
  }

  const submitDisabled = submitting || !ownerValid || !nameValid || !locationValid || !quantityValid || !manualUrlValid || !referenceValid;

  return (
    <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onSubmit={handleSubmit} noValidate>
        <h2>{title}</h2>

        <label className="modal-field">
          <span>{t('resources.field.name')} *</span>
          <input ref={firstFieldRef} value={values.name} onChange={(event) => set('name', event.target.value)} required />
        </label>

        {isCreate ? (
          <label className="modal-field">
            <span>{t('resources.field.owner')} *</span>
            <select
              value={values.ownerId}
              disabled={ownersLoading || ownerOptions.length === 0}
              onChange={(event) => set('ownerId', event.target.value)}
              required
            >
              {ownersLoading ? <option value={values.ownerId}>{t('common.loading')}</option> : null}
              {!ownersLoading && ownerOptions.length === 0 ? <option value="">—</option> : null}
              {!ownersLoading ? ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>) : null}
            </select>
          </label>
        ) : (
          <div className="modal-field">
            <span>{t('resources.field.owner')}</span>
            <input value={ownerName ?? '—'} disabled />
          </div>
        )}

        <label className="modal-field">
          <span>{t('resources.field.category')} *</span>
          <select value={values.category} onChange={(event) => set('category', event.target.value as ResourceCategory)}>
            {resourceCategories.map((category) => <option key={category} value={category}>{t(resourceCategoryKeys[category])}</option>)}
          </select>
        </label>

        <label className="modal-field">
          <span>{t('resources.field.kind')} *</span>
          <select value={values.resourceKind} onChange={(event) => set('resourceKind', event.target.value as ResourceKind)}>
            {resourceKinds.map((kind) => <option key={kind} value={kind}>{t(resourceKindKeys[kind])}</option>)}
          </select>
        </label>

        <label className="modal-field">
          <span>{t('resources.field.location')} *</span>
          <input value={values.location} onChange={(event) => set('location', event.target.value)} placeholder="Optics Lab / Cabinet A" required />
        </label>

        {!isCreate ? (
          <label className="modal-field">
            <span>{t('resources.field.status')} *</span>
            <select value={values.status} onChange={(event) => set('status', event.target.value as ResourceStatus)}>
              {resourceStatuses.map((status) => <option key={status} value={status}>{t(resourceStatusKeys[status])}</option>)}
            </select>
          </label>
        ) : null}

        <label className="modal-field">
          <span>{t('resources.field.description')}</span>
          <textarea value={values.description} onChange={(event) => set('description', event.target.value)} rows={2} />
        </label>

        <label className="modal-field">
          <span>{t('resources.field.purchaseDate')}</span>
          <input type="date" value={values.purchaseDate} onChange={(event) => set('purchaseDate', event.target.value)} />
        </label>

        <label className="modal-field">
          <span>{t('resources.field.purchaseVendor')}</span>
          <input value={values.purchaseVendor} onChange={(event) => set('purchaseVendor', event.target.value)} placeholder="Thorlabs / Edmund Optics / Taobao" />
        </label>

        <label className="modal-field">
          <span>{t('resources.field.purchaseReference')}</span>
          <input type="url" value={values.purchaseReference} onChange={(event) => set('purchaseReference', event.target.value)} placeholder="https://" />
        </label>

        <div className="modal-field">
          <span>{t('resources.field.quantity')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <input type="number" min="0" step="any" value={values.quantity} onChange={(event) => set('quantity', event.target.value)} placeholder="500" />
            <input value={values.unit} onChange={(event) => set('unit', event.target.value)} placeholder={t('resources.field.unit')} />
          </div>
        </div>

        <label className="modal-field">
          <span>{t('resources.field.usageNotes')}</span>
          <textarea value={values.usageNotes} onChange={(event) => set('usageNotes', event.target.value)} rows={2} />
        </label>

        <label className="modal-field">
          <span>{t('resources.field.manualUrl')}</span>
          <input type="url" value={values.manualUrl} onChange={(event) => set('manualUrl', event.target.value)} placeholder="https://" />
        </label>

        {isCreate ? (
          <label className="modal-field">
            <span>{t('resources.field.attachment')}</span>
            <input type="file" onChange={(event) => set('attachmentFile', event.target.files?.[0] ?? null)} />
          </label>
        ) : null}

        {error || fieldError ? <p className="form-error" role="alert">{error ?? fieldError}</p> : null}

        <div className="modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="button button--primary" disabled={submitDisabled}>
            {submitting ? t('common.saving') : t('projects.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
