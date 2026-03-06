import React from 'react';
import { render, screen } from '../test-utils';
import TerminalPage from '@/app/(dashboard)/terminal/page';
import { usePermissionsStore } from '@/stores/permissions';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/terminal',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Mock the WebTerminal component to avoid xterm/socket complexities
jest.mock('@/components/terminal/web-terminal', () => ({
  WebTerminal: () => (
    <div data-testid="web-terminal">
      <span>WebTerminal Mock</span>
      <span>Select cluster</span>
      <span>Disconnected</span>
      <span>Smart</span>
      <span>Namespace</span>
    </div>
  ),
}));

describe('TerminalPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePermissionsStore.setState({
      permissions: [
        { resource: '*', action: '*', scope_type: 'global', scope_id: '*' },
      ],
      isLoaded: true,
    });
  });

  it('renders page title and description', () => {
    render(<TerminalPage />);

    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(
      screen.getByText('Execute kubectl commands against your clusters.')
    ).toBeInTheDocument();
  });

  it('renders the WebTerminal component', () => {
    render(<TerminalPage />);

    expect(screen.getByTestId('web-terminal')).toBeInTheDocument();
    expect(screen.getByText('WebTerminal Mock')).toBeInTheDocument();
  });

  it('shows cluster selector placeholder in terminal', () => {
    render(<TerminalPage />);

    expect(screen.getByText('Select cluster')).toBeInTheDocument();
  });

  it('shows mode toggle in terminal toolbar', () => {
    render(<TerminalPage />);

    expect(screen.getByText('Smart')).toBeInTheDocument();
  });

  it('shows connection status in terminal toolbar', () => {
    render(<TerminalPage />);

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows namespace selector in terminal toolbar', () => {
    render(<TerminalPage />);

    expect(screen.getByText('Namespace')).toBeInTheDocument();
  });

  it('shows access denied when user lacks terminal permission', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'clusters', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
      isLoaded: true,
    });

    render(<TerminalPage />);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText('You do not have permission to access the terminal.')
    ).toBeInTheDocument();
  });

  it('hides terminal content when user lacks permission', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'clusters', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
      isLoaded: true,
    });

    render(<TerminalPage />);

    expect(screen.queryByTestId('web-terminal')).not.toBeInTheDocument();
    expect(screen.queryByText('Terminal')).not.toBeInTheDocument();
  });

  it('does not show access denied for admin users', () => {
    render(<TerminalPage />);

    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('grants access with specific terminal read permission', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'terminal', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
      isLoaded: true,
    });

    render(<TerminalPage />);

    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByTestId('web-terminal')).toBeInTheDocument();
  });

  it('denies access with unrelated resource permission', () => {
    usePermissionsStore.setState({
      permissions: [
        { resource: 'pods', action: 'read', scope_type: 'global', scope_id: '*' },
      ],
      isLoaded: true,
    });

    render(<TerminalPage />);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByTestId('web-terminal')).not.toBeInTheDocument();
  });
});
