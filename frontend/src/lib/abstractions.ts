/**
 * Abstraction layer that composes low-level K8s resources into user-friendly
 * high-level concepts: Apps, Databases, and Jobs.
 *
 * All composition happens client-side — no backend changes needed.
 */

// ---------- Raw K8s types (subset needed for composition) ----------

export interface K8sMeta {
  name: string;
  namespace?: string;
  uid?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: Array<{ name: string; kind: string; uid: string }>;
}

export interface K8sDeployment {
  metadata: K8sMeta;
  spec?: {
    replicas?: number;
    selector?: { matchLabels?: Record<string, string> };
    template?: {
      spec?: {
        containers?: Array<{
          name: string;
          image: string;
          ports?: Array<{ containerPort: number; protocol?: string }>;
          env?: Array<{ name: string; value?: string }>;
          resources?: {
            requests?: { cpu?: string; memory?: string };
            limits?: { cpu?: string; memory?: string };
          };
        }>;
      };
    };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    updatedReplicas?: number;
    conditions?: Array<{ type: string; status: string; message?: string }>;
  };
}

export interface K8sService {
  metadata: K8sMeta;
  spec?: {
    selector?: Record<string, string>;
    ports?: Array<{
      port: number;
      targetPort?: number | string;
      protocol?: string;
      name?: string;
    }>;
    type?: string;
    clusterIP?: string;
    externalIPs?: string[];
    loadBalancerIP?: string;
  };
  status?: {
    loadBalancer?: {
      ingress?: Array<{ ip?: string; hostname?: string }>;
    };
  };
}

export interface K8sIngress {
  metadata: K8sMeta;
  spec?: {
    rules?: Array<{
      host?: string;
      http?: {
        paths?: Array<{
          path?: string;
          pathType?: string;
          backend?: {
            service?: { name: string; port?: { number?: number; name?: string } };
          };
        }>;
      };
    }>;
    tls?: Array<{ hosts?: string[]; secretName?: string }>;
  };
}

export interface K8sHTTPRoute {
  metadata: K8sMeta;
  spec?: {
    hostnames?: string[];
    parentRefs?: Array<{ name: string; namespace?: string; sectionName?: string }>;
    rules?: Array<{
      matches?: Array<{
        path?: { type?: string; value?: string };
        headers?: Array<{ name: string; value: string }>;
        method?: string;
      }>;
      backendRefs?: Array<{ name: string; namespace?: string; port?: number; weight?: number }>;
    }>;
  };
}

export interface HostSource {
  hostname: string;
  source: "ingress" | "httproute";
  resourceName: string;
}

export interface K8sStatefulSet {
  metadata: K8sMeta;
  spec?: {
    replicas?: number;
    selector?: { matchLabels?: Record<string, string> };
    template?: {
      spec?: {
        containers?: Array<{
          name: string;
          image: string;
          ports?: Array<{ containerPort: number }>;
        }>;
      };
    };
    volumeClaimTemplates?: Array<{
      metadata: K8sMeta;
      spec?: {
        accessModes?: string[];
        resources?: { requests?: { storage?: string } };
      };
    }>;
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    currentReplicas?: number;
  };
}

export interface K8sPVC {
  metadata: K8sMeta;
  spec?: {
    accessModes?: string[];
    resources?: { requests?: { storage?: string } };
    storageClassName?: string;
  };
  status?: {
    phase?: string;
    capacity?: { storage?: string };
  };
}

export interface K8sCronJob {
  metadata: K8sMeta;
  spec?: {
    schedule?: string;
    jobTemplate?: {
      spec?: {
        template?: {
          spec?: {
            containers?: Array<{ name: string; image: string; command?: string[] }>;
          };
        };
      };
    };
    suspend?: boolean;
  };
  status?: {
    lastScheduleTime?: string;
    active?: Array<{ name: string }>;
  };
}

export interface K8sJob {
  metadata: K8sMeta;
  spec?: {
    template?: {
      spec?: {
        containers?: Array<{ name: string; image: string; command?: string[] }>;
      };
    };
    backoffLimit?: number;
    completions?: number;
    parallelism?: number;
  };
  status?: {
    startTime?: string;
    completionTime?: string;
    succeeded?: number;
    failed?: number;
    active?: number;
    conditions?: Array<{ type: string; status: string }>;
  };
}

