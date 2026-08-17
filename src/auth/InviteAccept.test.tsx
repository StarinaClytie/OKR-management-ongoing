import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteAccept, type SetPasswordResult } from './InviteAccept';

describe('InviteAccept', () => {
  it('shows the invited email and sets the password', async () => {
    const setPassword = vi.fn(async (): Promise<SetPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<InviteAccept email="invitee@example.com" setPassword={setPassword} />);

    expect(screen.getByDisplayValue('invitee@example.com')).toBeDisabled();
    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(setPassword).toHaveBeenCalledWith('secret123');
  });

  it('rejects mismatched passwords', async () => {
    const setPassword = vi.fn(async (): Promise<SetPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<InviteAccept setPassword={setPassword} />);

    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'different');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('两次输入的密码不一致');
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('rejects a short password', async () => {
    const setPassword = vi.fn(async (): Promise<SetPasswordResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<InviteAccept setPassword={setPassword} />);

    await user.type(screen.getByLabelText('新密码 *'), '123');
    await user.type(screen.getByLabelText('确认密码 *'), '123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('密码至少需要 6 个字符');
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('shows a failure message when the password write fails', async () => {
    const setPassword = vi.fn(async (): Promise<SetPasswordResult> => ({ error: { message: 'boom' } }));
    const user = userEvent.setup();
    render(<InviteAccept setPassword={setPassword} />);

    await user.type(screen.getByLabelText('新密码 *'), 'secret123');
    await user.type(screen.getByLabelText('确认密码 *'), 'secret123');
    await user.click(screen.getByRole('button', { name: '完成账号设置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('账号设置失败');
  });
});
