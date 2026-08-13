import { useState, type FormEvent } from 'react';
import { validateProgressPlan, type ProgressPlanKr, type ProgressPlanPoint } from '../domain/progressPlan';

export function ProgressPlanEditor({ kr, initialPoints, onSave }: {
  kr: ProgressPlanKr & { id: string };
  initialPoints: ProgressPlanPoint[];
  onSave: (id: string, points: ProgressPlanPoint[]) => Promise<{ ok: boolean }>;
}) {
  const [points, setPoints] = useState(initialPoints);
  const [errors, setErrors] = useState<string[]>([]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateProgressPlan(points, kr);
    if (validation.length) { setErrors(validation.map((item) => item.code)); return; }
    await onSave(kr.id, points);
  }
  return <form onSubmit={submit} className="form-card">
    <h2>设置计划进度</h2>
    {points.map((point, index) => <div key={index} className="form-section">
      <label>计划日期 {index + 1}<input aria-label={`计划日期 ${index + 1}`} type="date" value={point.date} onChange={(event) => setPoints((current) => current.map((item, i) => i === index ? { ...item, date: event.target.value } : item))} /></label>
      <label>计划完成度 {index + 1}<input aria-label={`计划完成度 ${index + 1}`} type="number" value={point.value || ''} onChange={(event) => setPoints((current) => current.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item))} /></label>
    </div>)}
    {errors.length > 0 && <p role="alert">计划点不符合目标周期或进度规则。</p>}
    <button type="button" onClick={() => setPoints((current) => [...current, { date: '', value: 0 }])}>添加计划点</button>
    <button type="submit">保存计划进度</button>
  </form>;
}