// ---------- High-level abstraction types ----------

export type AppStatus = "healthy" | "degraded" | "failing" | "scaling" | "deploying" | "unknown";
export type DatabaseStatus = "running" | "creating" | "failing" | "unknown";
export type JobStatus = "active" | "completed" | "failed" | "suspended" | "scheduled";

export interface App {
  id: string;
  name: string;
  namespace: string;
  status: AppStatus;
  image: string;
  replicas: { ready: number; desired: number };
  ports: Array<{ port: number; protocol: string }>;
  endpoints: string[];
  hosts: string[];
  hostSources: HostSource[];
  hasTLS: boolean;
  serviceType: string;
  createdAt: string;
  // References to underlying K8s resources
  deployment: K8sDeployment;
  services: K8sService[];
  ingresses: K8sIngress[];
  httproutes: K8sHTTPRoute[];
}

export interface Database {
  id: string;
  name: string;
  namespace: string;
  status: DatabaseStatus;
  engine: string; // "postgresql" | "mariadb" | "mysql" | "redis" | "unknown"
  image: string;
  replicas: { ready: number; desired: number };
  storage: string;
  createdAt: string;
  // References
  statefulSet?: K8sStatefulSet;
  pvcs: K8sPVC[];
  services: K8sService[];
  isCNPG?: boolean;
  isMariaDB?: boolean;
}

export interface CompositeJob {
  id: string;
  name: string;
  namespace: string;
  status: JobStatus;
  schedule?: string;
  lastRun?: string;
  nextRun?: string;
  image: string;
  completions: { succeeded: number; total: number };
  createdAt: string;
  // References
  cronJob?: K8sCronJob;
  jobs: K8sJob[];
}

// ---------- Composition functions ----------

function matchLabels(
  selector: Record<string, string> | undefined,
  labels: Record<string, string> | undefined
): boolean {
  if (!selector || !labels) return false;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}

function deriveAppStatus(deployment: K8sDeployment): AppStatus {
  const desired = deployment.spec?.replicas ?? 0;
  const ready = deployment.status?.readyReplicas ?? 0;
  const updated = deployment.status?.updatedReplicas ?? 0;

  if (desired === 0) return "unknown";
  if (updated < desired) return "deploying";
  if (ready === desired) return "healthy";
  if (ready > 0 && ready < desired) return "degraded";
  return "failing";
}

function deriveDatabaseEngine(image: string, labels?: Record<string, string>): string {
  const img = image.toLowerCase();
  if (img.includes("postgres") || img.includes("pgvector") || img.includes("cnpg")) return "postgresql";
  if (img.includes("mariadb")) return "mariadb";
  if (img.includes("mysql")) return "mysql";
  if (img.includes("redis")) return "redis";
  if (img.includes("mongo")) return "mongodb";
  if (labels?.["app.kubernetes.io/name"]) {
    const name = labels["app.kubernetes.io/name"].toLowerCase();
    if (name.includes("postgres")) return "postgresql";
    if (name.includes("mariadb")) return "mariadb";
    if (name.includes("mysql")) return "mysql";
    if (name.includes("redis")) return "redis";
  }
  return "unknown";
}

const DB_KEYWORDS = ["postgres", "mysql", "mariadb", "redis", "mongo", "cassandra", "cockroach", "pgvector", "cnpg"];

function isLikelyDatabase(sts: K8sStatefulSet): boolean {
  const image = sts.spec?.template?.spec?.containers?.[0]?.image?.toLowerCase() ?? "";
  const name = sts.metadata.name.toLowerCase();
  const labels = sts.metadata.labels ?? {};
  const appName = (labels["app.kubernetes.io/name"] ?? "").toLowerCase();

  return DB_KEYWORDS.some(
    (kw) => image.includes(kw) || name.includes(kw) || appName.includes(kw)
  );
}

