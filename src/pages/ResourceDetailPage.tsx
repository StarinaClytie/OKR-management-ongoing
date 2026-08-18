import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ResourceFormModal, type ResourceFormValues } from '../components/ResourceFormModal';
import { ResourceStatusBadge } from '../components/ResourceStatusBadge';
import { resourceCategoryKeys, resourceKindKeys, resourceProblemStatusKeys, resourceProblemTypeKeys, resourceProblemTypes } from '../components/resourceLabels';
import type { OkrRepository, ResourceDetail, ResourceProblem } from '../data/types';
import type { ResourceProblemType } from '../domain/types';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { repositoryErrorKey } from '../i18n/repositoryErrors';
import { repository, resourceNotificationService } from '../lib/supabase';
import { AccessDeniedPage } from './AccessDeniedPage';

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ResourceDetail };

function dateOf(value: string): string {
  return value ? value.slice(0, 10) : '—';
}

export function ResourceDetailPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { resourceId } = useParams();
  const { t } = useLocale();
  const { currentUser } = useAuth();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<ResourceProblem | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [reportType, setReportType] = useState<ResourceProblemType>('location_incorrect');
  const [reportDescription, setReportDescription] = useState('');
  const [reportFieldError, setReportFieldError] = useState<string | undefined>(undefined);

  const [resolutionNote, setResolutionNote] = useState('');
  const [resolveFieldError, setResolveFieldError] = useState<string | undefined>(undefined);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!resourceId) return;
    setState({ status: 'loading' });
    try {
      const result = await dataRepository.getResourceDetail(resourceId);
      setState(result.ok ? { status: 'ready', data: result.data } : { status: 'error' });
    } catch {
      setState({ status: 'error' });
    }
  }, [resourceId, dataRepository]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!currentUser) return null;

  if (state.status === 'loading') {
    return (
      <section className="business-page" aria-labelledby="resource-detail-title">
        <p role="status">{t('common.loading')}</p>
      </section>
    );
  }

  if (state.status === 'error') return <AccessDeniedPage />;

  const detail = state.data;
  const isAdminOrMgmt = currentUser.role === 'management' || currentUser.role === 'administrator';
  const isOwner = detail.ownerId === currentUser.id;
  const canEdit = isAdminOrMgmt || isOwner;
  const canResolve = isAdminOrMgmt || isOwner;
  const isArchived = detail.status === 'archived';

  const openProblems = detail.problems.filter((problem) => problem.status === 'open');
  const resolvedProblems = detail.problems.filter((problem) => problem.status === 'resolved');

  function closeModals() {
    setEditOpen(false);
    setReportOpen(false);
    setResolveTarget(null);
    setArchiveConfirm(false);
    setUploadOpen(false);
    setFormError(undefined);
    setReportFieldError(undefined);
    setResolveFieldError(undefined);
    setUploadError(undefined);
    setUploadFile(null);
    setSubmitting(false);
  }

  function toNumber(value: string): number | null {
    return value.trim() === '' ? null : Number(value);
  }

  async function handleEdit(values: ResourceFormValues) {
    setSubmitting(true);
    setFormError(undefined);
    const result = await dataRepository.updateResource({
      resourceId: detail.id,
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
      status: values.status,
    });
    setSubmitting(false);
    if (result.ok) {
      closeModals();
      setNotice('resources.updateSuccess');
      await refresh();
    } else {
      setFormError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleArchive() {
    setSubmitting(true);
    const result = isArchived
      ? await dataRepository.restoreResource(detail.id)
      : await dataRepository.archiveResource(detail.id);
    setSubmitting(false);
    setArchiveConfirm(false);
    if (result.ok) {
      setNotice(isArchived ? 'resources.restoreSuccess' : 'resources.archiveSuccess');
      await refresh();
    } else {
      setNotice(repositoryErrorKey(result.error.code));
    }
  }

  async function handleReport(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (reportDescription.trim() === '') {
      setReportFieldError(t('resources.validation.problemDescriptionRequired'));
      return;
    }
    setReportFieldError(undefined);
    setSubmitting(true);
    const result = await dataRepository.reportResourceProblem({
      resourceId: detail.id,
      problemType: reportType,
      description: reportDescription.trim(),
    });
    if (result.ok) {
      let delivered = false;
      if (resourceNotificationService) {
        delivered = (await resourceNotificationService.notify(result.data.notificationId)).delivered;
      }
      setSubmitting(false);
      closeModals();
      setNotice(delivered ? 'resources.reportSuccess' : 'resources.reportSuccessEmailFailed');
      await refresh();
    } else {
      setSubmitting(false);
      setReportFieldError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleResolve() {
    if (!resolveTarget) return;
    if (resolutionNote.trim() === '') {
      setResolveFieldError(t('resources.validation.problemDescriptionRequired'));
      return;
    }
    setSubmitting(true);
    setResolveFieldError(undefined);
    const result = await dataRepository.resolveResourceProblem({
      problemId: resolveTarget.id,
      resolutionNote: resolutionNote.trim(),
    });
    setSubmitting(false);
    if (result.ok) {
      closeModals();
      setNotice('resources.resolveSuccess');
      await refresh();
    } else {
      setResolveFieldError(t(repositoryErrorKey(result.error.code)));
    }
  }

  async function handleRetryNotification(problem: ResourceProblem) {
    setSubmitting(true);
    const result = await dataRepository.retryResourceProblemNotification(problem.id);
    if (!result.ok) {
      setSubmitting(false);
      setNotice(repositoryErrorKey(result.error.code));
      return;
    }
    const { notificationId, status } = result.data;
    if (status === 'sent') {
      setSubmitting(false);
      setNotice('resources.notificationAlreadySent');
      await refresh();
      return;
    }
    if (status === 'sending') {
      setSubmitting(false);
      setNotice('resources.notificationSending');
      return;
    }
    let delivered = false;
    if (resourceNotificationService) {
      delivered = (await resourceNotificationService.notify(notificationId)).delivered;
    }
    setSubmitting(false);
    setNotice(delivered ? 'resources.notificationResent' : 'resources.notificationResendFailed');
    await refresh();
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!uploadFile) return;
    setSubmitting(true);
    setUploadError(undefined);
    const result = await dataRepository.uploadResourceAttachment(detail.id, uploadFile);
    setSubmitting(false);
    if (result.ok) {
      closeModals();
      await refresh();
    } else {
      setUploadError(result.error.message);
    }
  }

  async function downloadAttachment(attachmentId: string) {
    const result = await dataRepository.createResourceAttachmentDownload(attachmentId);
    if (result.ok) {
      window.open(result.data.url, '_blank', 'noopener');
    }
  }

  function quantityText(): string {
    if (detail.quantity === null) return '—';
    return detail.unit ? `${detail.quantity} ${detail.unit}` : String(detail.quantity);
  }

  return (
    <section className="business-page" aria-labelledby="resource-detail-title">
      <Link className="text-link" to="/resources">{t('resources.detailBack')}</Link>
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">{t('common.workspace')}</p>
          <h1 id="resource-detail-title">{detail.name}</h1>
          <p>{detail.description}</p>
        </div>
        <div className="page-header__actions">
          {!isArchived ? (
            <button className="button button--secondary" onClick={() => { setReportType('location_incorrect'); setReportDescription(''); setReportFieldError(undefined); setReportOpen(true); }}>
              {t('resources.reportProblem')}
            </button>
          ) : null}
          {canEdit && !isArchived ? <button className="button button--secondary" onClick={() => { setFormError(undefined); setEditOpen(true); }}>{t('resources.edit')}</button> : null}
          {canEdit && !isArchived ? <button className="button button--secondary" onClick={() => { setUploadFile(null); setUploadError(undefined); setUploadOpen(true); }}>{t('resources.uploadAttachment')}</button> : null}
          {canEdit ? (
            <button className="button button--secondary" onClick={() => setArchiveConfirm(true)}>
              {isArchived ? t('resources.restore') : t('resources.archive')}
            </button>
          ) : null}
        </div>
      </header>

      {notice ? <p className="page-notice" role="status">{t(notice)}</p> : null}
      {isArchived ? <p className="page-notice" role="status">{t('resources.archivedBadge')}</p> : null}

      <dl className="project-detail__meta">
        <dt>{t('resources.ownerLabel')}</dt>
        <dd>{detail.ownerName || '—'}</dd>
        <dt>{t('table.category')}</dt>
        <dd>{t(resourceCategoryKeys[detail.category])}</dd>
        <dt>{t('table.status')}</dt>
        <dd><ResourceStatusBadge status={detail.status} /></dd>
        <dt>{t('resources.kindLabel')}</dt>
        <dd>{t(resourceKindKeys[detail.resourceKind])}</dd>
        <dt>{t('resources.locationLabel')}</dt>
        <dd>{detail.location}</dd>
        <dt>{t('resources.quantityLabel')}</dt>
        <dd>{quantityText()}</dd>
        <dt>{t('resources.purchaseDateLabel')}</dt>
        <dd>{detail.purchaseDate ? detail.purchaseDate : '—'}</dd>
        <dt>{t('resources.vendorLabel')}</dt>
        <dd>{detail.purchaseVendor || '—'}</dd>
        <dt>{t('resources.referenceLabel')}</dt>
        <dd>{detail.purchaseReference ? <a className="text-link" href={detail.purchaseReference} target="_blank" rel="noreferrer">{detail.purchaseReference}</a> : '—'}</dd>
        <dt>{t('resources.createdAtLabel')}</dt>
        <dd>{dateOf(detail.createdAt)}</dd>
        <dt>{t('resources.updatedAtLabel')}</dt>
        <dd>{dateOf(detail.updatedAt)}</dd>
      </dl>

      <section className="page-section" aria-labelledby="resource-instructions-title">
        <h2 id="resource-instructions-title">{t('resources.section.instructions')}</h2>
        <p>{detail.usageNotes || t('resources.noUsageNotes')}</p>
        {detail.manualUrl ? (
          <a className="text-link" href={detail.manualUrl} target="_blank" rel="noreferrer">{t('resources.manualLink')}</a>
        ) : null}
      </section>

      <section className="page-section" aria-labelledby="resource-attachments-title">
        <h2 id="resource-attachments-title">{t('resources.section.attachments')}</h2>
        {detail.attachments.length === 0 ? (
          <p className="data-table__empty">{t('resources.noAttachments')}</p>
        ) : (
          <ul className="member-list">
            {detail.attachments.map((attachment) => (
              <li key={attachment.id} className="member-list__row">
                <div className="member-list__identity">
                  <span className="member-list__name">{attachment.fileName}</span>
                  <span className="member-list__meta">{attachment.mimeType}</span>
                </div>
                <button className="button button--secondary" onClick={() => void downloadAttachment(attachment.id)}>{t('resources.attachmentDownload')}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="page-section" aria-labelledby="resource-problems-title">
        <h2 id="resource-problems-title">{t('resources.section.problems')}</h2>
        <h3>{t('resources.openProblems')}</h3>
        {openProblems.length === 0 ? <p className="data-table__empty">{t('resources.noProblems')}</p> : (
          <ul className="member-list">
            {openProblems.map((problem) => (
              <li key={problem.id} className="member-list__row">
                <div className="member-list__identity">
                  <span className="member-list__name">{t(resourceProblemTypeKeys[problem.problemType])}</span>
                  <span className="member-list__meta">{problem.reporterName} · {dateOf(problem.reportedAt)}</span>
                  <span className="member-list__meta">{problem.description}</span>
                </div>
                {canResolve && (problem.notificationStatus === 'failed' || problem.notificationStatus === 'pending') ? (
                  <button className="button button--secondary" disabled={submitting} onClick={() => void handleRetryNotification(problem)}>{t('resources.retryNotification')}</button>
                ) : null}
                {canResolve ? <button className="button button--secondary" onClick={() => { setResolutionNote(''); setResolveFieldError(undefined); setResolveTarget(problem); }}>{t('resources.resolveProblem')}</button> : null}
              </li>
            ))}
          </ul>
        )}
        <h3>{t('resources.resolvedProblems')}</h3>
        {resolvedProblems.length === 0 ? <p className="data-table__empty">{t('resources.noProblems')}</p> : (
          <ul className="member-list">
            {resolvedProblems.map((problem) => (
              <li key={problem.id} className="member-list__row">
                <div className="member-list__identity">
                  <span className="member-list__name">{t(resourceProblemTypeKeys[problem.problemType])}</span>
                  <span className="member-list__meta">{problem.reporterName} · {dateOf(problem.reportedAt)} · {t(resourceProblemStatusKeys.resolved)}</span>
                  <span className="member-list__meta">{problem.description}</span>
                  {problem.resolutionNote ? <span className="member-list__meta">{problem.resolutionNote}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editOpen ? (
        <ResourceFormModal
          title={t('resources.editTitle')}
          mode="edit"
          initial={{
            name: detail.name,
            category: detail.category,
            resourceKind: detail.resourceKind,
            description: detail.description,
            location: detail.location,
            purchaseDate: detail.purchaseDate ?? '',
            purchaseVendor: detail.purchaseVendor ?? '',
            purchaseReference: detail.purchaseReference ?? '',
            quantity: detail.quantity === null ? '' : String(detail.quantity),
            unit: detail.unit ?? '',
            usageNotes: detail.usageNotes ?? '',
            manualUrl: detail.manualUrl ?? '',
            attachmentFile: null,
            status: detail.status,
          }}
          ownerName={detail.ownerName || '—'}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => void handleEdit(values)}
          onClose={closeModals}
        />
      ) : null}

      {reportOpen ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) closeModals(); }}>
          <form className="modal-panel" role="dialog" aria-modal="true" aria-label={t('resources.reportProblemTitle')} onSubmit={(event) => void handleReport(event)} noValidate>
            <h2>{t('resources.reportProblemTitle')}</h2>
            <label className="modal-field">
              <span>{t('resources.field.problemType')} *</span>
              <select value={reportType} onChange={(event) => setReportType(event.target.value as ResourceProblemType)}>
                {resourceProblemTypes.map((type) => <option key={type} value={type}>{t(resourceProblemTypeKeys[type])}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>{t('resources.field.problemDescription')} *</span>
              <textarea value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} rows={3} placeholder={t('resources.problemDescriptionPlaceholder')} required />
            </label>
            {reportFieldError ? <p className="form-error" role="alert">{reportFieldError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={closeModals}>{t('common.cancel')}</button>
              <button type="submit" className="button button--primary" disabled={submitting || reportDescription.trim() === ''}>
                {submitting ? t('common.saving') : t('resources.submitReport')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {resolveTarget ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) closeModals(); }}>
          <form className="modal-panel" role="dialog" aria-modal="true" aria-label={t('resources.resolveTitle')} onSubmit={(event) => { event.preventDefault(); void handleResolve(); }} noValidate>
            <h2>{t('resources.resolveTitle')}</h2>
            <label className="modal-field">
              <span>{t('resources.field.resolutionNote')} *</span>
              <textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={3} required />
            </label>
            {resolveFieldError ? <p className="form-error" role="alert">{resolveFieldError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={closeModals}>{t('common.cancel')}</button>
              <button type="submit" className="button button--primary" disabled={submitting || resolutionNote.trim() === ''}>
                {submitting ? t('common.saving') : t('resources.resolveSubmit')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {uploadOpen ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) closeModals(); }}>
          <form className="modal-panel" role="dialog" aria-modal="true" aria-label={t('resources.uploadAttachment')} onSubmit={(event) => void handleUpload(event)} noValidate>
            <h2>{t('resources.uploadAttachment')}</h2>
            <label className="modal-field">
              <span>{t('daily.chooseAttachment')}</span>
              <input type="file" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
            </label>
            {uploadError ? <p className="form-error" role="alert">{uploadError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={closeModals}>{t('common.cancel')}</button>
              <button type="submit" className="button button--primary" disabled={submitting || !uploadFile}>
                {submitting ? t('common.saving') : t('resources.upload')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {archiveConfirm ? (
        <div className="modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) setArchiveConfirm(false); }}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label={t('resources.archiveConfirmTitle')}>
            <h2>{isArchived ? t('resources.restore') : t('resources.archiveConfirmTitle')}</h2>
            <p>{t('resources.archiveConfirmBody')}</p>
            <p className="users-delete-target">{detail.name}</p>
            <div className="modal-actions">
              <button type="button" className="button button--secondary" onClick={() => setArchiveConfirm(false)}>{t('common.cancel')}</button>
              <button type="button" className="button button--danger" disabled={submitting} onClick={() => void handleArchive()}>
                {submitting ? t('common.saving') : isArchived ? t('resources.restore') : t('resources.confirmArchive')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
