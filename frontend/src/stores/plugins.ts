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

interface PluginState {
  plugins: PluginManifest[];
  isLoading: boolean;
  fetchPlugins: () => Promise<void>;
  getPlugin: (id: string) => PluginManifest | undefined;
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  isLoading: false,

  fetchPlugins: async () => {
    set({ isLoading: true });
    try {
      // Backend returns array of PluginInfo: { manifest, enabled }
      const data = await api.get<{ manifest: PluginManifest; enabled: boolean }[]>(
        "/api/plugins"
      );
      const enabled = data
        .filter((p) => p.enabled)
        .map((p) => p.manifest)
        .filter((m) => m.frontend);
      set({ plugins: enabled });
    } catch {
      // silently fail - plugins are optional
    } finally {
      set({ isLoading: false });
    }
  },

  getPlugin: (id: string) => get().plugins.find((p) => p.id === id),
}));
