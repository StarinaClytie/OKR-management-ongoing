import type { ReactNode } from 'react';

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
  if (rows.length === 0) return <p className="data-table__empty">{emptyMessage}</p>;

  return (
    <div className="data-table__scroll">
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
