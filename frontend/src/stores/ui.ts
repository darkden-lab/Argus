import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  terminalPanelOpen: boolean;
  terminalPanelHeight: number;
  onboardingCompleted: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTerminalPanelOpen: (open: boolean) => void;
  setTerminalPanelHeight: (height: number) => void;
  setOnboardingCompleted: (completed: boolean) => void;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently fail if localStorage is full or unavailable
  }
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: loadFromStorage("argus:sidebar-collapsed", false),
  commandPaletteOpen: false,
  terminalPanelOpen: loadFromStorage("argus:terminal-panel-open", false),
  terminalPanelHeight: loadFromStorage("argus:terminal-panel-height", 300),
  onboardingCompleted: loadFromStorage("argus:onboarding-completed", false),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      saveToStorage("argus:sidebar-collapsed", next);
      return { sidebarCollapsed: next };
    }),

  setSidebarCollapsed: (collapsed: boolean) => {
    saveToStorage("argus:sidebar-collapsed", collapsed);
    set({ sidebarCollapsed: collapsed });
  },

  setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),

  setTerminalPanelOpen: (open: boolean) => {
    saveToStorage("argus:terminal-panel-open", open);
    set({ terminalPanelOpen: open });
  },

  setTerminalPanelHeight: (height: number) => {
    saveToStorage("argus:terminal-panel-height", height);
    set({ terminalPanelHeight: height });
  },

  setOnboardingCompleted: (completed: boolean) => {
    saveToStorage("argus:onboarding-completed", completed);
    set({ onboardingCompleted: completed });
  },
}));
