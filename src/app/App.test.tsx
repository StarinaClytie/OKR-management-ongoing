import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders the Chinese application identity', () => {
  render(<App />);
  expect(screen.getByText('Northstar OKR')).toBeInTheDocument();
});
