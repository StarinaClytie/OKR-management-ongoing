import type { DailyOkrBlock, DailyReportKeyResultRef } from './types';

/**
 * Readable identity of a daily entry's linked quarterly KR.
 *
 * Returns null when the server could not resolve it (the KR row was deleted
 * after the report was written). Callers must render an explicit "unavailable"
 * label in that case — never `block.keyResultId`, which is a raw UUID and not
 * user-facing content.
 */
export function linkedKeyResult(block: Pick<DailyOkrBlock, 'keyResult'>): DailyReportKeyResultRef | null {
  const keyResult = block.keyResult;
  if (!keyResult || keyResult.title.trim() === '') return null;
  return keyResult;
}

export interface LinkedKeyResultLabels {
  unavailable: string;
  owner: string;
}

/** Single-line rendering for plain-text surfaces (Word export, print view). */
export function formatLinkedKeyResult(
  block: Pick<DailyOkrBlock, 'keyResult'>,
  labels: LinkedKeyResultLabels,
): string {
  const keyResult = linkedKeyResult(block);
  if (!keyResult) return labels.unavailable;

  const parts = [keyResult.title.trim()];
  if (keyResult.description.trim()) parts.push(keyResult.description.trim());
  if (keyResult.ownerName.trim()) parts.push(`${labels.owner}：${keyResult.ownerName.trim()}`);
  return parts.join('｜');
}
