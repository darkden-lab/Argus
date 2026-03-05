import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/components/ui/theme-provider';

function ThemeDisplay() {
  const { theme } = useTheme();
  return <div data-testid="theme">{theme}</div>;
}

// Mock matchMedia
const mockMatchMedia = jest.fn().mockImplementation((query: string) => ({
  matches: query.includes('dark'),
  media: query,
  onchange: null,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));
Object.defineProperty(window, 'matchMedia', { value: mockMatchMedia });

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('provides default system theme', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
  });

  it('reads stored theme from localStorage', async () => {
    localStorage.setItem('argus-theme', 'light');
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    // After useEffect runs, theme should update
    await screen.findByText('light');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  it('setTheme updates theme and localStorage', async () => {
    function SetThemeTest() {
      const { theme, setTheme } = useTheme();
      return (
        <>
          <div data-testid="theme">{theme}</div>
          <button onClick={() => setTheme('light')}>Set Light</button>
        </>
      );
    }
    render(
      <ThemeProvider>
        <SetThemeTest />
      </ThemeProvider>
    );

    act(() => {
      screen.getByText('Set Light').click();
    });

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(localStorage.getItem('argus-theme')).toBe('light');
  });

  it('setTheme to dark adds dark class', () => {
    function DarkTest() {
      const { setTheme } = useTheme();
      return <button onClick={() => setTheme('dark')}>Set Dark</button>;
    }
    render(
      <ThemeProvider>
        <DarkTest />
      </ThemeProvider>
    );

    act(() => {
      screen.getByText('Set Dark').click();
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
