import { fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { DemoOkrRepository } from '../data/demoRepository';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { SettingsPage } from './SettingsPage';

function RoleControls() {
  const { selectUser } = useAuth();
  return <button type="button" onClick={() => selectUser('user-management')}>切换到管理层</button>;
}

describe('SettingsPage', () => {
  it('declares aria-controls only when the referenced settings panel exists', () => {
    render(
      <AuthProvider initialUserId="user-project-leader">
        <SettingsPage />
      </AuthProvider>,
    );

    for (const tab of screen.getAllByRole('tab')) {
      const panelId = tab.getAttribute('aria-controls');
      if (tab.getAttribute('aria-selected') === 'true') {
        expect(panelId).not.toBeNull();
        expect(document.getElementById(panelId!)).toBeInTheDocument();
      } else {
        expect(panelId).toBeNull();
      }
    }
    expect(screen.getByRole('tabpanel')).toHaveClass('settings-panel', 'form-card', 'form-section');
  });

  it('resets an unavailable active tab after the simulated user changes and keeps tab ARIA relationships valid', () => {
    render(
      <AuthProvider initialUserId="user-project-leader">
        <RoleControls />
        <SettingsPage />
      </AuthProvider>,
    );

    const projectTab = screen.getByRole('tab', { name: '项目偏好' });
    fireEvent.click(projectTab);
    expect(projectTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: '切换到管理层' }));

    const personalTab = screen.getByRole('tab', { name: '个人偏好' });
    const panel = screen.getByRole('tabpanel');
    expect(personalTab).toHaveAttribute('aria-selected', 'true');
    expect(personalTab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', personalTab.id);
  });

  it('does not carry checkbox, notice, or personal-tab state to another user', () => {
    render(<AuthProvider initialUserId="user-project-leader"><RoleControls /><SettingsPage /></AuthProvider>);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('status')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '切换到管理层' }));
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '个人偏好' })).toHaveAttribute('aria-selected', 'true');
  });

  it('retranslates a visible saved notice when the locale changes', () => {
    window.localStorage.clear();
    render(<AuthProvider><LocaleProvider repository={new DemoOkrRepository()}><LanguageSwitcher /><SettingsPage /></LocaleProvider></AuthProvider>);
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    expect(screen.getByRole('status')).toHaveTextContent('设置已保存到此设备。');

    fireEvent.click(screen.getByRole('button', { name: '切换为英文' }));

    expect(screen.getByRole('status')).toHaveTextContent('Settings saved on this device.');
  });
});
