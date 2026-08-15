import { Languages } from 'lucide-react';
import { useLocale } from '../i18n/LocaleProvider';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const nextLocale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  const label = locale === 'zh-CN' ? t('language.switchToEnglish') : t('language.switchToChinese');

  return (
    <button className="icon-button language-switcher" type="button" aria-label={label} title={label} onClick={() => void setLocale(nextLocale)}>
      <Languages size={19} aria-hidden="true" />
    </button>
  );
}
