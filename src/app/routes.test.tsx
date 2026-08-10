import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('application routes', () => {
  it('redirects an employee from an unauthorized settings route', async () => {
    window.history.pushState({}, '', '/settings');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '访问受限' })).toBeVisible();
  });
});
