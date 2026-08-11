import type { DailyKeyResultDraft, DailyKrType } from '../../domain/dailyEntry';

interface DailyKeyResultEditorProps {
  index: number;
  keyResult: DailyKeyResultDraft;
  progressError: string | null;
  onChange: (patch: Partial<DailyKeyResultDraft>) => void;
  onProgressChange: (value: number) => void;
  onActivate: (type: DailyKrType) => void;
}

const typeLabels: Record<DailyKrType, string> = {
  quantity: '数量型',
  ratio: '比率型',
  milestone: '里程碑型',
  subjective: '主观型',
};

function numberValue(value: string) {
  return value === '' ? undefined : Number(value);
}

export function DailyKeyResultEditor({ index, keyResult, progressError, onChange, onProgressChange, onActivate }: DailyKeyResultEditorProps) {
  const number = index + 1;
  const prefix = `KR${number}`;
  const setType = (type: DailyKrType) => {
    onChange({ type });
    onActivate(type);
  };

  return (
    <fieldset className="daily-kr-editor" aria-label={`当日 KR ${number}`} onFocus={() => onActivate(keyResult.type)}>
      <legend>KR{number}</legend>
      <div className="daily-form-grid">
        <label htmlFor={`daily-kr-${keyResult.id}-title`}>
          {prefix}
          <input
            id={`daily-kr-${keyResult.id}-title`}
            value={keyResult.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="描述今天需要完成的关键结果"
          />
        </label>
        <label htmlFor={`daily-kr-${keyResult.id}-type`}>
          {prefix} 度量类型
          <select id={`daily-kr-${keyResult.id}-type`} value={keyResult.type} onChange={(event) => setType(event.target.value as DailyKrType)}>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label htmlFor={`daily-kr-${keyResult.id}-hours`}>
          {prefix} 本日工时
          <input
            id={`daily-kr-${keyResult.id}-hours`}
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={keyResult.hours || ''}
            onChange={(event) => onChange({ hours: Number(event.target.value) || 0 })}
          />
        </label>
        <label htmlFor={`daily-kr-${keyResult.id}-progress`}>
          {prefix} 完成度
          <input
            id={`daily-kr-${keyResult.id}-progress`}
            type="number"
            min="0"
            max="100"
            inputMode="decimal"
            value={keyResult.progress || ''}
            onChange={(event) => onProgressChange(Number(event.target.value))}
            aria-describedby={progressError ? `daily-kr-${keyResult.id}-progress-error` : undefined}
          />
          {progressError && <span id={`daily-kr-${keyResult.id}-progress-error`} className="form-error">{progressError}</span>}
        </label>
      </div>
      {keyResult.type === 'quantity' && (
        <div className="daily-form-grid daily-form-grid--type-fields">
          <label htmlFor={`daily-kr-${keyResult.id}-target`}>
            {prefix} 目标值
            <input id={`daily-kr-${keyResult.id}-target`} type="number" inputMode="decimal" value={keyResult.targetValue ?? ''} onChange={(event) => onChange({ targetValue: numberValue(event.target.value) })} />
          </label>
          <label htmlFor={`daily-kr-${keyResult.id}-actual`}>
            {prefix} 当前实际值
            <input id={`daily-kr-${keyResult.id}-actual`} type="number" inputMode="decimal" value={keyResult.actualValue ?? ''} onChange={(event) => onChange({ actualValue: numberValue(event.target.value) })} />
          </label>
        </div>
      )}
      {keyResult.type === 'ratio' && (
        <div className="daily-form-grid daily-form-grid--type-fields">
          <label htmlFor={`daily-kr-${keyResult.id}-baseline`}>
            {prefix} 起始值
            <input id={`daily-kr-${keyResult.id}-baseline`} type="number" inputMode="decimal" value={keyResult.baselineValue ?? ''} onChange={(event) => onChange({ baselineValue: numberValue(event.target.value) })} />
          </label>
          <label htmlFor={`daily-kr-${keyResult.id}-target`}>
            {prefix} 目标值
            <input id={`daily-kr-${keyResult.id}-target`} type="number" inputMode="decimal" value={keyResult.targetValue ?? ''} onChange={(event) => onChange({ targetValue: numberValue(event.target.value) })} />
          </label>
          <label htmlFor={`daily-kr-${keyResult.id}-actual`}>
            {prefix} 当前值
            <input id={`daily-kr-${keyResult.id}-actual`} type="number" inputMode="decimal" value={keyResult.actualValue ?? ''} onChange={(event) => onChange({ actualValue: numberValue(event.target.value) })} />
          </label>
        </div>
      )}
      {keyResult.type === 'milestone' && (
        <div className="daily-form-grid daily-form-grid--type-fields">
          <label htmlFor={`daily-kr-${keyResult.id}-due-date`}>
            {prefix} 截止日期
            <input id={`daily-kr-${keyResult.id}-due-date`} type="date" value={keyResult.dueDate ?? ''} onChange={(event) => onChange({ dueDate: event.target.value })} />
          </label>
          <label htmlFor={`daily-kr-${keyResult.id}-status`}>
            {prefix} 当前状态
            <select id={`daily-kr-${keyResult.id}-status`} value={keyResult.milestoneStatus ?? 'not_started'} onChange={(event) => onChange({ milestoneStatus: event.target.value as DailyKeyResultDraft['milestoneStatus'] })}>
              <option value="not_started">未开始</option>
              <option value="in_progress">进行中</option>
              <option value="completed">已完成</option>
            </select>
          </label>
        </div>
      )}
      {keyResult.type === 'subjective' && (
        <label htmlFor={`daily-kr-${keyResult.id}-criteria`} className="daily-wide-field">
          {prefix} 验收标准
          <textarea id={`daily-kr-${keyResult.id}-criteria`} rows={2} value={keyResult.acceptanceCriteria ?? ''} onChange={(event) => onChange({ acceptanceCriteria: event.target.value })} />
        </label>
      )}
      <label htmlFor={`daily-kr-${keyResult.id}-note`} className="daily-wide-field">
        {prefix} 工作说明
        <textarea id={`daily-kr-${keyResult.id}-note`} rows={2} value={keyResult.workNote} onChange={(event) => onChange({ workNote: event.target.value })} />
      </label>
    </fieldset>
  );
}
