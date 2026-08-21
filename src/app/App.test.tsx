import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders the Chinese application identity', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: '瞬谱光电 TIME-TECH SPECTRA' })).toBeInTheDocument();
});
