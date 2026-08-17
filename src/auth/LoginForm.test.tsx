import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm, type SignInResult } from './LoginForm';

describe('LoginForm', () => {
  it('submits the entered credentials', async () => {
    const signIn = vi.fn(async (): Promise<SignInResult> => ({ error: null }));
    const user = userEvent.setup();
    render(<LoginForm signIn={signIn} />);

    await user.type(screen.getByLabelText('邮箱'), 'member@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(signIn).toHaveBeenCalledWith('member@example.com', 'secret');
  });

  it('disables the submit button and prevents duplicate submission while loading', async () => {
    let resolveSignIn: ((value: SignInResult) => void) | undefined;
    const signIn = vi.fn(() => new Promise<SignInResult>((resolve) => { resolveSignIn = resolve; }));
    const user = userEvent.setup();
    render(<LoginForm signIn={signIn} />);

    await user.type(screen.getByLabelText('邮箱'), 'member@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret');
    await user.click(screen.getByRole('button', { name: '登录' }));

    const button = screen.getByRole('button', { name: '登录中…' });
    expect(button).toBeDisabled();
    expect(signIn).toHaveBeenCalledTimes(1);

    await user.click(button);
    expect(signIn).toHaveBeenCalledTimes(1);

    await resolveSignIn?.({ error: null });
  });

  it('shows a localized message when authentication fails', async () => {
    const signIn = vi.fn(async (): Promise<SignInResult> => ({ error: { message: 'Invalid login credentials' } }));
    const user = userEvent.setup();
    render(<LoginForm signIn={signIn} />);

    await user.type(screen.getByLabelText('邮箱'), 'member@example.com');
    await user.type(screen.getByLabelText('密码'), 'wrong');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('邮箱或密码错误');
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
  });
});
