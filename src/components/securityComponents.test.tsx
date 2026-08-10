import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../auth/AuthContext';
import { projects } from '../mocks/okr';
import { ConfidentialityBadge } from './ConfidentialityBadge';
import { EmptyState } from './EmptyState';
import { ExportGuard } from './ExportGuard';
import { ProgressRing } from './ProgressRing';
import { RestrictedContent } from './RestrictedContent';
import { StatusBadge } from './StatusBadge';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';

describe('security-aware shared components', () => {
  it('does not leak a restricted document title', () => {
    render(<RestrictedContent classification="restricted" />);

    expect(screen.getByText('严格机密内容')).toBeVisible();
    expect(screen.queryByText('数据访问审批记录.pdf')).not.toBeInTheDocument();
  });

  it('blocks export when export permission is missing', async () => {
    const user = userEvent.setup();
    let exportCount = 0;

    render(
      <AuthProvider initialUserId="user-employee">
        <ExportGuard resource={projects[1]} label="导出" onExport={() => { exportCount += 1; }} />
      </AuthProvider>,
    );

    const exportButton = screen.getByRole('button', { name: '导出' });
    await user.click(exportButton);
    exportButton.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(exportButton).toBeDisabled();
    expect(exportCount).toBe(0);
    expect(screen.getByText('你没有导出该记录的权限')).toBeVisible();
  });

  it('allows an authorized user to export with pointer, Enter, and Space activation', async () => {
    const user = userEvent.setup();
    let activationCount = 0;

    render(
      <AuthProvider initialUserId="user-management">
        <ExportGuard resource={projects[1]} label="导出项目" onExport={() => { activationCount += 1; }} />
      </AuthProvider>,
    );

    const exportControl = screen.getByRole('button', { name: '导出项目' });
    await user.click(exportControl);
    exportControl.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(exportControl).toBeEnabled();
    expect(activationCount).toBe(3);
  });

  it('describes progress with an accessible percentage', () => {
    render(<ProgressRing value={72} />);

    expect(screen.getByLabelText('完成进度 72%')).toHaveAttribute('aria-valuenow', '72');
  });

  it('renders status and classification as text instead of color alone', () => {
    render(
      <>
        <StatusBadge status="at_risk" />
        <ConfidentialityBadge classification="confidential" />
      </>,
    );

    expect(screen.getByText('存在风险')).toBeVisible();
    expect(screen.getByText('机密')).toBeVisible();
  });

  it('provides exactly one clear next action for an empty state', async () => {
    const user = userEvent.setup();
    let invoked = false;

    render(
      <EmptyState
        title="还没有日报"
        description="从今天的工作开始记录。"
        primaryAction={{ label: '填写日报', onClick: () => { invoked = true; } }}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(invoked).toBe(true);
  });

  it('shows a safe fallback without hiding sibling widgets after a widget error', () => {
    function BrokenWidget(): never {
      throw new Error('widget failure');
    }

    render(
      <>
        <WidgetErrorBoundary>
          <BrokenWidget />
        </WidgetErrorBoundary>
        <section>项目进度</section>
      </>,
    );

    expect(screen.getByText('该模块暂时无法显示')).toBeVisible();
    expect(screen.getByText('项目进度')).toBeVisible();
  });
});
