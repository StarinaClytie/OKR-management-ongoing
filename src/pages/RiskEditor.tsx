import { useState, type FormEvent } from 'react';
import { impactDefinitions, probabilityDefinitions, scoreRisk, type RiskLevel } from '../domain/riskScore';

export interface RiskEditorInput {
  projectId: string;
  title: string;
  probability: 1 | 2 | 3;
  impact: 1 | 2 | 3;
  level: RiskLevel;
  reason: string;
  mitigation: string;
  lastReviewedAt: string;
}

export function RiskEditor({ projectId, onSave }: { projectId: string; onSave: (input: RiskEditorInput) => Promise<{ ok: boolean }> }) {
  const [title, setTitle] = useState('');
  const [probability, setProbability] = useState<1 | 2 | 3>(1);
  const [impact, setImpact] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [lastReviewedAt, setLastReviewedAt] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const { level } = scoreRisk(probability, impact);
    await onSave({ projectId, title, probability, impact, level, reason, mitigation, lastReviewedAt });
  }
  return <form onSubmit={submit} className="form-card">
    <h2>记录项目风险</h2>
    <label>风险标题<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>发生概率<select value={probability} onChange={(event) => setProbability(Number(event.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((value) => <option value={value} key={value}>{probabilityDefinitions[value]}</option>)}</select></label>
    <label>业务影响<select value={impact} onChange={(event) => setImpact(Number(event.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((value) => <option value={value} key={value}>{impactDefinitions[value]}</option>)}</select></label>
    <label>判断依据<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label>缓解措施<textarea required value={mitigation} onChange={(event) => setMitigation(event.target.value)} /></label>
    <label>复核日期<input required type="date" value={lastReviewedAt} onChange={(event) => setLastReviewedAt(event.target.value)} /></label>
    <p aria-live="polite">当前评分：{probability} × {impact} = {scoreRisk(probability, impact).score}</p>
    <button type="submit">保存风险</button>
  </form>;
}
