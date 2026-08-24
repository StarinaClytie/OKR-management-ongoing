import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { OkrRepository } from '../../data/types';
import type { DailyReportDetail } from '../../domain/types';
import { repositoryErrorKey } from '../../i18n/repositoryErrors';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import { StatusBadge } from '../../components/StatusBadge';

export interface DailyReportDetailDialogProps {
  detail?: DailyReportDetail;
  loading?: boolean;
  error?: MessageKey;
  repository: OkrRepository;
  onClose: () => void;
  onConfirmed: (reportId: string) => void;
  onNotificationMutation?: () => void;
}

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function DailyReportDetailDialog({
  detail,
  loading = false,
  error,
  repository,
  onClose,
  onConfirmed,
  onNotificationMutation,
}: DailyReportDetailDialogProps) {
  const { t } = useLocale();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [currentDetail, setCurrentDetail] = useState(detail);
  const [commentBody, setCommentBody] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<MessageKey>();

  useEffect(() => {
    setCurrentDetail(detail);
    setCommentBody('');
    setActionError(undefined);
  }, [detail]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    const body = commentBody.trim();
    if (!currentDetail?.canComment || body === '' || commenting) return;
    setCommenting(true);
    setActionError(undefined);
    const result = await repository.commentDailyReport(currentDetail.id, body);
    setCommenting(false);
    if (!result.ok) {
      setActionError(repositoryErrorKey(result.error.code));
      return;
    }
    setCurrentDetail((current) => current ? { ...current, comments: [...current.comments, result.data] } : current);
    setCommentBody('');
    onNotificationMutation?.();
  }

  async function confirmReport() {
    if (!currentDetail?.canConfirm || currentDetail.status === 'confirmed' || confirming || !repository.confirmDailyReport) return;
    setConfirming(true);
    setActionError(undefined);
    const result = await repository.confirmDailyReport(currentDetail.id, currentDetail.currentRevision);
    setConfirming(false);
    if (!result.ok) {
      setActionError(repositoryErrorKey(result.error.code));
      return;
    }
    const reportId = currentDetail.id;
    setCurrentDetail((current) => current ? { ...current, status: 'confirmed', canConfirm: false } : current);
    onConfirmed(reportId);
    onNotificationMutation?.();
  }

  async function downloadAttachment(attachmentId: string) {
    setActionError(undefined);
    const result = await repository.createAttachmentDownload(attachmentId);
    if (!result.ok) {
      setActionError(repositoryErrorKey(result.error.code));
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = result.data.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <div className="modal-scrim daily-report-detail__scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        className="modal-panel daily-report-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
      >
        <header className="daily-report-detail__header">
          <div>
            <h2 id={titleId}>{t('daily.detailTitle')}</h2>
            {currentDetail ? <p>{t('daily.detailSubtitle', { author: currentDetail.authorName, date: currentDetail.date })}</p> : null}
          </div>
          <button ref={closeButtonRef} type="button" className="button button--secondary" onClick={onClose}>{t('daily.closeDetail')}</button>
        </header>

        {loading ? <p role="status">{t('daily.detailLoading')}</p> : null}
        {error ? <p className="form-error" role="alert">{t(error)}</p> : null}

        {currentDetail ? (
          <>
            <dl className="daily-report-detail__meta">
              <div><dt>{t('daily.date')}</dt><dd>{currentDetail.date}</dd></div>
              <div><dt>{t('daily.author')}</dt><dd>{currentDetail.authorName}</dd></div>
              <div><dt>{t('daily.hours')}</dt><dd>{t('common.hours', { count: currentDetail.hours })}</dd></div>
              <div><dt>{t('table.status')}</dt><dd><StatusBadge status={currentDetail.status} /></dd></div>
            </dl>

            <section aria-labelledby={`${titleId}-entries`}>
              <h3 id={`${titleId}-entries`}>{t('daily.detailEntries')}</h3>
              <div className="daily-report-detail__entries">
                {currentDetail.blocks.map((block, index) => (
                  <article className="daily-report-detail__entry" key={block.id}>
                    <h4>{t('daily.entryNumber', { number: index + 1 })}</h4>
                    <p><strong>{t('daily.objective')}：</strong>{block.dailyObjective}</p>
                    <p><strong>{t('daily.linkedQuarterlyKr')}：</strong>{block.keyResults[0]?.title ?? block.keyResultId}</p>
                    {block.workDescription ? <p><strong>{t('daily.workDescription')}：</strong>{block.workDescription}</p> : null}
                    <p><strong>{t('daily.result')}：</strong>{block.result}</p>
                    {block.evidenceItems?.length ? (
                      <ul className="daily-report-detail__attachments" aria-label={t('daily.visibleEvidence')}>
                        {block.evidenceItems.map((item) => (
                          <li key={item.id}>
                            <span>{item.label}</span>
                            {item.kind === 'file' && item.attachmentId ? (
                              <button type="button" className="text-button" onClick={() => void downloadAttachment(item.attachmentId!)}>
                                {t('daily.downloadNamed', { name: item.label })}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section aria-labelledby={`${titleId}-comments`}>
              <h3 id={`${titleId}-comments`}>{t('daily.comments')}</h3>
              {currentDetail.comments.length ? (
                <ol className="daily-report-detail__comments">
                  {currentDetail.comments.map((comment) => (
                    <li key={comment.id}>
                      <p><strong>{comment.authorName}</strong> · <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></p>
                      <p>{comment.body}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="data-table__empty">{t('daily.noComments')}</p>}

              {currentDetail.canComment ? (
                <form onSubmit={(event) => void submitComment(event)}>
                  <label className="modal-field">
                    <span>{t('daily.commentBody')}</span>
                    <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} rows={3} />
                  </label>
                  <button type="submit" className="button button--secondary" disabled={commenting || commentBody.trim() === ''}>
                    {commenting ? t('daily.commenting') : t('daily.comment')}
                  </button>
                </form>
              ) : null}
            </section>

            {actionError ? <p className="form-error" role="alert">{t(actionError)}</p> : null}
            {currentDetail.canConfirm && currentDetail.status !== 'confirmed' ? (
              <div className="modal-actions">
                <button type="button" className="button button--primary" disabled={confirming} onClick={() => void confirmReport()}>
                  {confirming ? t('daily.confirming') : t('daily.confirm')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
