import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { DashboardPage } from '../dashboard/DashboardPage';
import { AppShell } from '../layout/AppShell';
import { navigationItems, type NavigationItem } from '../navigation/navigation';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ObjectiveDetailPage } from '../pages/ObjectiveDetailPage';
import { OkrManagementPage } from '../pages/OkrManagementPage';
import { HrWorkHoursPage } from '../pages/hr/HrWorkHoursPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ResourceDetailPage } from '../pages/ResourceDetailPage';
import { ResourcesPage } from '../pages/ResourcesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TeamPage } from '../pages/TeamPage';
import { UsersPage } from '../pages/UsersPage';

const pageByPath = {
  '/okrs': OkrManagementPage,
  '/projects': ProjectsPage,
  '/resources': ResourcesPage,
  '/reports': ReportsPage,
  '/team': TeamPage,
  '/hr-hours': HrWorkHoursPage,
  '/users': UsersPage,
  '/settings': SettingsPage,
} as const;

function ProtectedNavigationRoute({ item }: { item: NavigationItem }) {
  const { currentUser } = useAuth();
  const Page = item.path === '/dashboard' ? DashboardPage : pageByPath[item.path as keyof typeof pageByPath];
  if (item.roles && (!currentUser || !item.roles.includes(currentUser.role))) {
    return <Navigate to="/access-denied" replace />;
  }
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
      {/* Post-recovery landing: AppRoutes mounts only once the auth provider
          reaches `ready`, so this Navigate fires only after the new password is
          set — never while the reset form (rendered by the provider, outside the
          router) is showing, and never before initialize() consumes the recovery
          hash. */}
      <Route path="/auth/reset-password" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {navigationItems.map((item) => (
          <Route key={item.path} path={item.path} element={<ProtectedNavigationRoute item={item} />} />
        ))}
        <Route path="/daily-reports" element={<Navigate to="/reports" replace />} />
        <Route path="/weekly-reports" element={<Navigate to="/reports" replace />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/okrs/:objectiveId" element={<ObjectiveDetailPage />} />
        <Route path="/resources/:resourceId" element={<ResourceDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
