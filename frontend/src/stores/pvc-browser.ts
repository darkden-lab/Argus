import { create } from 'zustand';
import { api } from '@/lib/api';

export interface FileInfo {
  name: string;
  size: number;
  is_dir: boolean;
  mod_time: string;
  permissions: string;
  is_symlink: boolean;
}

interface Session {
  id: string;
  cluster_id: string;
  namespace: string;
  pvc_name: string;
  pod_name: string;
  user_id: string;
  created_at: string;
  last_used_at: string;
}

interface PVCBrowserState {
  sessionId: string | null;
  clusterId: string;
  namespace: string;
  pvcName: string;
  currentPath: string;
  files: FileInfo[];
  loading: boolean;
  error: string | null;
  selectedFile: FileInfo | null;
  fileContent: string | null;
  fileIsBinary: boolean;

  startSession: (clusterId: string, namespace: string, pvcName: string) => Promise<void>;
  stopSession: () => Promise<void>;
  navigate: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  selectFile: (file: FileInfo) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  deleteItem: (path: string, recursive: boolean) => Promise<void>;
  renameItem: (oldPath: string, newPath: string) => Promise<void>;
  clearSelection: () => void;
  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  clusterId: '',
  namespace: '',
  pvcName: '',
  currentPath: '/',
  files: [] as FileInfo[],
  loading: false,
  error: null as string | null,
  selectedFile: null as FileInfo | null,
  fileContent: null as string | null,
  fileIsBinary: false,
};

export const usePVCBrowserStore = create<PVCBrowserState>((set, get) => ({
  ...initialState,

  startSession: async (clusterId, namespace, pvcName) => {
    set({ loading: true, error: null, clusterId, namespace, pvcName });
    try {
      const session = await api.post<Session>(
        `/api/clusters/${clusterId}/pvc-browser/sessions`,
        { namespace, pvc_name: pvcName },
      );
      set({ sessionId: session.id, loading: false });
      await get().navigate('/');
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to start session' });
    }
  },

  stopSession: async () => {
    const { sessionId, clusterId } = get();
    if (sessionId) {
      try {
        await api.del(`/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}`);
      } catch {
        // best-effort cleanup
      }
    }
  },

  navigate: async (path) => {
    const { sessionId, clusterId } = get();
    if (!sessionId) return;
    set({ loading: true, error: null, selectedFile: null, fileContent: null, fileIsBinary: false });
    try {
      const data = await api.get<{ files: FileInfo[] }>(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}/ls?path=${encodeURIComponent(path)}`,
      );
      set({ currentPath: path, files: data.files ?? [], loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to list directory' });
    }
  },

  refresh: async () => {
    await get().navigate(get().currentPath);
  },

  selectFile: async (file) => {
    const { sessionId, clusterId, currentPath } = get();
    if (!sessionId) return;
    const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    set({ selectedFile: file, fileContent: null, fileIsBinary: false, loading: true });
    try {
      const data = await api.get<{ content: string; binary: boolean }>(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}/read?path=${encodeURIComponent(filePath)}`,
      );
      set({ fileContent: data.content, fileIsBinary: data.binary, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to read file' });
    }
  },

  saveFile: async (path, content) => {
    const { sessionId, clusterId } = get();
    if (!sessionId) return;
    set({ loading: true, error: null });
    try {
      await api.put(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}/write?path=${encodeURIComponent(path)}`,
        content,
      );
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to save file' });
    }
  },

  createFolder: async (name) => {
    const { sessionId, clusterId, currentPath } = get();
    if (!sessionId) return;
    const dirPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    set({ loading: true, error: null });
    try {
      await api.post(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}/mkdir?path=${encodeURIComponent(dirPath)}`,
      );
      await get().refresh();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to create folder' });
    }
  },

  deleteItem: async (path, recursive) => {
    const { sessionId, clusterId } = get();
    if (!sessionId) return;
    set({ loading: true, error: null });
    try {
      await api.del(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}/rm?path=${encodeURIComponent(path)}&recursive=${recursive}`,
      );
      set({ selectedFile: null, fileContent: null, fileIsBinary: false });
      await get().refresh();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to delete' });
    }
  },

  renameItem: async (oldPath, newPath) => {
    const { sessionId, clusterId } = get();
    if (!sessionId) return;
    set({ loading: true, error: null });
    try {
      await api.post(
        `/api/clusters/${clusterId}/pvc-browser/sessions/${sessionId}/rename`,
        { old_path: oldPath, new_path: newPath },
      );
      await get().refresh();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to rename' });
    }
  },

  clearSelection: () => set({ selectedFile: null, fileContent: null, fileIsBinary: false }),

  reset: () => set(initialState),
}));
