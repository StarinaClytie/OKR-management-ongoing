import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResetPassword, type ResetPasswordResult } from './ResetPassword';

describe('ResetPassword', () => {
  it('submits a valid new password', async () => {
    const onSubmit = vi.fn(async (): Promise<ResetPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<ResetPassword onSubmit={onSubmit} onBack={() => {}} />);

    await user.type(screen.getByLabelText('新密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(onSubmit).toHaveBeenCalledWith('secret123');
  });

  it('rejects mismatched passwords', async () => {
    const onSubmit = vi.fn(async (): Promise<ResetPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<ResetPassword onSubmit={onSubmit} onBack={() => {}} />);

    await user.type(screen.getByLabelText('新密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'different');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('两次输入的密码不一致');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a too-short password', async () => {
    const onSubmit = vi.fn(async (): Promise<ResetPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<ResetPassword onSubmit={onSubmit} onBack={() => {}} />);

    await user.type(screen.getByLabelText('新密码'), '123');
    await user.type(screen.getByLabelText('确认密码'), '123');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('密码至少需要 6 个字符');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
