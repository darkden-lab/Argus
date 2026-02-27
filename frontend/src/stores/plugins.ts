import { create } from "zustand";
import { api } from "@/lib/api";

export interface PluginNavItem {
  label: string;
  icon: string;
  path: string;
}

export interface PluginRoute {
  path: string;
  component: string;
}

export interface PluginWidget {
  id: string;
  type: string;
  component: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  frontend: {
    navigation: PluginNavItem[];
    routes: PluginRoute[];
    widgets: PluginWidget[];
  };
}

export interface PluginEntry {
  manifest: PluginManifest;
  enabled: boolean;
}

interface PluginState {
  /** Only enabled plugins with frontend navigation (used by sidebar) */
  plugins: PluginManifest[];
  /** All plugins regardless of enabled state (used by settings page) */
  allPlugins: PluginEntry[];
  isLoading: boolean;
  error: string | null;
  fetchPlugins: () => Promise<void>;
  getPlugin: (id: string) => PluginManifest | undefined;
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  allPlugins: [],
  isLoading: false,
  error: null,

  fetchPlugins: async () => {
    set({ isLoading: true, error: null });
    try {
      // Backend returns array of PluginInfo: { manifest, enabled }
      const data = await api.get<PluginEntry[]>("/api/plugins");

      // Store all plugins for the settings page
      const allPlugins = data ?? [];

      // Filter only enabled plugins that have frontend navigation items
      const enabled = allPlugins
        .filter((p) => p.enabled)
        .map((p) => p.manifest)
        .filter(
          (m) =>
            m.frontend &&
            m.frontend.navigation &&
            m.frontend.navigation.length > 0
        );

      set({ plugins: enabled, allPlugins });
    } catch {
      set({ error: "Failed to load plugins" });
    } finally {
      set({ isLoading: false });
    }
  },

  getPlugin: (id: string) => get().plugins.find((p) => p.id === id),
}));
