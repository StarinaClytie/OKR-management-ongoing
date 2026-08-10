import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData } from './visualizationData';

export interface RiskMatrixWidgetProps {
  data: DashboardData;
}

const levels = [3, 2, 1] as const;

export function RiskMatrixWidget({ data }: RiskMatrixWidgetProps) {
  const { risks } = prepareVisualizationData(data);

  if (risks.length === 0) {
    return <p className="visualization-empty">当前权限范围内没有可展示的风险。</p>;
  }

  return (
    <div className="risk-matrix-wrap">
      <p className="visualization-description">纵轴为发生概率，横轴为业务影响；每项同时提供文字级别。</p>
      <div className="risk-matrix" aria-label="发生概率与业务影响风险矩阵">
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
                    <a className="risk-marker" href={`/projects#${risk.id}`} key={risk.id}>
                      <span className="risk-marker__shape" aria-hidden="true">◆</span>
                      <strong>{risk.title}</strong>
                      <small>{risk.probabilityLabel} · {risk.impactLabel}</small>
                    </a>
                  ))}
                </section>
              );
            }),
          )}
        </div>
        <span className="risk-matrix__axis risk-matrix__axis--x">业务影响 →</span>
      </div>
    </div>
  );
}
