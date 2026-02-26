import { create } from 'zustand';
import { api } from '@/lib/api';
import {
  compositeApps,
  compositeDatabases,
  compositeJobs,
  type App,
  type Database,
  type CompositeJob,
  type K8sDeployment,
  type K8sService,
  type K8sIngress,
  type K8sStatefulSet,
  type K8sPVC,
  type K8sCronJob,
  type K8sJob,
} from '@/lib/abstractions';

interface Cluster {
  id: string;
  name: string;
  status: string;
  api_server_url: string;
  connection_type?: string;
  agent_status?: string;
  node_count?: number;
  last_health: string;
}

interface DashboardStats {
  totalApps: number;
  healthyApps: number;
  totalDatabases: number;
  runningDatabases: number;
  totalJobs: number;
  activeJobs: number;
  totalClusters: number;
  healthyClusters: number;
}

interface ActivityItem {
  id: string;
  type: 'deploy' | 'scale' | 'error' | 'update' | 'delete' | 'create';
  message: string;
  resource: string;
  namespace: string;
  cluster: string;
  timestamp: string;
}

interface DashboardState {
  clusters: Cluster[];
  apps: App[];
  databases: Database[];
  jobs: CompositeJob[];
  stats: DashboardStats;
  recentActivity: ActivityItem[];
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  fetchClusters: () => Promise<void>;
  fetchClusterResources: (clusterId: string) => Promise<{ apps: App[]; databases: Database[]; jobs: CompositeJob[] }>;
}

const emptyStats: DashboardStats = {
  totalApps: 0,
  healthyApps: 0,
  totalDatabases: 0,
  runningDatabases: 0,
  totalJobs: 0,
  activeJobs: 0,
  totalClusters: 0,
  healthyClusters: 0,
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  clusters: [],
  apps: [],
  databases: [],
  jobs: [],
  stats: emptyStats,
  recentActivity: [],
  loading: false,
  error: null,

  fetchClusters: async () => {
    try {
      const data = await api.get<Cluster[]>('/api/clusters');
      set({ clusters: data });
    } catch {
      set({ clusters: [] });
    }
  },

  fetchClusterResources: async (clusterId: string) => {
    try {
      const [deployments, services, ingresses, statefulsets, pvcs, cronJobs, rawJobs] =
        await Promise.allSettled([
          api.get<{ items: K8sDeployment[] }>(`/api/clusters/${clusterId}/resources/apps/v1/deployments`),
          api.get<{ items: K8sService[] }>(`/api/clusters/${clusterId}/resources/_/v1/services`),
          api.get<{ items: K8sIngress[] }>(`/api/clusters/${clusterId}/resources/networking.k8s.io/v1/ingresses`),
          api.get<{ items: K8sStatefulSet[] }>(`/api/clusters/${clusterId}/resources/apps/v1/statefulsets`),
          api.get<{ items: K8sPVC[] }>(`/api/clusters/${clusterId}/resources/_/v1/persistentvolumeclaims`),
          api.get<{ items: K8sCronJob[] }>(`/api/clusters/${clusterId}/resources/batch/v1/cronjobs`),
          api.get<{ items: K8sJob[] }>(`/api/clusters/${clusterId}/resources/batch/v1/jobs`),
        ]);

      const deps = deployments.status === 'fulfilled' ? deployments.value.items ?? [] : [];
      const svcs = services.status === 'fulfilled' ? services.value.items ?? [] : [];
      const ings = ingresses.status === 'fulfilled' ? ingresses.value.items ?? [] : [];
      const stss = statefulsets.status === 'fulfilled' ? statefulsets.value.items ?? [] : [];
      const pvcList = pvcs.status === 'fulfilled' ? pvcs.value.items ?? [] : [];
      const cjs = cronJobs.status === 'fulfilled' ? cronJobs.value.items ?? [] : [];
      const jbs = rawJobs.status === 'fulfilled' ? rawJobs.value.items ?? [] : [];

      const apps = compositeApps(deps, svcs, ings);
      const databases = compositeDatabases(stss, pvcList, svcs);
      const jobs = compositeJobs(cjs, jbs);

      return { apps, databases, jobs };
    } catch {
      return { apps: [], databases: [], jobs: [] };
    }
  },

  fetchAll: async () => {
    set({ loading: true, error: null });

    try {
      // Fetch clusters first
      await get().fetchClusters();
      const { clusters } = get();

      // Fetch resources from all clusters in parallel
      let allApps: App[] = [];
      let allDatabases: Database[] = [];
      let allJobs: CompositeJob[] = [];

      const results = await Promise.allSettled(
        clusters
          .filter((c) => c.status === 'connected' || c.status === 'healthy')
          .map((c) => get().fetchClusterResources(c.id))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allApps = allApps.concat(result.value.apps);
          allDatabases = allDatabases.concat(result.value.databases);
          allJobs = allJobs.concat(result.value.jobs);
        }
      }

      const stats: DashboardStats = {
        totalApps: allApps.length,
        healthyApps: allApps.filter((a) => a.status === 'healthy').length,
        totalDatabases: allDatabases.length,
        runningDatabases: allDatabases.filter((d) => d.status === 'running').length,
        totalJobs: allJobs.length,
        activeJobs: allJobs.filter((j) => j.status === 'active').length,
        totalClusters: clusters.length,
        healthyClusters: clusters.filter(
          (c) => c.status === 'connected' || c.status === 'healthy'
        ).length,
      };

      set({
        apps: allApps,
        databases: allDatabases,
        jobs: allJobs,
        stats,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load dashboard data',
      });
    }
  },
}));
