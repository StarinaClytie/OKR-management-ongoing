import { useId, useState } from 'react';
import { getKrGuidance, type DailyKrType } from '../../domain/dailyEntry';

const fullRuleByType: Record<DailyKrType, string> = {
  quantity: '先确认目标值和当前实际值，再由员工自行计算并填写完成度；系统不会代填或覆盖。',
  ratio: '先统一起始值、目标值和当前值的口径，再由员工自行换算并填写完成度。',
  milestone: '里程碑完成度仍由员工结合当前状态填写；状态选择不会自动改为 0% 或 100%。',
  subjective: '先写清双方可共同判断的验收标准，再由员工按实际结果自评并填写完成度。',
};

interface DailyKrHelpProps {
  type: DailyKrType;
  className?: string;
}

export function DailyKrHelp({ type, className = '' }: DailyKrHelpProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const guidance = getKrGuidance(type);

  return (
    <section className={`daily-entry-help ${className}`.trim()} aria-label="填写帮助">
      <p className="daily-entry-help__eyebrow">{guidance.label}填写参考</p>
      <p>公式参考：{guidance.formula}</p>
      <p>示例：<span>{guidance.example}</span></p>
      <p>注意：{guidance.caution}</p>
      <button
        type="button"
        className="text-button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? '收起完整规则' : '查看完整规则'}
      </button>
      {expanded && <p id={contentId} className="daily-entry-help__full-rule">{fullRuleByType[type]}</p>}
    </section>
  );
}
