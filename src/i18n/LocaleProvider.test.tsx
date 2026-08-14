import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository, RepositoryResult } from '../data/types';
import type { User } from '../domain/types';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LocaleProvider, useLocale } from './LocaleProvider';

const profile: User = {
  id: 'profile-1', name: 'Taylor', role: 'employee', title: 'Engineer', department: 'Product', projectIds: [], preferredLocale: 'zh-CN',
};

function renderAuthenticated(repository: OkrRepository, currentUser = profile) {
  const auth: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  function LocaleProbe() {
    const { locale } = useLocale();
    return <><span>{locale}</span><LanguageSwitcher /></>;
  }
  return render(
    <AuthContext.Provider value={auth}>
      <LocaleProvider repository={repository}><LocaleProbe /></LocaleProvider>
    </AuthContext.Provider>,
  );
}

describe('application locale', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dashboard');
  });

  it('starts a first visit synchronously in Chinese', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: '切换为英文' })).toBeVisible();
    expect(screen.getByRole('link', { name: '仪表盘' })).toBeVisible();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('switches the visible interface to English without changing the URL', async () => {
    const user = userEvent.setup();
    render(<App />);
    const startingUrl = window.location.href;

    await user.click(screen.getByRole('button', { name: '切换为英文' }));

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Switch to Chinese' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
    expect(window.location.href).toBe(startingUrl);
  });

  it('restores a valid local preference before authentication', () => {
    window.localStorage.setItem('northstar.locale', 'en');

    render(<App />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
  });

  it('lets an authenticated profile preference override the local preference and persists later changes', async () => {
    const user = userEvent.setup();
    const repository = { setMyLocale: vi.fn().mockResolvedValue({ ok: true, data: undefined }) } as unknown as OkrRepository;
    window.localStorage.setItem('northstar.locale', 'en');

    renderAuthenticated(repository);

    await waitFor(() => expect(screen.getByText('zh-CN')).toBeVisible());
    expect(window.localStorage.getItem('northstar.locale')).toBe('zh-CN');
    await user.click(screen.getByRole('button', { name: '切换为英文' }));
    expect(screen.getByText('en')).toBeVisible();
    expect(repository.setMyLocale).toHaveBeenCalledWith('en');
  });

  it('keeps the instant local choice when profile persistence fails', async () => {
    const user = userEvent.setup();
    const repository = { setMyLocale: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as OkrRepository;
    renderAuthenticated(repository);

    await user.click(screen.getByRole('button', { name: '切换为英文' }));

    expect(screen.getByText('en')).toBeVisible();
    expect(window.localStorage.getItem('northstar.locale')).toBe('en');
    expect(repository.setMyLocale).toHaveBeenCalledWith('en');
  });

  it('serializes rapid authenticated preference writes in the order selected', async () => {
    const user = userEvent.setup();
    let finishFirst!: () => void;
    const firstWrite = new Promise<RepositoryResult<void>>((resolve) => { finishFirst = () => resolve({ ok: true, data: undefined }); });
    const repository = {
      setMyLocale: vi.fn()
        .mockImplementationOnce(() => firstWrite)
        .mockResolvedValueOnce({ ok: true, data: undefined }),
    } as unknown as OkrRepository;
    renderAuthenticated(repository);

    await user.click(screen.getByRole('button', { name: '切换为英文' }));
    await user.click(screen.getByRole('button', { name: 'Switch to Chinese' }));

    expect(screen.getByText('zh-CN')).toBeVisible();
    expect(repository.setMyLocale).toHaveBeenCalledTimes(1);
    finishFirst();
    await waitFor(() => expect(repository.setMyLocale).toHaveBeenCalledTimes(2));
    expect(repository.setMyLocale).toHaveBeenNthCalledWith(1, 'en');
    expect(repository.setMyLocale).toHaveBeenNthCalledWith(2, 'zh-CN');
  });

  it('translates page, validation, status, matrix, permission, and accessibility copy while preserving authored content', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '切换为英文' }));

    expect(screen.getByRole('complementary', { name: 'Primary navigation' })).toBeVisible();
    expect(screen.getAllByText('On track')[0]).toBeVisible();
    expect(screen.getByText('完成三项新手引导实验')).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'OKR Management' }));
    expect(screen.getByRole('heading', { name: 'OKR Management' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Update My KR' }));
    await user.clear(screen.getByLabelText('Actual progress (0–100)'));
    await user.click(screen.getByRole('button', { name: 'Save KR Progress' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Actual progress must be between 0 and 100.');

    await user.click(screen.getByRole('link', { name: 'View Full Risk Matrix' }));
    expect(screen.getByRole('region', { name: 'Full Risk Matrix' })).toBeVisible();
    expect(screen.getByLabelText('Probability 3, impact 3')).toBeInTheDocument();
  });
});
