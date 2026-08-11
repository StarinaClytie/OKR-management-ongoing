import type { ReactNode } from 'react';
import type { DailyKeyResultDraft, DailyKrType } from '../../domain/dailyEntry';
import type { KeyResult } from '../../domain/types';

type ErrorField = 'title' | 'hours' | 'progress' | 'targetValue' | 'actualValue' | 'baselineValue' | 'dueDate' | 'milestoneStatus' | 'acceptanceCriteria' | 'workNote';
interface Props {
  index: number; keyResult: DailyKeyResultDraft; errors: Partial<Record<ErrorField, string>>;
  onChange: (patch: Partial<DailyKeyResultDraft>) => void; onProgressChange: (value: number | undefined) => void;
  onActivate: (type: DailyKrType) => void; onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
  canMoveUp: boolean; canMoveDown: boolean; canRemove: boolean; help?: ReactNode; linkedObjectiveId?: string;
  availableKeyResults: readonly KeyResult[]; onLinkedKeyResultChange: (value: string | undefined) => void;
}
const labels: Record<DailyKrType, string> = { quantity: '数量型', ratio: '比率型', milestone: '里程碑型', subjective: '主观型' };
const numberValue = (value: string) => value === '' ? undefined : Number(value);
const typePatch = (type: DailyKrType): Partial<DailyKeyResultDraft> => ({ type, targetValue: undefined, actualValue: undefined, baselineValue: undefined, dueDate: type === 'milestone' ? '' : undefined, milestoneStatus: undefined, acceptanceCriteria: type === 'subjective' ? '' : undefined });

export function DailyKeyResultEditor(props: Props) {
  const { index, keyResult, errors, onChange, onProgressChange, onActivate } = props;
  const number = index + 1; const prefix = `KR${number}`;
  const errorId = (field: ErrorField) => `daily-kr-${keyResult.id}-${field}-error`;
  const inputProps = (field: ErrorField) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? errorId(field) : undefined });
  const error = (field: ErrorField) => errors[field] ? <span id={errorId(field)} className="form-error" role="alert">{errors[field]}</span> : null;
  const numeric = (field: 'targetValue' | 'actualValue' | 'baselineValue', label: string) => <label htmlFor={`daily-kr-${keyResult.id}-${field}`}>
    {prefix} {label}<input id={`daily-kr-${keyResult.id}-${field}`} aria-label={`${prefix} ${label}`} type="number" inputMode="decimal" value={keyResult[field] ?? ''} {...inputProps(field)} onChange={(event) => onChange({ [field]: numberValue(event.target.value) })} />{error(field)}
  </label>;
  return <fieldset className="daily-kr-editor" aria-label={`当日 KR ${number}`} onFocus={() => onActivate(keyResult.type)}>
    <legend>KR{number}</legend>
    <div className="daily-kr-toolbar" aria-label={`${prefix} 排序与删除`}><button type="button" className="text-button" disabled={!props.canMoveUp} onClick={props.onMoveUp}>上移 {prefix}</button><button type="button" className="text-button" disabled={!props.canMoveDown} onClick={props.onMoveDown}>下移 {prefix}</button><button type="button" className="text-button text-button--danger" disabled={!props.canRemove} onClick={props.onRemove}>删除 {prefix}</button></div>
    <div className="daily-form-grid">
      <label htmlFor={`daily-kr-${keyResult.id}-title`}>{prefix}<input id={`daily-kr-${keyResult.id}-title`} aria-label={prefix} value={keyResult.title} {...inputProps('title')} onChange={(event) => onChange({ title: event.target.value })} />{error('title')}</label>
      <label htmlFor={`daily-kr-${keyResult.id}-type`}>{prefix} 度量类型<select id={`daily-kr-${keyResult.id}-type`} value={keyResult.type} onChange={(event) => { const type = event.target.value as DailyKrType; onChange(typePatch(type)); onActivate(type); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label htmlFor={`daily-kr-${keyResult.id}-hours`}>{prefix} 本日工时<input id={`daily-kr-${keyResult.id}-hours`} aria-label={`${prefix} 本日工时`} type="number" min="0" step="0.5" value={keyResult.hours ?? ''} {...inputProps('hours')} onChange={(event) => onChange({ hours: numberValue(event.target.value) })} />{error('hours')}</label>
      <label htmlFor={`daily-kr-${keyResult.id}-progress`}>{prefix} 完成度<input id={`daily-kr-${keyResult.id}-progress`} aria-label={`${prefix} 完成度`} type="number" min="0" max="100" value={keyResult.progress ?? ''} {...inputProps('progress')} onChange={(event) => onProgressChange(numberValue(event.target.value))} />{error('progress')}</label>
    </div>
    {keyResult.type === 'quantity' && <div className="daily-form-grid daily-form-grid--type-fields">{numeric('targetValue', '目标值')}{numeric('actualValue', '当前实际值')}</div>}
    {keyResult.type === 'ratio' && <div className="daily-form-grid daily-form-grid--type-fields">{numeric('baselineValue', '起始值')}{numeric('targetValue', '目标值')}{numeric('actualValue', '当前值')}</div>}
    {keyResult.type === 'milestone' && <div className="daily-form-grid daily-form-grid--type-fields"><label htmlFor={`daily-kr-${keyResult.id}-due-date`}>{prefix} 截止日期<input id={`daily-kr-${keyResult.id}-due-date`} aria-label={`${prefix} 截止日期`} type="date" value={keyResult.dueDate ?? ''} {...inputProps('dueDate')} onChange={(event) => onChange({ dueDate: event.target.value })} />{error('dueDate')}</label><label htmlFor={`daily-kr-${keyResult.id}-status`}>{prefix} 当前状态<select id={`daily-kr-${keyResult.id}-status`} aria-label={`${prefix} 当前状态`} value={keyResult.milestoneStatus ?? ''} {...inputProps('milestoneStatus')} onChange={(event) => onChange({ milestoneStatus: event.target.value as DailyKeyResultDraft['milestoneStatus'] })}><option value="">请选择</option><option value="not_started">未开始</option><option value="in_progress">进行中</option><option value="completed">已完成</option></select>{error('milestoneStatus')}</label></div>}
    {keyResult.type === 'subjective' && <label htmlFor={`daily-kr-${keyResult.id}-criteria`} className="daily-wide-field">{prefix} 验收标准<textarea required id={`daily-kr-${keyResult.id}-criteria`} aria-label={`${prefix} 验收标准`} value={keyResult.acceptanceCriteria ?? ''} {...inputProps('acceptanceCriteria')} onChange={(event) => onChange({ acceptanceCriteria: event.target.value })} />{error('acceptanceCriteria')}</label>}
    <label htmlFor={`daily-kr-${keyResult.id}-note`} className="daily-wide-field">{prefix} 工作说明<textarea id={`daily-kr-${keyResult.id}-note`} aria-label={`${prefix} 工作说明`} value={keyResult.workNote} {...inputProps('workNote')} onChange={(event) => onChange({ workNote: event.target.value })} />{error('workNote')}</label>
    <label htmlFor={`daily-kr-${keyResult.id}-linked-key-result`} className="daily-wide-field">{prefix} 关联已有 KR（可选）<select id={`daily-kr-${keyResult.id}-linked-key-result`} value={keyResult.linkedKeyResultId ?? ''} disabled={!props.linkedObjectiveId} onChange={(event) => props.onLinkedKeyResultChange(event.target.value || undefined)}><option value="">不关联</option>{props.availableKeyResults.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>{props.help}
  </fieldset>;
}
