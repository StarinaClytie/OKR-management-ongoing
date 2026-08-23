import type { RepositoryErrorCode } from '../data/types';
import type { MessageKey } from './messages';

const errorKeys: Record<RepositoryErrorCode, MessageKey> = {
  unauthorized: 'common.requestUnauthorized',
  not_found: 'common.requestNotFound',
  validation: 'common.requestValidation',
  conflict: 'common.requestConflict',
  duplicate: 'common.requestDuplicate',
  date_conflict: 'projects.dateConflict',
  locked: 'daily.reportLocked',
  clearance: 'daily.attachmentClearance',
  storage: 'daily.uploadStorageFailed',
  network: 'daily.uploadNetworkFailed',
  unknown: 'common.requestFailed',
};

export function repositoryErrorKey(code: RepositoryErrorCode): MessageKey {
  return errorKeys[code];
}