export function compositeApps(
  deployments: K8sDeployment[],
  services: K8sService[],
  ingresses: K8sIngress[],
  httproutes: K8sHTTPRoute[] = []
): App[] {
  return deployments.map((dep) => {
    const depLabels = dep.spec?.selector?.matchLabels;
    const ns = dep.metadata.namespace ?? "default";

    // Find matching services
    const matchedServices = services.filter(
      (svc) =>
        svc.metadata.namespace === ns &&
        matchLabels(svc.spec?.selector, dep.spec?.template?.spec?.containers?.[0] ? depLabels : undefined)
    );

    // Find matching ingresses (via service name references)
    const serviceNames = new Set(matchedServices.map((s) => s.metadata.name));
    const matchedIngresses = ingresses.filter((ing) => {
      if (ing.metadata.namespace !== ns) return false;
      return ing.spec?.rules?.some((rule) =>
        rule.http?.paths?.some(
          (path) => path.backend?.service?.name && serviceNames.has(path.backend.service.name)
        )
      );
    });

    // Find matching HTTPRoutes (via backendRefs service name references)
    const matchedHTTPRoutes = httproutes.filter((hr) => {
      if (hr.metadata.namespace !== ns) return false;
      return hr.spec?.rules?.some((rule) =>
        rule.backendRefs?.some(
          (ref) => serviceNames.has(ref.name) && (!ref.namespace || ref.namespace === ns)
        )
      );
    });

    // Extract endpoints
    const endpoints: string[] = [];
    for (const svc of matchedServices) {
      if (svc.spec?.type === "LoadBalancer") {
        const lbIngress = svc.status?.loadBalancer?.ingress;
        if (lbIngress?.length) {
          endpoints.push(lbIngress[0].ip || lbIngress[0].hostname || "");
        }
      }
      if (svc.spec?.externalIPs?.length) {
        endpoints.push(...svc.spec.externalIPs);
      }
    }

    // Extract hosts via HostSource
    const hostSources: HostSource[] = [];
    const hasTLS = matchedIngresses.some((ing) => (ing.spec?.tls?.length ?? 0) > 0);
    for (const ing of matchedIngresses) {
      for (const rule of ing.spec?.rules ?? []) {
        if (rule.host) {
          hostSources.push({
            hostname: rule.host,
            source: "ingress",
            resourceName: ing.metadata.name,
          });
        }
      }
    }
    for (const hr of matchedHTTPRoutes) {
      for (const hostname of hr.spec?.hostnames ?? []) {
        hostSources.push({
          hostname,
          source: "httproute",
          resourceName: hr.metadata.name,
        });
      }
    }
    const hosts = [...new Set(hostSources.map((hs) => hs.hostname))];

    const container = dep.spec?.template?.spec?.containers?.[0];

    return {
      id: dep.metadata.uid ?? dep.metadata.name,
      name: dep.metadata.name,
      namespace: ns,
      status: deriveAppStatus(dep),
      image: container?.image ?? "",
      replicas: {
        ready: dep.status?.readyReplicas ?? 0,
        desired: dep.spec?.replicas ?? 0,
      },
      ports: (container?.ports ?? []).map((p) => ({
        port: p.containerPort,
        protocol: p.protocol ?? "TCP",
      })),
      endpoints,
      hosts,
      hostSources,
      hasTLS,
      serviceType: matchedServices[0]?.spec?.type ?? "None",
      createdAt: dep.metadata.creationTimestamp ?? "",
      deployment: dep,
      services: matchedServices,
      ingresses: matchedIngresses,
      httproutes: matchedHTTPRoutes,
    };
  });
}

