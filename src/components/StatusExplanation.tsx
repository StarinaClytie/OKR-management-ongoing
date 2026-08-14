import { StatusBadge } from './StatusBadge';
import type { StatusReason } from '../domain/progressStatus';
import type { ProgressStatus } from '../domain/types';

function reasonText(reason: StatusReason): string {
  switch (reason.code) {
    case 'behind_plan': return `实际 ${reason.actual}%，计划 ${reason.planned}%，落后 ${Math.abs(reason.gap)} 个百分点`;
    case 'overdue_milestone': return `存在逾期未完成里程碑（计划日期 ${reason.dueDate}）`;
    case 'overdue_due_date': return `目标已超过截止日期 ${reason.dueDate}，但尚未完成`;
    case 'high_risk': return '存在未解决的高风险（风险分 6）';
    case 'critical_risk': return '存在未解决的严重风险（风险分 9）';
    case 'complete': return `实际完成度 ${reason.actual}%，目标已完成`;
  }
}

export function StatusExplanation({ result }: { result: { status: ProgressStatus; reasons: StatusReason[] } }) {
  return (
    <section className="status-explanation" aria-label="状态计算说明">
      <StatusBadge status={result.status} />
      <p>执行状态会并行评估进度差距、逾期里程碑、截止日期和未解决风险事件，并采用最严重的结果。</p>
      {result.reasons.length > 0
        ? <ul>{result.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reasonText(reason)}</li>)}</ul>
        : <p>实际进度与计划差距不超过 10 个百分点，且没有逾期里程碑或未解决高风险。</p>}
    </section>
  );
}
