import type { ReactNode } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

export interface DataTableColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  ariaLabel: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  emptyMessage: string;
}

export function DataTable<Row>({ ariaLabel, columns, rows, getRowKey, emptyMessage }: DataTableProps<Row>) {
  const { t } = useLocale();
  if (rows.length === 0) return <p className="data-table__empty">{emptyMessage}</p>;

  return (
    <div
      className="data-table__scroll"
      role="region"
      tabIndex={0}
      aria-label={t('common.scrollable', { label: ariaLabel })}
      onKeyDown={(event) => {
        const distance = 80;
        if (event.key === 'ArrowRight') { event.preventDefault(); event.currentTarget.scrollLeft += distance; }
        if (event.key === 'ArrowLeft') { event.preventDefault(); event.currentTarget.scrollLeft -= distance; }
        if (event.key === 'Home') { event.preventDefault(); event.currentTarget.scrollLeft = 0; }
        if (event.key === 'End') { event.preventDefault(); event.currentTarget.scrollLeft = event.currentTarget.scrollWidth; }
      }}
    >
      <table className="data-table" aria-label={ariaLabel}>
        <thead>
          <tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
