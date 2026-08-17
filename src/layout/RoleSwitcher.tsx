import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../auth/roleLabels';
import { useLocale } from '../i18n/LocaleProvider';

export function RoleSwitcher() {
  const { t } = useLocale();
  const { currentUser, mode, selectableUsers, selectUser } = useAuth();

  if (mode !== 'demo') return null;

  return (
    <label className="role-switcher">
      <span className="sr-only">{t('role.demo')}</span>
      <select
        aria-label={t('role.demo')}
        value={currentUser?.id ?? ''}
        onChange={(event) => selectUser(event.target.value)}
      >
        {selectableUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {`${t(roleLabels[user.role])} · ${user.name}`}
          </option>
        ))}
      </select>
    </label>
  );
}
