import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { DashboardPage } from '../dashboard/DashboardPage';
import { AppShell } from '../layout/AppShell';
import { navigationItems, type NavigationItem } from '../navigation/navigation';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';
import { NotFoundPage } from '../pages/NotFoundPage';

function RoutePlaceholder({ title }: { title: string }) {
  return (
    <section className="route-placeholder" aria-labelledby="route-placeholder-title">
      <p className="route-placeholder__eyebrow">工作区</p>
      <h1 id="route-placeholder-title">{title}</h1>
      <p>页面框架将在后续迭代中补充。</p>
    </section>
  );
}

function ProtectedNavigationRoute({ item }: { item: NavigationItem }) {
  return (
    <ProtectedRoute action={item.action} resource={item.resource}>
      {item.path === '/dashboard' ? <DashboardPage /> : <RoutePlaceholder title={item.label} />}
    </ProtectedRoute>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {navigationItems.map((item) => (
          <Route key={item.path} path={item.path} element={<ProtectedNavigationRoute item={item} />} />
        ))}
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
