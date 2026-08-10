import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

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
      return (
        <section className="widget-error" role="status">
          <strong>该模块暂时无法显示</strong>
          <p>请稍后重试，或继续查看其他内容。</p>
        </section>
      );
    }

    return this.props.children;
  }
}
