import { useState } from 'react';
import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData } from './visualizationData';

export interface RiskMatrixWidgetProps {
  data: DashboardData;
}

const levels = [3, 2, 1] as const;
const levelLabels = { low: '低风险', medium: '中风险', high: '高风险', critical: '严重风险' } as const;

export function RiskMatrixWidget({ data }: RiskMatrixWidgetProps) {
  const { risks } = prepareVisualizationData(data);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = risks.find((risk) => risk.id === selectedId);

  if (risks.length === 0) {
    return <p className="visualization-empty">当前权限范围内没有可展示的风险。</p>;
  }

  return (
    <div className="risk-matrix-wrap">
      <p className="visualization-description">纵轴为发生概率，横轴为业务影响；每项同时提供文字级别。</p>
      <div className="risk-matrix" role="region" tabIndex={0} aria-label="风险矩阵，可横向滚动">
        <span className="risk-matrix__axis risk-matrix__axis--y">发生概率 ↑</span>
        <div className="risk-matrix__grid">
          {levels.flatMap((probability) =>
            ([1, 2, 3] as const).map((impact) => {
              const cellRisks = risks.filter((risk) => risk.probability === probability && risk.impact === impact);
              return (
                <section
                  key={`${probability}-${impact}`}
                  className={`risk-cell risk-cell--level-${probability + impact}`}
                  aria-label={`${probability === 3 ? '高' : probability === 2 ? '中' : '低'}概率，${impact === 3 ? '高' : impact === 2 ? '中' : '低'}影响`}
                >
                  {cellRisks.map((risk) => (
                    <button type="button" className="risk-marker" aria-label={`查看风险详情：${risk.title}`} onClick={() => setSelectedId(risk.id)} key={risk.id}>
                      <span className="risk-marker__shape" aria-hidden="true">◆</span>
                      <strong>{risk.title}</strong>
                      <small>{risk.probabilityLabel} · {risk.impactLabel}</small>
                    </button>
                  ))}
                </section>
              );
            }),
          )}
        </div>
        <span className="risk-matrix__axis risk-matrix__axis--x">业务影响 →</span>
      </div>
      {selected && <section className="risk-details" role="region" aria-label="风险详情">
        <h3>{selected.title}</h3>
        <p>概率 {selected.probability} × 影响 {selected.impact} = {selected.score}（{levelLabels[selected.level]}）</p>
        <dl>
          <dt>判断依据</dt><dd>{selected.reason}</dd>
          <dt>负责人</dt><dd>{selected.ownerName}</dd>
          <dt>缓解措施</dt><dd>{selected.mitigation}</dd>
          <dt>最近复核</dt><dd>{selected.lastReviewedAt}</dd>
        </dl>
      </section>}
    </div>
  );
}
