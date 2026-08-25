import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPassword, type ForgotPasswordResult } from './ForgotPassword';

describe('ForgotPassword', () => {
  it('submits the entered email and shows the sent confirmation', async () => {
    const onSubmit = vi.fn(async (): Promise<ForgotPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<ForgotPassword onSubmit={onSubmit} onBack={() => {}} />);

    await user.type(screen.getByLabelText('邮箱'), 'member@example.com');
    await user.click(screen.getByRole('button', { name: '发送重置链接' }));

    expect(onSubmit).toHaveBeenCalledWith('member@example.com');
    expect(await screen.findByRole('heading', { name: '重置链接已发送' })).toBeVisible();
  });

  it('rejects an invalid email without submitting', async () => {
    const onSubmit = vi.fn(async (): Promise<ForgotPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<ForgotPassword onSubmit={onSubmit} onBack={() => {}} />);

    await user.type(screen.getByLabelText('邮箱'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: '发送重置链接' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('请输入有效的邮箱地址');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
