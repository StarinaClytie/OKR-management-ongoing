import { useState, type FormEvent } from 'react';
import { validateProgressPlan, type ProgressPlanKr, type ProgressPlanPoint } from '../domain/progressPlan';
import { useLocale } from '../i18n/LocaleProvider';

export function ProgressPlanEditor({ kr, initialPoints, onSave }: {
  kr: ProgressPlanKr & { id: string };
  initialPoints: ProgressPlanPoint[];
  onSave: (id: string, points: ProgressPlanPoint[]) => Promise<{ ok: boolean }>;
}) {
  const { t } = useLocale();
  const [points, setPoints] = useState(initialPoints);
  const [errors, setErrors] = useState<string[]>([]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateProgressPlan(points, kr);
    if (validation.length) { setErrors(validation.map((item) => item.code)); return; }
    await onSave(kr.id, points);
  }
  return <form onSubmit={submit} className="form-card">
    <h2>{t('plan.title')}</h2>
    {points.map((point, index) => <div key={index} className="form-section">
      <label>{t('plan.date', { number: index + 1 })}<input aria-label={t('plan.date', { number: index + 1 })} type="date" value={point.date} onChange={(event) => setPoints((current) => current.map((item, i) => i === index ? { ...item, date: event.target.value } : item))} /></label>
      <label>{t('plan.progress', { number: index + 1 })}<input aria-label={t('plan.progress', { number: index + 1 })} type="number" value={point.value || ''} onChange={(event) => setPoints((current) => current.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item))} /></label>
    </div>)}
    {errors.length > 0 && <p role="alert">{t('plan.invalid')}</p>}
    <button type="button" onClick={() => setPoints((current) => [...current, { date: '', value: 0 }])}>{t('plan.add')}</button>
    <button type="submit">{t('plan.save')}</button>
  </form>;
}
