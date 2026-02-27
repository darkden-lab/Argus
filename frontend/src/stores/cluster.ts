import { create } from 'zustand';
import { api } from '@/lib/api';

interface Cluster {
  id: string;
  name: string;
  status: string;
  api_server_url: string;
  [key: string]: unknown;
}

interface ClusterState {
  clusters: Cluster[];
  selectedClusterId: string | null;
  loading: boolean;
  fetchClusters: () => Promise<void>;
  setSelectedClusterId: (id: string) => void;
}

const STORAGE_KEY = 'argus_selected_cluster_id';

function loadSelectedClusterId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  clusters: [],
  selectedClusterId: loadSelectedClusterId(),
  loading: false,

  fetchClusters: async () => {
    set({ loading: true });
    try {
      const data = await api.get<Cluster[]>('/api/clusters');
      const { selectedClusterId } = get();
      let newSelectedId = selectedClusterId;

      // If no cluster selected or selected cluster no longer exists, auto-select
      if (!newSelectedId || !data.find((c) => c.id === newSelectedId)) {
        const healthy = data.find(
          (c) => c.status === 'connected' || c.status === 'healthy'
        );
        newSelectedId = healthy?.id ?? data[0]?.id ?? null;
        if (newSelectedId) {
          localStorage.setItem(STORAGE_KEY, newSelectedId);
        }
      }

      set({ clusters: data, selectedClusterId: newSelectedId, loading: false });
    } catch {
      set({ clusters: [], loading: false });
    }
  },

  setSelectedClusterId: (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    set({ selectedClusterId: id });
  },
}));
