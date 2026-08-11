import { useState } from 'react';

interface DailyObjectiveFieldProps {
  objective: string;
  progress: number;
  progressEntered: boolean;
  progressError: string | null;
  averageReference: number | null;
  onObjectiveChange: (value: string) => void;
  onProgressChange: (value: number) => void;
}

export function DailyObjectiveField({
  objective,
  progress,
  progressEntered,
  progressError,
  averageReference,
  onObjectiveChange,
  onProgressChange,
}: DailyObjectiveFieldProps) {
  const [examplesVisible, setExamplesVisible] = useState(false);

  return (
    <section className="daily-objective-field" aria-labelledby="daily-objective-heading">
      <div className="daily-field-heading">
        <h2 id="daily-objective-heading">今日目标</h2>
        <p>建议使用动词＋结果描述今天最重要的目标</p>
      </div>
      <label htmlFor="daily-objective">当日 O</label>
      <textarea
        id="daily-objective"
        value={objective}
        onChange={(event) => onObjectiveChange(event.target.value)}
        placeholder="例如：完成数据收集，为评审提供依据"
        rows={3}
      />
      <button type="button" className="text-button" onClick={() => setExamplesVisible((visible) => !visible)}>查看更多 O 写法</button>
      {examplesVisible && (
        <section className="daily-objective-field__examples" aria-label="O 写法示例">
          <p><strong>副词＋动词＋名词</strong></p>
          <ul>
            <li>高质量完成访谈数据整理</li>
            <li>准时交付实验复盘材料</li>
            <li>清晰确认评审所需依据</li>
          </ul>
        </section>
      )}
      <div className="daily-objective-field__progress">
        <div>
          <label htmlFor="daily-objective-progress">当日 O 完成度</label>
          <input
            id="daily-objective-progress"
            type="number"
            min="0"
            max="100"
            inputMode="decimal"
            value={progressEntered ? progress : ''}
            onChange={(event) => onProgressChange(Number(event.target.value))}
            aria-describedby={progressError ? 'daily-objective-progress-error' : undefined}
          />
          {progressError && <p id="daily-objective-progress-error" className="form-error">{progressError}</p>}
        </div>
        <p className="daily-reference">KR 平均完成度参考：{averageReference === null ? '—' : `${averageReference}%`}</p>
      </div>
    </section>
  );
}
