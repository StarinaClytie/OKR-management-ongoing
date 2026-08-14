import { useState } from 'react';
import type { DashboardData } from '../../mocks/repository';
import { getRiskCoordinate, impactDefinitions, probabilityDefinitions, type RiskLevel } from '../../domain/riskScore';
import { prepareVisualizationData } from './visualizationData';

export interface RiskMatrixWidgetProps {
  data: DashboardData;
}

const levels = [3, 2, 1] as const;
const levelLabels = { low: '低风险', medium: '中风险', high: '高风险', critical: '严重风险' } as const;

function executionStatusEffect(score: number): string {
  if (score === 9) return '未解决时，执行状态升级为已偏离。';
  if (score === 6) return '未解决时，执行状态升级为需关注。';
  return '不自动升级执行状态。';
}

function eventSeverity(level: RiskLevel): string {
  return `${levelLabels[level]}事件`;
}

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
      <details open>
        <summary>风险矩阵计算说明</summary>
        <p><strong>风险事件 ≠ 执行状态</strong>：矩阵用于评估单个风险事件的严重程度；执行状态还会并行评估进度与日期规则，并采用最严重结果。</p>
        <p>纵轴：发生概率（1={probabilityDefinitions[1]}；2={probabilityDefinitions[2]}；3={probabilityDefinitions[3]}）。</p>
        <p>横轴：业务影响（1={impactDefinitions[1]}；2={impactDefinitions[2]}；3={impactDefinitions[3]}）。</p>
        <p>风险分 = 概率 × 影响</p>
        <ul>
          <li>1–2：低风险事件，不自动升级执行状态。</li>
          <li>3–4：中风险事件，不自动升级执行状态。</li>
          <li>6：高风险事件，执行状态升级为需关注。</li>
          <li>9：严重风险事件，执行状态升级为已偏离。</li>
        </ul>
        <p>示例：概率 1 × 影响 3 = 3，为中风险事件，不自动升级执行状态。</p>
      </details>
      <div className="risk-matrix" role="region" tabIndex={0} aria-label="风险矩阵，可横向滚动">
        <span className="risk-matrix__axis risk-matrix__axis--y">发生概率 ↑</span>
        <div className="risk-matrix__grid">
          {levels.flatMap((probability) =>
            ([1, 2, 3] as const).map((impact) => {
              const coordinate = getRiskCoordinate(probability, impact);
              const cellRisks = risks.filter((risk) => risk.probability === probability && risk.impact === impact);
              return (
                <section
                  key={`${probability}-${impact}`}
                  className={`risk-cell risk-cell--level-${probability + impact}`}
                  aria-label={`${probability === 3 ? '高' : probability === 2 ? '中' : '低'}概率，${impact === 3 ? '高' : impact === 2 ? '中' : '低'}影响，风险分 ${coordinate.score}`}
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
        <p>概率 {selected.probability} × 影响 {selected.impact} = {selected.score}</p>
        <p>风险事件严重程度：{eventSeverity(selected.level)}</p>
        <p>执行状态影响：{executionStatusEffect(selected.score)}</p>
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
