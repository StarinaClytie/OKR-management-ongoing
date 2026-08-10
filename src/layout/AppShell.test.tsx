import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppShell } from './AppShell';

function renderShell() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('application shell', () => {
  it('offers every quarter and updates the selected mock quarter', async () => {
    const user = userEvent.setup();

    renderShell();

    const quarterSelect = screen.getByLabelText('选择季度');
    expect(screen.getByRole('option', { name: '第一季度' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '第二季度' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '第三季度' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '第四季度' })).toBeInTheDocument();

    await user.selectOptions(quarterSelect, '第四季度');

    expect(quarterSelect).toHaveValue('第四季度');
  });

  it('removes the closed mobile drawer from the accessibility tree', () => {
    renderShell();

    const mobileNavigation = screen.getByLabelText('移动端主导航');
    expect(mobileNavigation).toHaveAttribute('aria-hidden', 'true');
    expect(mobileNavigation).toHaveAttribute('inert');
  });
});