export function compositeDatabases(
  statefulsets: K8sStatefulSet[],
  pvcs: K8sPVC[],
  services: K8sService[]
): Database[] {
  return statefulsets.filter(isLikelyDatabase).map((sts) => {
    const ns = sts.metadata.namespace ?? "default";
    const container = sts.spec?.template?.spec?.containers?.[0];
    const image = container?.image ?? "";
    const labels = sts.metadata.labels ?? {};

    // Find matching PVCs
    const stsName = sts.metadata.name;
    const matchedPVCs = pvcs.filter(
      (pvc) =>
        pvc.metadata.namespace === ns &&
        (pvc.metadata.name.includes(stsName) ||
          pvc.metadata.labels?.["app.kubernetes.io/instance"] === stsName)
    );

    // Find matching services
    const selectorLabels = sts.spec?.selector?.matchLabels;
    const matchedServices = services.filter(
      (svc) =>
        svc.metadata.namespace === ns &&
        matchLabels(svc.spec?.selector, selectorLabels)
    );

    // Calculate total storage
    const storageVals = matchedPVCs
      .map((pvc) => pvc.status?.capacity?.storage || pvc.spec?.resources?.requests?.storage)
      .filter(Boolean);
    const totalStorage = storageVals.length > 0 ? storageVals.join(" + ") : "N/A";

    const isCNPG = labels["cnpg.io/cluster"] !== undefined || labels["app.kubernetes.io/managed-by"] === "cloudnative-pg";
    const isMariaDB = labels["app.kubernetes.io/managed-by"] === "mariadb-operator" || image.includes("mariadb");

    return {
      id: sts.metadata.uid ?? sts.metadata.name,
      name: sts.metadata.name,
      namespace: ns,
      status: deriveDatabaseStatus(sts),
      engine: deriveDatabaseEngine(image, labels),
      image,
      replicas: {
        ready: sts.status?.readyReplicas ?? 0,
        desired: sts.spec?.replicas ?? 0,
      },
      storage: totalStorage,
      createdAt: sts.metadata.creationTimestamp ?? "",
      statefulSet: sts,
      pvcs: matchedPVCs,
      services: matchedServices,
      isCNPG,
      isMariaDB,
    };
  });
}

function deriveDatabaseStatus(sts: K8sStatefulSet): DatabaseStatus {
  const desired = sts.spec?.replicas ?? 0;
  const ready = sts.status?.readyReplicas ?? 0;

  if (desired === 0) return "unknown";
  if (ready === desired) return "running";
  if (ready > 0 && ready < desired) return "creating";
  return "failing";
}

export function compositeJobs(
  cronJobs: K8sCronJob[],
  jobs: K8sJob[]
): CompositeJob[] {
  const result: CompositeJob[] = [];

  // Group jobs by their CronJob owner
  const jobsByCronJob = new Map<string, K8sJob[]>();
  const orphanJobs: K8sJob[] = [];

  for (const job of jobs) {
    const ownerRef = job.metadata.ownerReferences?.find((o) => o.kind === "CronJob");
    if (ownerRef) {
      const key = `${job.metadata.namespace ?? "default"}/${ownerRef.name}`;
      if (!jobsByCronJob.has(key)) jobsByCronJob.set(key, []);
      jobsByCronJob.get(key)!.push(job);
    } else {
      orphanJobs.push(job);
    }
  }

  // CronJob-based composite jobs
  for (const cj of cronJobs) {
    const ns = cj.metadata.namespace ?? "default";
    const key = `${ns}/${cj.metadata.name}`;
    const relatedJobs = jobsByCronJob.get(key) ?? [];
    const container = cj.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0];

    const lastJob = relatedJobs
      .sort((a, b) => {
        const ta = a.metadata.creationTimestamp ?? "";
        const tb = b.metadata.creationTimestamp ?? "";
        return tb.localeCompare(ta);
      })[0];

    let status: JobStatus = "scheduled";
    if (cj.spec?.suspend) status = "suspended";
    else if (cj.status?.active?.length) status = "active";
    else if (lastJob?.status?.succeeded) status = "completed";
    else if (lastJob?.status?.failed) status = "failed";

    result.push({
      id: cj.metadata.uid ?? cj.metadata.name,
      name: cj.metadata.name,
      namespace: ns,
      status,
      schedule: cj.spec?.schedule,
      lastRun: cj.status?.lastScheduleTime ?? lastJob?.status?.startTime,
      image: container?.image ?? "",
      completions: {
        succeeded: relatedJobs.reduce((sum, j) => sum + (j.status?.succeeded ?? 0), 0),
        total: relatedJobs.length,
      },
      createdAt: cj.metadata.creationTimestamp ?? "",
      cronJob: cj,
      jobs: relatedJobs,
    });
  }

  // Standalone jobs (not owned by a CronJob)
  for (const job of orphanJobs) {
    const container = job.spec?.template?.spec?.containers?.[0];
    let status: JobStatus = "active";
    if (job.status?.succeeded) status = "completed";
    else if (job.status?.failed) status = "failed";
    else if (job.status?.active) status = "active";

    result.push({
      id: job.metadata.uid ?? job.metadata.name,
      name: job.metadata.name,
      namespace: job.metadata.namespace ?? "default",
      status,
      image: container?.image ?? "",
      completions: {
        succeeded: job.status?.succeeded ?? 0,
        total: job.spec?.completions ?? 1,
      },
      createdAt: job.metadata.creationTimestamp ?? "",
      jobs: [job],
    });
  }

  return result;
}

