import React from 'react';
import { render } from '../../test-utils';
import { StatusDot, type StatusType } from '@/components/ui/status-dot';

describe('StatusDot', () => {
  describe('rendering with different statuses', () => {
    it('renders with data-status attribute set to the status value', () => {
      const statuses: StatusType[] = ['healthy', 'warning', 'error', 'info', 'unknown'];

      for (const status of statuses) {
        const { container, unmount } = render(<StatusDot status={status} />);
        const dot = container.querySelector('[data-slot="status-dot"]');
        expect(dot).toHaveAttribute('data-status', status);
        unmount();
      }
    });

    it('renders healthy status with bg-success class', () => {
      const { container } = render(<StatusDot status="healthy" />);
      const innerDot = container.querySelector('[data-slot="status-dot"] > span:last-child');
      expect(innerDot).toHaveClass('bg-success');
    });

    it('renders warning status with bg-warning class', () => {
      const { container } = render(<StatusDot status="warning" />);
      const innerDot = container.querySelector('[data-slot="status-dot"] > span:last-child');
      expect(innerDot).toHaveClass('bg-warning');
    });

    it('renders error status with bg-destructive class', () => {
      const { container } = render(<StatusDot status="error" />);
      const innerDot = container.querySelector('[data-slot="status-dot"] > span:last-child');
      expect(innerDot).toHaveClass('bg-destructive');
    });

    it('renders info status with bg-info class', () => {
      const { container } = render(<StatusDot status="info" />);
      const innerDot = container.querySelector('[data-slot="status-dot"] > span:last-child');
      expect(innerDot).toHaveClass('bg-info');
    });

    it('renders unknown status with bg-muted-foreground class', () => {
      const { container } = render(<StatusDot status="unknown" />);
      const innerDot = container.querySelector('[data-slot="status-dot"] > span:last-child');
      expect(innerDot).toHaveClass('bg-muted-foreground');
    });
  });

  describe('pulse animation', () => {
    it('renders pulse animation by default for non-unknown statuses', () => {
      const { container } = render(<StatusDot status="healthy" />);
      const pulseElement = container.querySelector('.animate-ping');
      expect(pulseElement).toBeInTheDocument();
    });

    it('does not render pulse animation for unknown status even when pulse is true', () => {
      const { container } = render(<StatusDot status="unknown" pulse={true} />);
      const pulseElement = container.querySelector('.animate-ping');
      expect(pulseElement).not.toBeInTheDocument();
    });

    it('does not render pulse animation when pulse is false', () => {
      const { container } = render(<StatusDot status="healthy" pulse={false} />);
      const pulseElement = container.querySelector('.animate-ping');
      expect(pulseElement).not.toBeInTheDocument();
    });

    it('renders pulse animation for error status', () => {
      const { container } = render(<StatusDot status="error" pulse={true} />);
      const pulseElement = container.querySelector('.animate-ping');
      expect(pulseElement).toBeInTheDocument();
    });

    it('renders pulse animation for warning status', () => {
      const { container } = render(<StatusDot status="warning" />);
      const pulseElement = container.querySelector('.animate-ping');
      expect(pulseElement).toBeInTheDocument();
    });

    it('renders pulse animation for info status', () => {
      const { container } = render(<StatusDot status="info" />);
      const pulseElement = container.querySelector('.animate-ping');
      expect(pulseElement).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('renders with medium size by default', () => {
      const { container } = render(<StatusDot status="healthy" />);
      const dot = container.querySelector('[data-slot="status-dot"]');
      expect(dot).toHaveClass('h-2.5', 'w-2.5');
    });

    it('renders with small size', () => {
      const { container } = render(<StatusDot status="healthy" size="sm" />);
      const dot = container.querySelector('[data-slot="status-dot"]');
      expect(dot).toHaveClass('h-1.5', 'w-1.5');
    });

    it('renders with large size', () => {
      const { container } = render(<StatusDot status="healthy" size="lg" />);
      const dot = container.querySelector('[data-slot="status-dot"]');
      expect(dot).toHaveClass('h-3.5', 'w-3.5');
    });
  });

  describe('custom className', () => {
    it('applies additional className to the root element', () => {
      const { container } = render(<StatusDot status="healthy" className="my-custom-class" />);
      const dot = container.querySelector('[data-slot="status-dot"]');
      expect(dot).toHaveClass('my-custom-class');
    });
  });
});
