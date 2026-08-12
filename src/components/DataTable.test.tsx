import { fireEvent, render, screen } from '@testing-library/react';
import { DataTable } from './DataTable';

describe('DataTable', () => {
  it('makes overflowing tables keyboard-scrollable through a named region', () => {
    render(
      <DataTable
        ariaLabel="示例数据"
        rows={[{ id: 'first', value: '第一行' }]}
        getRowKey={(row) => row.id}
        emptyMessage="无数据"
        columns={[{ key: 'value', label: '值', render: (row) => row.value }]}
      />,
    );
    const region = screen.getByRole('region', { name: '示例数据，可横向滚动' });
    Object.defineProperty(region, 'scrollLeft', { value: 0, writable: true });
    Object.defineProperty(region, 'scrollWidth', { value: 500, configurable: true });
    Object.defineProperty(region, 'clientWidth', { value: 100, configurable: true });

    region.focus();
    fireEvent.keyDown(region, { key: 'ArrowRight' });

    expect(region).toHaveFocus();
    expect(region.scrollLeft).toBeGreaterThan(0);
  });
});
