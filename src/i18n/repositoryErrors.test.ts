import { expect, it } from 'vitest';
import { repositoryErrorKey } from './repositoryErrors';

it.each([
  ['locked', 'daily.reportLocked'],
  ['clearance', 'daily.attachmentClearance'],
  ['storage', 'daily.uploadStorageFailed'],
  ['network', 'daily.uploadNetworkFailed'],
] as const)('maps the %s repository error to its actionable localized message', (code, key) => {
  expect(repositoryErrorKey(code)).toBe(key);
});
