import type { Classification } from '../domain/types';
import { ConfidentialityBadge } from './ConfidentialityBadge';

export interface RestrictedContentProps {
  classification: Classification;
}

export function RestrictedContent({ classification }: RestrictedContentProps) {
  const isStrictlyRestricted = classification === 'restricted';

  return (
    <section className="restricted-content" aria-label={isStrictlyRestricted ? '严格机密内容' : '受限内容'}>
      <ConfidentialityBadge classification={classification} />
      <strong>{isStrictlyRestricted ? '严格机密内容' : '受限内容'}</strong>
      <p>你当前没有查看这部分内容的权限。</p>
    </section>
  );
}
