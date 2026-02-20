import React from 'react';
import { render, screen } from '../test-utils';
import { ResourceTable, StatusBadge, type Column } from '@/components/resources/resource-table';

interface TestItem {
  name: string;
  status: string;
  namespace: string;
}

const testData: TestItem[] = [
  { name: 'nginx-pod', status: 'Running', namespace: 'default' },
  { name: 'api-server', status: 'Pending', namespace: 'kube-system' },
  { name: 'worker', status: 'Failed', namespace: 'default' },
];

const columns: Column<TestItem>[] = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'namespace', label: 'Namespace' },
];

describe('ResourceTable', () => {
  it('renders all rows', () => {
    render(<ResourceTable data={testData} columns={columns} />);

    expect(screen.getByText('nginx-pod')).toBeInTheDocument();
    expect(screen.getByText('api-server')).toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<ResourceTable data={testData} columns={columns} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Namespace')).toBeInTheDocument();
  });

  it('shows resource count', () => {
    render(<ResourceTable data={testData} columns={columns} />);

    expect(screen.getByText('3 of 3 resource(s)')).toBeInTheDocument();
  });

  it('filters rows based on search input', async () => {
    const { user } = render(<ResourceTable data={testData} columns={columns} />);

    const searchInput = screen.getByPlaceholderText('Filter resources...');
    await user.type(searchInput, 'nginx');

    expect(screen.getByText('nginx-pod')).toBeInTheDocument();
    expect(screen.queryByText('api-server')).not.toBeInTheDocument();
    expect(screen.queryByText('worker')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 resource(s)')).toBeInTheDocument();
  });

  it('shows empty state when no results match filter', async () => {
    const { user } = render(<ResourceTable data={testData} columns={columns} />);

    const searchInput = screen.getByPlaceholderText('Filter resources...');
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No resources found.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<ResourceTable data={[]} columns={columns} loading={true} />);

    expect(screen.getByText('Loading resources...')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<ResourceTable data={[]} columns={columns} />);

    expect(screen.getByText('No resources found.')).toBeInTheDocument();
  });

  it('sorts rows when column header is clicked', async () => {
    const { user } = render(<ResourceTable data={testData} columns={columns} />);

    const nameHeader = screen.getByText('Name');
    await user.click(nameHeader);

    const rows = screen.getAllByRole('row');
    // Row 0 is header, rows 1-3 are data rows sorted asc
    expect(rows[1]).toHaveTextContent('api-server');
    expect(rows[2]).toHaveTextContent('nginx-pod');
    expect(rows[3]).toHaveTextContent('worker');
  });

  it('toggles sort direction on second click', async () => {
    const { user } = render(<ResourceTable data={testData} columns={columns} />);

    const nameHeader = screen.getByText('Name');
    await user.click(nameHeader); // asc
    await user.click(nameHeader); // desc

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('worker');
    expect(rows[2]).toHaveTextContent('nginx-pod');
    expect(rows[3]).toHaveTextContent('api-server');
  });

  it('calls onRowClick when a row is clicked', async () => {
    const handleClick = jest.fn();
    const { user } = render(
      <ResourceTable data={testData} columns={columns} onRowClick={handleClick} />
    );

    await user.click(screen.getByText('nginx-pod'));

    expect(handleClick).toHaveBeenCalledWith(testData[0]);
  });

  it('supports custom render functions', () => {
    const customColumns: Column<TestItem>[] = [
      { key: 'name', label: 'Name' },
      {
        key: 'status',
        label: 'Status',
        render: (row) => <span data-testid="custom-status">{row.status.toUpperCase()}</span>,
      },
    ];

    render(<ResourceTable data={testData} columns={customColumns} />);

    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('uses custom search placeholder', () => {
    render(
      <ResourceTable
        data={testData}
        columns={columns}
        searchPlaceholder="Search pods..."
      />
    );

    expect(screen.getByPlaceholderText('Search pods...')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('renders status text', () => {
    render(<StatusBadge status="Running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('applies default variant for active statuses', () => {
    const { container } = render(<StatusBadge status="Running" />);
    const badge = container.firstChild;
    expect(badge).toHaveTextContent('Running');
  });

  it('handles case-insensitive status matching', () => {
    render(<StatusBadge status="RUNNING" />);
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });
});
