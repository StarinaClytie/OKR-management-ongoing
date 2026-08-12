import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { MetricCard } from '../../components/MetricCard';
import type { DashboardData } from '../../mocks/repository';
import { prepareVisualizationData } from './visualizationData';

export interface ProgressTrendWidgetProps {
  data: DashboardData;
}

export function ProgressTrendWidget({ data }: ProgressTrendWidgetProps) {
  const { trendPoints } = prepareVisualizationData(data);
  const latest = trendPoints.at(-1);

  if (trendPoints.length < 8) {
    return (
      <div className="trend-fallback">
        <p className="visualization-empty">数据不足，暂不绘制趋势线</p>
        <div className="dashboard-metrics">
          <MetricCard label="最新实际进度" value={`${latest?.actual ?? 0}%`} detail="授权范围内最近一周" />
          <MetricCard label="最新计划进度" value={`${latest?.planned ?? 0}%`} detail="授权范围内最近一周" />
        </div>
      </div>
    );
  }

  return (
    <div className="trend-chart">
      <div className="trend-chart__heading">
        <div>
          <strong>最近 12 周进度</strong>
          <span>{trendPoints[0].weekOf} 至 {latest?.weekOf}</span>
        </div>
        <span>单位：完成度 %</span>
      </div>
      <div className="trend-chart__legend" aria-label="进度趋势图例">
        <span><i className="trend-legend trend-legend--actual" />实际进度（实线）</span>
        <span><i className="trend-legend trend-legend--planned" />计划进度（虚线）</span>
      </div>
      <p className="trend-chart__count">{trendPoints.length} 个周度数据点</p>
      <div className="trend-chart__scroll" tabIndex={0} aria-label="进度趋势图，可横向滚动">
        <LineChart
          width={760}
          height={280}
          data={trendPoints}
          margin={{ top: 12, right: 20, bottom: 12, left: 0 }}
          role="img"
          aria-label="实际进度与计划进度周度折线图"
        >
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="weekOf" tick={{ fontSize: 11 }} interval={1} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
          <Line dataKey="actual" name="实际进度" type="monotone" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
          <Line dataKey="planned" name="计划进度" type="monotone" stroke="#64748b" strokeWidth={2} strokeDasharray="7 5" dot={false} />
        </LineChart>
      </div>
    </div>
  );
}
