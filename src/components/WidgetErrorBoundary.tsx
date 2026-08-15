import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

function WidgetErrorFallback() {
  const { t } = useLocale();
  return <section className="widget-error" role="status"><strong>{t('error.widgetTitle')}</strong><p>{t('error.widgetDescription')}</p></section>;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<PropsWithChildren, WidgetErrorBoundaryState> {
  public override state: WidgetErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Future audit reporting belongs to the backend integration layer.
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return <WidgetErrorFallback />;
    }

    return this.props.children;
  }
}
