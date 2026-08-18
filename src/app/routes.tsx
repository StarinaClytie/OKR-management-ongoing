import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { DashboardPage } from '../dashboard/DashboardPage';
import { AppShell } from '../layout/AppShell';
import { navigationItems, type NavigationItem } from '../navigation/navigation';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { DailyReportsPage } from '../pages/DailyReportsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OkrManagementPage } from '../pages/OkrManagementPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ProjectDetailPage } from '../pages/ProjectDetailPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ResourceDetailPage } from '../pages/ResourceDetailPage';
import { ResourcesPage } from '../pages/ResourcesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TeamPage } from '../pages/TeamPage';
import { UsersPage } from '../pages/UsersPage';
import { WeeklyReportsPage } from '../pages/WeeklyReportsPage';

const pageByPath = {
  '/okrs': OkrManagementPage,
  '/projects': ProjectsPage,
  '/resources': ResourcesPage,
  '/daily-reports': DailyReportsPage,
  '/weekly-reports': WeeklyReportsPage,
  '/team': TeamPage,
  '/users': UsersPage,
  '/analytics': AnalyticsPage,
  '/settings': SettingsPage,
} as const;

function ProtectedNavigationRoute({ item }: { item: NavigationItem }) {
  const Page = item.path === '/dashboard' ? DashboardPage : pageByPath[item.path as keyof typeof pageByPath];
  return (
    <ProtectedRoute action={item.action} resource={item.resource}>
      <Page />
    </ProtectedRoute>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/invite" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {navigationItems.map((item) => (
          <Route key={item.path} path={item.path} element={<ProtectedNavigationRoute item={item} />} />
        ))}
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/resources/:resourceId" element={<ResourceDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
