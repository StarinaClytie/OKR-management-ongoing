import { render, screen } from '@testing-library/react';
import { RevisionHistory } from './RevisionHistory';

it('renders accessible immutable revision metadata', () => {
  render(<RevisionHistory revisions={[{ revision: 2, createdAt: '2026-08-13T09:00:00Z', editorName: '员工一' }, { revision: 1, createdAt: '2026-08-12T09:00:00Z', editorName: '员工一' }]} />);
  expect(screen.getByRole('list', { name: '修订历史' })).toHaveTextContent('版本 2');
  expect(screen.getAllByText(/员工一/)).toHaveLength(2);
});
