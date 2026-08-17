import type { RepositoryErrorCode } from '../data/types';
import type { MessageKey } from './messages';

const errorKeys: Record<RepositoryErrorCode, MessageKey> = {
  unauthorized: 'common.requestUnauthorized',
  validation: 'common.requestValidation',
  conflict: 'common.requestConflict',
  network: 'common.requestFailed',
  unknown: 'common.requestFailed',
};

export function repositoryErrorKey(code: RepositoryErrorCode): MessageKey {
  return errorKeys[code];
}
