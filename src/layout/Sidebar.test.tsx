import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';

describe('application sidebar', () => {
  it('shows administrator system settings but not confidential business shortcuts', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText('演示角色'), 'user-administrator');

    expect(screen.getByRole('link', { name: '设置' })).toBeVisible();
    expect(screen.queryByText('机密项目正文')).not.toBeInTheDocument();
  });
});
