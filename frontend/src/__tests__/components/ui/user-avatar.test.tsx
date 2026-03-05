import React from 'react';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from '@/components/ui/user-avatar';

describe('UserAvatar', () => {
  it('renders fallback initials for two-word name', () => {
    render(
      <UserAvatar
        user={{ display_name: 'John Doe', email: 'john@example.com', id: '123' }}
      />
    );
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('shows first letter of email when no display_name', () => {
    render(<UserAvatar user={{ email: 'alice@example.com', id: '456' }} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows ? when no user info', () => {
    render(<UserAvatar user={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('applies correct size class for lg', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: 'Test', id: '1' }} size="lg" />
    );
    expect(container.firstChild).toHaveClass('h-12');
  });

  it('applies correct size class for sm', () => {
    const { container } = render(
      <UserAvatar user={{ display_name: 'Test', id: '1' }} size="sm" />
    );
    expect(container.firstChild).toHaveClass('h-6');
  });

  it('renders single initial for single-word name', () => {
    render(<UserAvatar user={{ display_name: 'Alice', id: '1' }} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
