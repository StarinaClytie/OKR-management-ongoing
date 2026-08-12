import { useAuth } from '../auth/AuthContext';
import { mockRepository } from '../mocks/repository';
import { DashboardGrid } from './DashboardGrid';
import { getDashboardConfig } from './dashboardRegistry';

export function DashboardPage() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return (
      <section className="status-page" role="status">
        <h1>无法加载仪表盘</h1>
        <p>当前身份不可用，请重新选择角色。</p>
      </section>
    );
  }

  const config = getDashboardConfig(currentUser.role);
  const data = mockRepository.getDashboardData(currentUser.id);

  return (
    <section className={`dashboard-page dashboard-page--${currentUser.role}`} aria-labelledby="dashboard-title">
      <header className="dashboard-page__header">
        <div>
          <p className="dashboard-page__eyebrow">{currentUser.name} · {currentUser.department}</p>
          <h1 id="dashboard-title">{config.title}</h1>
          <p>{config.description}</p>
        </div>
      </header>
      <DashboardGrid data={data} widgetIds={config.widgetIds} />
    </section>
  );
}
