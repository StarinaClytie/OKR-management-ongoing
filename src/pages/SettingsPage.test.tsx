import { fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';
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
});
