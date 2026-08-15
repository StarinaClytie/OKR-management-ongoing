import { useAuth } from '../auth/AuthContext';

const roleLabels = {
  administrator: '管理员',
  management: '管理层',
  project_leader: '项目负责人',
  employee: '员工',
  hr: 'HR',
} as const;

export function RoleSwitcher() {
  const { currentUser, mode, selectableUsers, selectUser } = useAuth();

  if (mode !== 'demo') return null;

  return (
    <label className="role-switcher">
      <span className="sr-only">演示角色</span>
      <select
        aria-label="演示角色"
        value={currentUser?.id ?? ''}
        onChange={(event) => selectUser(event.target.value)}
      >
        {selectableUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {`${roleLabels[user.role]} · ${user.name}`}
          </option>
        ))}
      </select>
    </label>
  );
}
