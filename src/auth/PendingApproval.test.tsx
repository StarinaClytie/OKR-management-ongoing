import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PendingApproval } from './PendingApproval';

describe('PendingApproval', () => {
  it('shows the pending-approval copy, the signed-in email, and both actions', () => {
    render(<PendingApproval email="new@example.com" onRefresh={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '注册成功，等待管理员审批' })).toBeVisible();
    expect(screen.getByText('您的账号已创建。管理员批准并分配身份后即可进入系统。')).toBeVisible();
    expect(screen.getByText(/new@example\.com/)).toBeVisible();
    expect(screen.getByRole('button', { name: '刷新状态' })).toBeVisible();
    expect(screen.getByRole('button', { name: '退出登录' })).toBeVisible();
  });

  it('refreshes the profile state on refresh', async () => {
    const onRefresh = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<PendingApproval onRefresh={onRefresh} onSignOut={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '刷新状态' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('signs out on sign out', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(<PendingApproval onRefresh={vi.fn()} onSignOut={onSignOut} />);
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
