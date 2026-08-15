import { useState } from 'react';

interface DailyObjectiveFieldProps {
  objective: string;
  objectiveError: string | null;
  progress?: number;
  progressError: string | null;
  averageReference: number | null;
  onObjectiveChange: (value: string) => void;
  onProgressChange: (value: number | undefined) => void;
}

export function DailyObjectiveField({
  objective,
  objectiveError,
  progress,
  progressError,
  averageReference,
  onObjectiveChange,
  onProgressChange,
}: DailyObjectiveFieldProps) {
  const [examplesVisible, setExamplesVisible] = useState(false);

  return (
    <section className="daily-objective-field form-card form-section" aria-labelledby="daily-objective-heading">
      <div className="daily-field-heading">
        <h2 id="daily-objective-heading">今日目标</h2>
        <p>建议使用动词＋结果描述今天最重要的目标</p>
      </div>
      <label htmlFor="daily-objective">当日 O</label>
      <textarea
        id="daily-objective"
        autoFocus
        value={objective}
        aria-invalid={objectiveError ? 'true' : undefined}
        aria-describedby={objectiveError ? 'daily-objective-error' : undefined}
        onChange={(event) => onObjectiveChange(event.target.value)}
        placeholder="例如：完成数据收集，为评审提供依据"
        rows={3}
      />
      {objectiveError && <p id="daily-objective-error" className="form-error" role="alert">{objectiveError}</p>}
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
          <dl>
            <div><dt>动词＋名词</dt><dd>优化销售流程</dd></div>
            <div><dt>动词＋形容词＋名词</dt><dd>打造旗舰产品</dd></div>
            <div><dt>副词＋动词＋名词</dt><dd>大幅提升品牌影响力</dd></div>
            <div><dt>What＋Why</dt><dd>完成原型验证，为产品评审提供依据</dd></div>
          </dl>
          <ul>
            <li>通常使用定性描述，并以明确动词开头。</li>
            <li>责任范围可控，且在当前周期内可完成。</li>
            <li>尽量不超过 20 个字。</li>
            <li>避免“协助、参与、支持”等责任不明确的动词。</li>
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
          {progressError && <p id="daily-objective-progress-error" className="form-error" role="alert">{progressError}</p>}
        </div>
        <p className="daily-reference">KR 平均完成度参考：{averageReference === null ? '—' : `${averageReference}%`}</p>
      </div>
    </section>
  );
}