// ---------- CNPG (CloudNativePG) conversion ----------

export interface CNPGCluster {
  metadata: K8sMeta;
  spec?: {
    instances?: number;
    postgresql?: { parameters?: Record<string, string> };
    bootstrap?: {
      initdb?: { database?: string; owner?: string };
    };
    storage?: {
      size?: string;
      storageClass?: string;
    };
    imageName?: string;
  };
  status?: {
    instances?: number;
    readyInstances?: number;
    phase?: string;
    currentPrimary?: string;
    conditions?: Array<{ type: string; status: string; message?: string }>;
  };
}

function deriveCNPGStatus(cluster: CNPGCluster): DatabaseStatus {
  const phase = cluster.status?.phase?.toLowerCase();
  if (phase === "cluster in healthy state" || phase === "healthy") return "running";
  if (phase === "setting up primary" || phase === "creating replica") return "creating";
  if (phase === "failing over" || phase === "upgrade failed") return "failing";
  const ready = cluster.status?.readyInstances ?? 0;
  const desired = cluster.spec?.instances ?? 0;
  if (desired > 0 && ready === desired) return "running";
  if (ready > 0 && ready < desired) return "creating";
  if (desired > 0 && ready === 0) return "failing";
  return "unknown";
}

export function cnpgToDatabases(clusters: CNPGCluster[]): Database[] {
  return clusters.map((cluster) => {
    const ns = cluster.metadata.namespace ?? "default";
    const image = cluster.spec?.imageName ?? "postgresql";

    return {
      id: cluster.metadata.uid ?? cluster.metadata.name,
      name: cluster.metadata.name,
      namespace: ns,
      status: deriveCNPGStatus(cluster),
      engine: "postgresql",
      image,
      replicas: {
        ready: cluster.status?.readyInstances ?? 0,
        desired: cluster.spec?.instances ?? 0,
      },
      storage: cluster.spec?.storage?.size ?? "N/A",
      createdAt: cluster.metadata.creationTimestamp ?? "",
      pvcs: [],
      services: [],
      isCNPG: true,
    };
  });
}

// ---------- Utility functions ----------

export function getStatusColor(status: AppStatus | DatabaseStatus | JobStatus): string {
  switch (status) {
    case "healthy":
    case "running":
    case "completed":
      return "text-green-500";
    case "degraded":
    case "creating":
    case "scaling":
    case "deploying":
    case "active":
    case "scheduled":
      return "text-yellow-500";
    case "failing":
    case "failed":
      return "text-red-500";
    case "suspended":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

export function getStatusDot(status: AppStatus | DatabaseStatus | JobStatus): "healthy" | "warning" | "error" | "info" | "unknown" {
  switch (status) {
    case "healthy":
    case "running":
    case "completed":
      return "healthy";
    case "degraded":
    case "creating":
    case "scaling":
    case "deploying":
    case "active":
    case "scheduled":
      return "warning";
    case "failing":
    case "failed":
      return "error";
    case "suspended":
      return "info";
    default:
      return "unknown";
  }
}

export function formatAge(timestamp: string | undefined): string {
  if (!timestamp) return "-";
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export function truncateImage(image: string): string {
  // "registry.io/org/name:tag" -> "name:tag"
  const parts = image.split("/");
  return parts[parts.length - 1] ?? image;
}
