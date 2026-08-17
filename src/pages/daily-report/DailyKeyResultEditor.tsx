import type { ReactNode } from 'react';
import type { DailyKeyResultDraft, DailyKrType } from '../../domain/dailyEntry';
import type { KeyResult } from '../../domain/types';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

type ErrorField = 'title' | 'hours' | 'progress' | 'targetValue' | 'actualValue' | 'baselineValue' | 'dueDate' | 'milestoneStatus' | 'acceptanceCriteria' | 'workNote';
interface Props {
  index: number; keyResult: DailyKeyResultDraft; errors: Partial<Record<ErrorField, string>>;
  onChange: (patch: Partial<DailyKeyResultDraft>) => void; onProgressChange: (value: number | undefined) => void;
  onActivate: (type: DailyKrType) => void; onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
  canMoveUp: boolean; canMoveDown: boolean; canRemove: boolean; help?: ReactNode; linkedObjectiveId?: string;
  availableKeyResults: readonly KeyResult[]; onLinkedKeyResultChange: (value: string | undefined) => void;
}
const labels: Record<DailyKrType, MessageKey> = { quantity: 'daily.krType.quantity', ratio: 'daily.krType.ratio', milestone: 'daily.krType.milestone', subjective: 'daily.krType.subjective' };
const numberValue = (value: string) => value === '' ? undefined : Number(value);
const typePatch = (type: DailyKrType): Partial<DailyKeyResultDraft> => ({ type, targetValue: undefined, actualValue: undefined, baselineValue: undefined, dueDate: type === 'milestone' ? '' : undefined, milestoneStatus: undefined, acceptanceCriteria: type === 'subjective' ? '' : undefined });

