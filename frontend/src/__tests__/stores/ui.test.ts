import { useUIStore } from '@/stores/ui';

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useUIStore.setState({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      terminalPanelOpen: false,
      terminalPanelHeight: 300,
      onboardingCompleted: false,
    });
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useUIStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.commandPaletteOpen).toBe(false);
      expect(state.terminalPanelOpen).toBe(false);
      expect(state.terminalPanelHeight).toBe(300);
      expect(state.onboardingCompleted).toBe(false);
    });
  });

  describe('toggleSidebar', () => {
    it('flips sidebarCollapsed from false to true', () => {
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });

    it('flips sidebarCollapsed from true to false', () => {
      useUIStore.setState({ sidebarCollapsed: true });
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    it('persists the toggled value to localStorage', () => {
      useUIStore.getState().toggleSidebar();
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:sidebar-collapsed',
        'true'
      );
    });

    it('toggles multiple times correctly', () => {
      useUIStore.getState().toggleSidebar(); // false -> true
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      useUIStore.getState().toggleSidebar(); // true -> false
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);

      useUIStore.getState().toggleSidebar(); // false -> true
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });
  });

  describe('setSidebarCollapsed', () => {
    it('sets sidebarCollapsed to true', () => {
      useUIStore.getState().setSidebarCollapsed(true);
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });

    it('sets sidebarCollapsed to false', () => {
      useUIStore.setState({ sidebarCollapsed: true });
      useUIStore.getState().setSidebarCollapsed(false);
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    it('persists the value to localStorage', () => {
      useUIStore.getState().setSidebarCollapsed(true);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:sidebar-collapsed',
        'true'
      );
    });
  });

  describe('setCommandPaletteOpen', () => {
    it('sets commandPaletteOpen to true', () => {
      useUIStore.getState().setCommandPaletteOpen(true);
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    });

    it('sets commandPaletteOpen to false', () => {
      useUIStore.setState({ commandPaletteOpen: true });
      useUIStore.getState().setCommandPaletteOpen(false);
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it('does not persist to localStorage', () => {
      useUIStore.getState().setCommandPaletteOpen(true);
      // commandPaletteOpen is transient, not saved to localStorage
      expect(localStorage.setItem).not.toHaveBeenCalledWith(
        expect.stringContaining('command-palette'),
        expect.anything()
      );
    });
  });

  describe('setTerminalPanelOpen', () => {
    it('sets terminalPanelOpen to true', () => {
      useUIStore.getState().setTerminalPanelOpen(true);
      expect(useUIStore.getState().terminalPanelOpen).toBe(true);
    });

    it('sets terminalPanelOpen to false', () => {
      useUIStore.setState({ terminalPanelOpen: true });
      useUIStore.getState().setTerminalPanelOpen(false);
      expect(useUIStore.getState().terminalPanelOpen).toBe(false);
    });

    it('persists the value to localStorage', () => {
      useUIStore.getState().setTerminalPanelOpen(true);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:terminal-panel-open',
        'true'
      );
    });
  });

  describe('setTerminalPanelHeight', () => {
    it('updates the terminal panel height', () => {
      useUIStore.getState().setTerminalPanelHeight(500);
      expect(useUIStore.getState().terminalPanelHeight).toBe(500);
    });

    it('persists the value to localStorage', () => {
      useUIStore.getState().setTerminalPanelHeight(400);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:terminal-panel-height',
        '400'
      );
    });
  });

  describe('setOnboardingCompleted', () => {
    it('sets onboardingCompleted to true', () => {
      useUIStore.getState().setOnboardingCompleted(true);
      expect(useUIStore.getState().onboardingCompleted).toBe(true);
    });

    it('persists the value to localStorage', () => {
      useUIStore.getState().setOnboardingCompleted(true);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:onboarding-completed',
        'true'
      );
    });
  });

  describe('localStorage persistence', () => {
    it('saves sidebar state on toggle', () => {
      useUIStore.getState().toggleSidebar();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:sidebar-collapsed',
        'true'
      );
    });

    it('saves terminal panel state on change', () => {
      useUIStore.getState().setTerminalPanelOpen(true);
      useUIStore.getState().setTerminalPanelHeight(450);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:terminal-panel-open',
        'true'
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'argus:terminal-panel-height',
        '450'
      );
    });
  });
});
