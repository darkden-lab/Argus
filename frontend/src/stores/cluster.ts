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
  selectedNamespace: string | null;
  selectedProject: string | null;
  namespaces: string[];
  loading: boolean;
  fetchClusters: () => Promise<void>;
  setSelectedClusterId: (id: string) => void;
  setSelectedNamespace: (ns: string | null) => void;
  setSelectedProject: (project: string | null) => void;
  setNamespaces: (nsList: string[]) => void;
}

const STORAGE_KEY = 'argus_selected_cluster_id';

function loadSelectedClusterId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  clusters: [],
  selectedClusterId: loadSelectedClusterId(),
  selectedNamespace: null,
  selectedProject: null,
  namespaces: [],
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
    const saved = typeof window !== 'undefined'
      ? localStorage.getItem(`argus_ns_${id}`) ?? null
      : null;
    set({ selectedClusterId: id, selectedNamespace: saved, selectedProject: null, namespaces: [] });
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, id);
    }
  },

  setSelectedNamespace: (ns: string | null) => {
    const { selectedClusterId } = get();
    set({ selectedNamespace: ns });
    if (typeof window !== 'undefined' && selectedClusterId) {
      if (ns) {
        localStorage.setItem(`argus_ns_${selectedClusterId}`, ns);
      } else {
        localStorage.removeItem(`argus_ns_${selectedClusterId}`);
      }
    }
  },

  setSelectedProject: (project: string | null) => {
    if (project) {
      set({ selectedProject: project, selectedNamespace: null });
    } else {
      set({ selectedProject: null });
    }
  },

  setNamespaces: (nsList: string[]) => set({ namespaces: nsList }),
}));
