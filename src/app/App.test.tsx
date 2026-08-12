import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders the Chinese application identity', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'Northstar OKR' })).toBeInTheDocument();
});