export function DailyKeyResultEditor(props: Props) {
  const { t } = useLocale();
  const { index, keyResult, errors, onChange, onProgressChange, onActivate } = props;
  const number = index + 1; const prefix = `KR${number}`;
  const errorId = (field: ErrorField) => `daily-kr-${keyResult.id}-${field}-error`;
  const inputProps = (field: ErrorField) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? errorId(field) : undefined });
  const error = (field: ErrorField) => errors[field] ? <span id={errorId(field)} className="form-error" role="alert">{errors[field]}</span> : null;
  const numeric = (field: 'targetValue' | 'actualValue' | 'baselineValue', label: string) => <label htmlFor={`daily-kr-${keyResult.id}-${field}`}>
    {prefix} {label}<input id={`daily-kr-${keyResult.id}-${field}`} aria-label={`${prefix} ${label}`} type="number" inputMode="decimal" value={keyResult[field] ?? ''} {...inputProps(field)} onChange={(event) => onChange({ [field]: numberValue(event.target.value) })} />{error(field)}
  </label>;
  return <fieldset className="daily-kr-editor" aria-label={t('daily.krLabel', { number })} onFocus={() => onActivate(keyResult.type)}>
    <legend>KR{number}</legend>
    <div className="daily-kr-toolbar" aria-label={t('daily.krTools', { prefix })}><button type="button" className="text-button" disabled={!props.canMoveUp} onClick={props.onMoveUp}>{t('daily.moveUp', { prefix })}</button><button type="button" className="text-button" disabled={!props.canMoveDown} onClick={props.onMoveDown}>{t('daily.moveDown', { prefix })}</button><button type="button" className="text-button text-button--danger" disabled={!props.canRemove} onClick={props.onRemove}>{t('daily.deleteKr', { prefix })}</button></div>
    <div className="daily-form-grid">
      <label htmlFor={`daily-kr-${keyResult.id}-title`}>{prefix}<input id={`daily-kr-${keyResult.id}-title`} aria-label={prefix} value={keyResult.title} {...inputProps('title')} onChange={(event) => onChange({ title: event.target.value })} />{error('title')}</label>
      <label htmlFor={`daily-kr-${keyResult.id}-type`}>{t('daily.metricType', { prefix })}<select id={`daily-kr-${keyResult.id}-type`} value={keyResult.type} onChange={(event) => { const type = event.target.value as DailyKrType; onChange(typePatch(type)); onActivate(type); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      <label htmlFor={`daily-kr-${keyResult.id}-hours`}>{t('daily.todayHours', { prefix })}<input id={`daily-kr-${keyResult.id}-hours`} aria-label={t('daily.todayHours', { prefix })} type="number" min="0" step="0.5" value={keyResult.hours ?? ''} {...inputProps('hours')} onChange={(event) => onChange({ hours: numberValue(event.target.value) })} />{error('hours')}</label>
      <label htmlFor={`daily-kr-${keyResult.id}-progress`}>{t('daily.completion', { prefix })}<input id={`daily-kr-${keyResult.id}-progress`} aria-label={t('daily.completion', { prefix })} type="number" min="0" max="100" value={keyResult.progress ?? ''} {...inputProps('progress')} onChange={(event) => onProgressChange(numberValue(event.target.value))} />{error('progress')}</label>
    </div>
    {keyResult.type === 'quantity' && <div className="daily-form-grid daily-form-grid--type-fields">{numeric('targetValue', t('daily.targetValue'))}{numeric('actualValue', t('daily.actualValue'))}</div>}
    {keyResult.type === 'ratio' && <div className="daily-form-grid daily-form-grid--type-fields">{numeric('baselineValue', t('daily.baselineValue'))}{numeric('targetValue', t('daily.targetValue'))}{numeric('actualValue', t('daily.currentValue'))}</div>}
    {keyResult.type === 'milestone' && <div className="daily-form-grid daily-form-grid--type-fields"><label htmlFor={`daily-kr-${keyResult.id}-due-date`}>{t('daily.dueDate', { prefix })}<input id={`daily-kr-${keyResult.id}-due-date`} aria-label={t('daily.dueDate', { prefix })} type="date" value={keyResult.dueDate ?? ''} {...inputProps('dueDate')} onChange={(event) => onChange({ dueDate: event.target.value })} />{error('dueDate')}</label><label htmlFor={`daily-kr-${keyResult.id}-status`}>{t('daily.currentStatus', { prefix })}<select id={`daily-kr-${keyResult.id}-status`} aria-label={t('daily.currentStatus', { prefix })} value={keyResult.milestoneStatus ?? ''} {...inputProps('milestoneStatus')} onChange={(event) => onChange({ milestoneStatus: event.target.value as DailyKeyResultDraft['milestoneStatus'] })}><option value="">{t('daily.select')}</option><option value="not_started">{t('daily.notStarted')}</option><option value="in_progress">{t('daily.inProgress')}</option><option value="completed">{t('status.complete')}</option></select>{error('milestoneStatus')}</label></div>}
    {keyResult.type === 'subjective' && <label htmlFor={`daily-kr-${keyResult.id}-criteria`} className="daily-wide-field">{t('daily.acceptanceCriteria', { prefix })}<textarea required id={`daily-kr-${keyResult.id}-criteria`} aria-label={t('daily.acceptanceCriteria', { prefix })} value={keyResult.acceptanceCriteria ?? ''} {...inputProps('acceptanceCriteria')} onChange={(event) => onChange({ acceptanceCriteria: event.target.value })} />{error('acceptanceCriteria')}</label>}
    <label htmlFor={`daily-kr-${keyResult.id}-note`} className="daily-wide-field">{t('daily.workNote', { prefix })}<textarea id={`daily-kr-${keyResult.id}-note`} aria-label={t('daily.workNote', { prefix })} value={keyResult.workNote} {...inputProps('workNote')} onChange={(event) => onChange({ workNote: event.target.value })} />{error('workNote')}</label>
    <label htmlFor={`daily-kr-${keyResult.id}-linked-key-result`} className="daily-wide-field">{t('daily.linkedKr', { prefix })}<select id={`daily-kr-${keyResult.id}-linked-key-result`} value={keyResult.linkedKeyResultId ?? ''} disabled={!props.linkedObjectiveId} onChange={(event) => props.onLinkedKeyResultChange(event.target.value || undefined)}><option value="">{t('daily.notLinked')}</option>{props.availableKeyResults.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>{props.help}
  </fieldset>;
}
