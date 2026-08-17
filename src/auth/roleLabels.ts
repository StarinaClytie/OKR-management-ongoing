import type { Role } from '../domain/types';
import type { MessageKey } from '../i18n/messages';

export const roleLabels: Record<Role, MessageKey> = {
  administrator: 'role.administrator',
  management: 'role.management',
  project_leader: 'role.projectLeader',
  employee: 'role.employee',
  hr: 'role.hr',
};
