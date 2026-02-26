import React from 'react';
import { render, screen, waitFor } from '../../test-utils';
import { CommandPalette, type CommandGroup } from '@/components/ui/command-palette';

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = jest.fn();

const mockGroups: CommandGroup[] = [
  {
    heading: 'Navigation',
    items: [
      { id: 'dashboard', label: 'Go to Dashboard', onSelect: jest.fn() },
      { id: 'clusters', label: 'Go to Clusters', onSelect: jest.fn(), shortcut: 'G+C' },
    ],
  },
  {
    heading: 'Actions',
    items: [
      { id: 'deploy', label: 'New Deployment', onSelect: jest.fn() },
      { id: 'terminal', label: 'Open Terminal', onSelect: jest.fn(), shortcut: 'Ctrl+`' },
    ],
  },
];

function renderPalette(open = true, groups = mockGroups) {
  const onOpenChange = jest.fn();
  const result = render(
    <CommandPalette open={open} onOpenChange={onOpenChange} groups={groups} />
  );
  return { ...result, onOpenChange };
}

describe('CommandPalette', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the onSelect mocks in the groups
    for (const group of mockGroups) {
      for (const item of group.items) {
        (item.onSelect as jest.Mock).mockClear();
      }
    }
  });

  describe('rendering', () => {
    it('renders when open', () => {
      renderPalette(true);

      expect(screen.getByText('Command Palette')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type a command or search...')).toBeInTheDocument();
    });

    it('renders all group headings', () => {
      renderPalette(true);

      expect(screen.getByText('Navigation')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders all items', () => {
      renderPalette(true);

      expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Go to Clusters')).toBeInTheDocument();
      expect(screen.getByText('New Deployment')).toBeInTheDocument();
      expect(screen.getByText('Open Terminal')).toBeInTheDocument();
    });

    it('renders keyboard shortcuts', () => {
      renderPalette(true);

      // The shortcut "G+C" is split by "+" and rendered as separate key spans
      expect(screen.getByText('G')).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
    });

    it('renders items with role="option"', () => {
      renderPalette(true);

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(4);
    });

    it('renders the listbox container', () => {
      renderPalette(true);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('search filtering', () => {
    it('filters items based on search input', async () => {
      const { user } = renderPalette(true);

      const input = screen.getByPlaceholderText('Type a command or search...');
      await user.type(input, 'terminal');

      expect(screen.getByText('Open Terminal')).toBeInTheDocument();
      expect(screen.queryByText('Go to Dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Go to Clusters')).not.toBeInTheDocument();
      expect(screen.queryByText('New Deployment')).not.toBeInTheDocument();
    });

    it('filters case-insensitively', async () => {
      const { user } = renderPalette(true);

      const input = screen.getByPlaceholderText('Type a command or search...');
      await user.type(input, 'DASHBOARD');

      expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    });

    it('shows "No results found." when search matches nothing', async () => {
      const { user } = renderPalette(true);

      const input = screen.getByPlaceholderText('Type a command or search...');
      await user.type(input, 'xyznonexistent');

      expect(screen.getByText('No results found.')).toBeInTheDocument();
    });

    it('hides group headings when all items in group are filtered out', async () => {
      const { user } = renderPalette(true);

      const input = screen.getByPlaceholderText('Type a command or search...');
      await user.type(input, 'deployment');

      // Only "Actions" group has "New Deployment"
      expect(screen.getByText('Actions')).toBeInTheDocument();
      expect(screen.queryByText('Navigation')).not.toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    it('moves selection down with ArrowDown', async () => {
      const { user } = renderPalette(true);

      const input = screen.getByPlaceholderText('Type a command or search...');
      await user.keyboard('{ArrowDown}');

      const options = screen.getAllByRole('option');
      // First item starts as active (index 0), ArrowDown moves to index 1
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('moves selection up with ArrowUp', async () => {
      const { user } = renderPalette(true);

      const input = screen.getByPlaceholderText('Type a command or search...');
      // Move down once then up once should return to first item
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('wraps around from last to first with ArrowDown', async () => {
      const { user } = renderPalette(true);

      // Move to the last item (4 items total, start at 0, press 4 times to wrap)
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');

      // Should wrap to index 0
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('wraps around from first to last with ArrowUp', async () => {
      const { user } = renderPalette(true);

      // Starting at index 0, ArrowUp should wrap to last
      await user.keyboard('{ArrowUp}');

      const options = screen.getAllByRole('option');
      expect(options[3]).toHaveAttribute('aria-selected', 'true');
    });

    it('selects item and closes on Enter', async () => {
      const { user, onOpenChange } = renderPalette(true);

      await user.keyboard('{Enter}');

      // First item (index 0) = "Go to Dashboard"
      expect(mockGroups[0].items[0].onSelect).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on Escape', async () => {
      const { user, onOpenChange } = renderPalette(true);

      await user.keyboard('{Escape}');

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('mouse interactions', () => {
    it('calls onSelect and closes when an item is clicked', async () => {
      const { user, onOpenChange } = renderPalette(true);

      await user.click(screen.getByText('New Deployment'));

      expect(mockGroups[1].items[0].onSelect).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
