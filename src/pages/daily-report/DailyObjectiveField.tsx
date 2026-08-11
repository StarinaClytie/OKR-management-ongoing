import { useState } from 'react';

interface DailyObjectiveFieldProps {
  objective: string;
  progress?: number;
  progressError: string | null;
  averageReference: number | null;
  onObjectiveChange: (value: string) => void;
  onProgressChange: (value: number | undefined) => void;
}

export function DailyObjectiveField({
  objective,
  progress,
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
      <button
        type="button"
        className="text-button"
        aria-expanded={examplesVisible}
        aria-controls="daily-objective-examples"
        onClick={() => setExamplesVisible((visible) => !visible)}
      >
        {examplesVisible ? '收起 O 写法' : '查看更多 O 写法'}
      </button>
      {examplesVisible && (
        <section id="daily-objective-examples" className="daily-objective-field__examples" aria-label="O 写法示例">
          <p><strong>副词＋动词＋名词</strong>：高质量完成访谈数据整理</p>
          <p><strong>动词＋对象＋结果</strong>：验证引导方案并形成评审结论</p>
          <p><strong>完成＋交付物＋用途</strong>：完成实验复盘，为下轮决策提供依据</p>
          <p><strong>解决＋问题＋影响</strong>：解决口径分歧，避免评审返工</p>
          <ul>
            <li>一个当日 O 聚焦今天最重要的结果。</li>
            <li>O 描述目标方向，不替代员工填写完成度。</li>
            <li>避免把多个不相关目标塞进同一句。</li>
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
            value={progress ?? ''}
            required
            aria-invalid={progressError ? 'true' : undefined}
            onChange={(event) => onProgressChange(event.target.value === '' ? undefined : Number(event.target.value))}
            aria-describedby={progressError ? 'daily-objective-progress-error' : undefined}
          />
          {progressError && <p id="daily-objective-progress-error" className="form-error">{progressError}</p>}
        </div>
        <p className="daily-reference">KR 平均完成度参考：{averageReference === null ? '—' : `${averageReference}%`}</p>
      </div>
    </section>
  );
}
