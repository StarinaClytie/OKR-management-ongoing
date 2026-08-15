import type { Classification } from '../domain/types';
import { ConfidentialityBadge } from './ConfidentialityBadge';
import { useLocale } from '../i18n/LocaleProvider';

export interface RestrictedContentProps {
  classification: Classification;
}

export function RestrictedContent({ classification }: RestrictedContentProps) {
  const { t } = useLocale();
  const isStrictlyRestricted = classification === 'restricted';

  return (
    <section className="restricted-content" aria-label={isStrictlyRestricted ? t('restricted.strictContent') : t('restricted.content')}>
      <ConfidentialityBadge classification={classification} />
      <strong>{isStrictlyRestricted ? t('restricted.strictContent') : t('restricted.content')}</strong>
      <p>{t('restricted.description')}</p>
    </section>
  );
}
