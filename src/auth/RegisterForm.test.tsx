import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RegisterForm, type RegisterFormProps } from './RegisterForm';

function renderForm(overrides: Partial<RegisterFormProps> = {}) {
  const onSubmit = vi.fn(async () => ({ error: null }));
  const onBack = vi.fn();
  render(<RegisterForm onSubmit={onSubmit} onBack={onBack} {...overrides} />);
  return { onSubmit, onBack };
}

describe('RegisterForm', () => {
  it('shows name, email, password, and confirm fields without a role selector', () => {
    renderForm();
    expect(screen.getByLabelText('姓名')).toBeVisible();
    expect(screen.getByLabelText('邮箱')).toBeVisible();
    expect(screen.getByLabelText('密码')).toBeVisible();
    expect(screen.getByLabelText('确认密码')).toBeVisible();
    expect(screen.queryByLabelText('角色')).not.toBeInTheDocument();
  });

  it('rejects a blank name', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '注册' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请输入姓名。');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('姓名'), '新员工');
    await user.type(screen.getByLabelText('邮箱'), 'not-an-email');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '注册' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请输入有效的邮箱地址。');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a mismatched password confirmation', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('姓名'), '新员工');
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'different');
    await user.click(screen.getByRole('button', { name: '注册' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('两次输入的密码不一致。');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a too-short password', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('姓名'), '新员工');
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), '123');
    await user.type(screen.getByLabelText('确认密码'), '123');
    await user.click(screen.getByRole('button', { name: '注册' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('密码至少需要 6 个字符。');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed credentials', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('姓名'), ' 新员工 ');
    await user.type(screen.getByLabelText('邮箱'), ' new@example.com ');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '注册' }));
    expect(onSubmit).toHaveBeenCalledWith('新员工', 'new@example.com', 'secret123');
  });

  it('prevents duplicate submission while registering', async () => {
    let resolveSubmit: ((value: { error: { message: string } | null }) => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<{ error: { message: string } | null }>((resolve) => { resolveSubmit = resolve; }));
    const user = userEvent.setup();
    render(<RegisterForm onSubmit={onSubmit} onBack={vi.fn()} />);

    await user.type(screen.getByLabelText('姓名'), '新员工');
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '注册' }));

    const button = screen.getByRole('button', { name: '注册中…' });
    expect(button).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await resolveSubmit?.({ error: null });
  });

  it('returns to the login form via the back action', async () => {
    const user = userEvent.setup();
    const { onBack } = renderForm();
    await user.click(screen.getByRole('button', { name: '已有账号？登录' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
