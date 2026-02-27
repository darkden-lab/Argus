import {
  compositeApps,
  compositeDatabases,
  compositeJobs,
  formatAge,
  truncateImage,
  getStatusColor,
  getStatusDot,
  type K8sDeployment,
  type K8sService,
  type K8sIngress,
  type K8sHTTPRoute,
  type K8sStatefulSet,
  type K8sPVC,
  type K8sCronJob,
  type K8sJob,
} from '@/lib/abstractions';

// ---------- Helper factories ----------

function makeDeployment(overrides: Partial<K8sDeployment> = {}): K8sDeployment {
  return {
    metadata: {
      name: 'web-app',
      namespace: 'default',
      uid: 'dep-uid-1',
      creationTimestamp: '2025-01-01T00:00:00Z',
      labels: { app: 'web-app' },
    },
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: 'web-app' } },
      template: {
        spec: {
          containers: [
            {
              name: 'web',
              image: 'registry.io/org/web-app:v1.0',
              ports: [{ containerPort: 8080, protocol: 'TCP' }],
            },
          ],
        },
      },
    },
    status: {
      replicas: 3,
      readyReplicas: 3,
      availableReplicas: 3,
      updatedReplicas: 3,
    },
    ...overrides,
  };
}

function makeService(overrides: Partial<K8sService> = {}): K8sService {
  return {
    metadata: {
      name: 'web-app-svc',
      namespace: 'default',
      uid: 'svc-uid-1',
    },
    spec: {
      selector: { app: 'web-app' },
      ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
      type: 'ClusterIP',
    },
    ...overrides,
  };
}

function makeIngress(overrides: Partial<K8sIngress> = {}): K8sIngress {
  return {
    metadata: {
      name: 'web-app-ingress',
      namespace: 'default',
      uid: 'ing-uid-1',
    },
    spec: {
      rules: [
        {
          host: 'web-app.example.com',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'web-app-svc', port: { number: 80 } },
                },
              },
            ],
          },
        },
      ],
      tls: [{ hosts: ['web-app.example.com'], secretName: 'tls-secret' }],
    },
    ...overrides,
  };
}

function makeStatefulSet(overrides: Partial<K8sStatefulSet> = {}): K8sStatefulSet {
  return {
    metadata: {
      name: 'postgres-db',
      namespace: 'default',
      uid: 'sts-uid-1',
      creationTimestamp: '2025-01-01T00:00:00Z',
      labels: { app: 'postgres-db' },
    },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: 'postgres-db' } },
      template: {
        spec: {
          containers: [
            {
              name: 'postgres',
              image: 'postgres:16',
              ports: [{ containerPort: 5432 }],
            },
          ],
        },
      },
    },
    status: {
      replicas: 2,
      readyReplicas: 2,
      currentReplicas: 2,
    },
    ...overrides,
  };
}

function makePVC(overrides: Partial<K8sPVC> = {}): K8sPVC {
  return {
    metadata: {
      name: 'data-postgres-db-0',
      namespace: 'default',
      uid: 'pvc-uid-1',
      labels: {},
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '10Gi' } },
    },
    status: {
      phase: 'Bound',
      capacity: { storage: '10Gi' },
    },
    ...overrides,
  };
}

function makeCronJob(overrides: Partial<K8sCronJob> = {}): K8sCronJob {
  return {
    metadata: {
      name: 'backup-cron',
      namespace: 'default',
      uid: 'cj-uid-1',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
    spec: {
      schedule: '0 2 * * *',
      jobTemplate: {
        spec: {
          template: {
            spec: {
              containers: [
                { name: 'backup', image: 'backup-tool:latest', command: ['/backup.sh'] },
              ],
            },
          },
        },
      },
      suspend: false,
    },
    status: {
      lastScheduleTime: '2025-06-15T02:00:00Z',
      active: [],
    },
    ...overrides,
  };
}

function makeJob(overrides: Partial<K8sJob> = {}): K8sJob {
  return {
    metadata: {
      name: 'backup-cron-12345',
      namespace: 'default',
      uid: 'job-uid-1',
      creationTimestamp: '2025-06-15T02:00:00Z',
      ownerReferences: [{ name: 'backup-cron', kind: 'CronJob', uid: 'cj-uid-1' }],
    },
    spec: {
      template: {
        spec: {
          containers: [
            { name: 'backup', image: 'backup-tool:latest', command: ['/backup.sh'] },
          ],
        },
      },
      backoffLimit: 3,
      completions: 1,
    },
    status: {
      startTime: '2025-06-15T02:00:00Z',
      completionTime: '2025-06-15T02:05:00Z',
      succeeded: 1,
      failed: 0,
    },
    ...overrides,
  };
}

function makeHTTPRoute(overrides: Partial<K8sHTTPRoute> = {}): K8sHTTPRoute {
  return {
    metadata: {
      name: 'web-app-route',
      namespace: 'default',
      uid: 'hr-uid-1',
    },
    spec: {
      hostnames: ['web-app.example.com'],
      parentRefs: [{ name: 'main-gateway', namespace: 'default' }],
      rules: [
        {
          matches: [{ path: { type: 'PathPrefix', value: '/' } }],
          backendRefs: [{ name: 'web-app-svc', port: 80 }],
        },
      ],
    },
    ...overrides,
  };
}

// ---------- Tests ----------

describe('compositeApps', () => {
  it('matches deployments with services by label selector', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const apps = compositeApps([dep], [svc], []);

    expect(apps).toHaveLength(1);
    expect(apps[0].name).toBe('web-app');
    expect(apps[0].services).toHaveLength(1);
    expect(apps[0].services[0].metadata.name).toBe('web-app-svc');
  });

  it('does not match services in a different namespace', () => {
    const dep = makeDeployment();
    const svc = makeService({
      metadata: { name: 'web-app-svc', namespace: 'other', uid: 'svc-uid-2' },
    });
    const apps = compositeApps([dep], [svc], []);

    expect(apps).toHaveLength(1);
    expect(apps[0].services).toHaveLength(0);
  });

  it('matches ingresses via service name references', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const ing = makeIngress();
    const apps = compositeApps([dep], [svc], [ing]);

    expect(apps[0].ingresses).toHaveLength(1);
    expect(apps[0].hosts).toContain('web-app.example.com');
    expect(apps[0].hasTLS).toBe(true);
  });

  it('does not match ingresses when no matching service', () => {
    const dep = makeDeployment();
    // Service with non-matching selector
    const svc = makeService({
      spec: {
        selector: { app: 'other-app' },
        ports: [{ port: 80 }],
        type: 'ClusterIP',
      },
    });
    const ing = makeIngress();
    const apps = compositeApps([dep], [svc], [ing]);

    expect(apps[0].ingresses).toHaveLength(0);
    expect(apps[0].hosts).toHaveLength(0);
  });

  it('extracts endpoints from LoadBalancer services', () => {
    const dep = makeDeployment();
    const svc = makeService({
      metadata: { name: 'web-app-svc', namespace: 'default', uid: 'svc-uid-1' },
      spec: {
        selector: { app: 'web-app' },
        ports: [{ port: 80 }],
        type: 'LoadBalancer',
      },
      status: {
        loadBalancer: { ingress: [{ ip: '10.0.0.1' }] },
      },
    });
    const apps = compositeApps([dep], [svc], []);

    expect(apps[0].endpoints).toContain('10.0.0.1');
    expect(apps[0].serviceType).toBe('LoadBalancer');
  });

  it('extracts container image and ports', () => {
    const dep = makeDeployment();
    const apps = compositeApps([dep], [], []);

    expect(apps[0].image).toBe('registry.io/org/web-app:v1.0');
    expect(apps[0].ports).toEqual([{ port: 8080, protocol: 'TCP' }]);
  });

  it('computes replicas correctly', () => {
    const dep = makeDeployment();
    const apps = compositeApps([dep], [], []);

    expect(apps[0].replicas).toEqual({ ready: 3, desired: 3 });
  });

  it('handles empty inputs', () => {
    expect(compositeApps([], [], [])).toEqual([]);
  });

  it('matches httproutes via backendRefs service name', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const hr = makeHTTPRoute();
    const apps = compositeApps([dep], [svc], [], [hr]);

    expect(apps[0].httproutes).toHaveLength(1);
    expect(apps[0].httproutes[0].metadata.name).toBe('web-app-route');
  });

  it('does not match httproutes in different namespace', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const hr = makeHTTPRoute({
      metadata: { name: 'web-app-route', namespace: 'other', uid: 'hr-uid-2' },
    });
    const apps = compositeApps([dep], [svc], [], [hr]);

    expect(apps[0].httproutes).toHaveLength(0);
  });

  it('merges hosts from both ingress and httproute', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const ing = makeIngress();
    const hr = makeHTTPRoute({
      spec: {
        hostnames: ['api.example.com'],
        parentRefs: [{ name: 'main-gateway' }],
        rules: [
          {
            backendRefs: [{ name: 'web-app-svc', port: 80 }],
          },
        ],
      },
    });
    const apps = compositeApps([dep], [svc], [ing], [hr]);

    expect(apps[0].hosts).toContain('web-app.example.com');
    expect(apps[0].hosts).toContain('api.example.com');
    expect(apps[0].hosts).toHaveLength(2);
  });

  it('backward compatible with 3-arg call', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const ing = makeIngress();
    const apps = compositeApps([dep], [svc], [ing]);

    expect(apps).toHaveLength(1);
    expect(apps[0].httproutes).toHaveLength(0);
    expect(apps[0].hosts).toContain('web-app.example.com');
  });

  it('handles httproutes with empty hostnames', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const hr = makeHTTPRoute({
      spec: {
        hostnames: [],
        parentRefs: [{ name: 'main-gateway' }],
        rules: [
          {
            backendRefs: [{ name: 'web-app-svc', port: 80 }],
          },
        ],
      },
    });
    const apps = compositeApps([dep], [svc], [], [hr]);

    expect(apps[0].httproutes).toHaveLength(1);
    expect(apps[0].hostSources.filter((hs) => hs.source === 'httproute')).toHaveLength(0);
  });

  it('populates hostSources with correct source type', () => {
    const dep = makeDeployment();
    const svc = makeService();
    const ing = makeIngress();
    const hr = makeHTTPRoute();
    const apps = compositeApps([dep], [svc], [ing], [hr]);

    const ingressSources = apps[0].hostSources.filter((hs) => hs.source === 'ingress');
    const httprouteSources = apps[0].hostSources.filter((hs) => hs.source === 'httproute');

    expect(ingressSources).toHaveLength(1);
    expect(ingressSources[0].hostname).toBe('web-app.example.com');
    expect(ingressSources[0].resourceName).toBe('web-app-ingress');

    expect(httprouteSources).toHaveLength(1);
    expect(httprouteSources[0].hostname).toBe('web-app.example.com');
    expect(httprouteSources[0].resourceName).toBe('web-app-route');
  });
});

describe('compositeDatabases', () => {
  it('includes StatefulSets with DB-related images', () => {
    const sts = makeStatefulSet();
    const dbs = compositeDatabases([sts], [], []);

    expect(dbs).toHaveLength(1);
    expect(dbs[0].name).toBe('postgres-db');
    expect(dbs[0].engine).toBe('postgresql');
  });

  it('filters out non-database StatefulSets', () => {
    const sts = makeStatefulSet({
      metadata: {
        name: 'zookeeper',
        namespace: 'default',
        uid: 'sts-uid-2',
        labels: {},
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'zookeeper' } },
        template: {
          spec: {
            containers: [
              { name: 'zk', image: 'zookeeper:3.8', ports: [{ containerPort: 2181 }] },
            ],
          },
        },
      },
    });
    const dbs = compositeDatabases([sts], [], []);

    expect(dbs).toHaveLength(0);
  });

  it('detects mariadb engine from image', () => {
    const sts = makeStatefulSet({
      metadata: {
        name: 'mariadb-primary',
        namespace: 'default',
        uid: 'sts-uid-3',
        labels: {},
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'mariadb' } },
        template: {
          spec: {
            containers: [
              { name: 'mariadb', image: 'mariadb:10.11', ports: [{ containerPort: 3306 }] },
            ],
          },
        },
      },
      status: { replicas: 1, readyReplicas: 1 },
    });
    const dbs = compositeDatabases([sts], [], []);

    expect(dbs).toHaveLength(1);
    expect(dbs[0].engine).toBe('mariadb');
    expect(dbs[0].isMariaDB).toBe(true);
  });

  it('detects redis engine from image', () => {
    const sts = makeStatefulSet({
      metadata: {
        name: 'redis-cache',
        namespace: 'default',
        uid: 'sts-uid-4',
        labels: {},
      },
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'redis' } },
        template: {
          spec: {
            containers: [
              { name: 'redis', image: 'redis:7-alpine', ports: [{ containerPort: 6379 }] },
            ],
          },
        },
      },
      status: { replicas: 3, readyReplicas: 3 },
    });
    const dbs = compositeDatabases([sts], [], []);

    expect(dbs).toHaveLength(1);
    expect(dbs[0].engine).toBe('redis');
  });

  it('detects CNPG managed databases', () => {
    const sts = makeStatefulSet({
      metadata: {
        name: 'cnpg-cluster-1',
        namespace: 'default',
        uid: 'sts-uid-5',
        labels: {
          'cnpg.io/cluster': 'cnpg-cluster',
          'app.kubernetes.io/managed-by': 'cloudnative-pg',
        },
      },
      spec: {
        replicas: 2,
        selector: { matchLabels: { app: 'cnpg' } },
        template: {
          spec: {
            containers: [
              { name: 'postgres', image: 'ghcr.io/cloudnative-pg/postgresql:16', ports: [{ containerPort: 5432 }] },
            ],
          },
        },
      },
      status: { replicas: 2, readyReplicas: 2 },
    });
    const dbs = compositeDatabases([sts], [], []);

    expect(dbs).toHaveLength(1);
    expect(dbs[0].isCNPG).toBe(true);
  });

  it('matches PVCs by StatefulSet name', () => {
    const sts = makeStatefulSet();
    const pvc = makePVC();
    const dbs = compositeDatabases([sts], [pvc], []);

    expect(dbs[0].pvcs).toHaveLength(1);
    expect(dbs[0].storage).toBe('10Gi');
  });

  it('matches services by label selector', () => {
    const sts = makeStatefulSet();
    const svc = makeService({
      metadata: { name: 'postgres-svc', namespace: 'default', uid: 'svc-uid-pg' },
      spec: {
        selector: { app: 'postgres-db' },
        ports: [{ port: 5432 }],
        type: 'ClusterIP',
      },
    });
    const dbs = compositeDatabases([sts], [], [svc]);

    expect(dbs[0].services).toHaveLength(1);
  });

  it('computes replicas', () => {
    const sts = makeStatefulSet();
    const dbs = compositeDatabases([sts], [], []);

    expect(dbs[0].replicas).toEqual({ ready: 2, desired: 2 });
  });

  it('handles empty inputs', () => {
    expect(compositeDatabases([], [], [])).toEqual([]);
  });
});

describe('compositeJobs', () => {
  it('groups jobs by CronJob owner', () => {
    const cj = makeCronJob();
    const job = makeJob();
    const result = compositeJobs([cj], [job]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('backup-cron');
    expect(result[0].jobs).toHaveLength(1);
    expect(result[0].schedule).toBe('0 2 * * *');
  });

  it('includes standalone jobs without CronJob owner', () => {
    const orphanJob = makeJob({
      metadata: {
        name: 'migration-job',
        namespace: 'default',
        uid: 'job-uid-orphan',
        creationTimestamp: '2025-06-15T10:00:00Z',
        ownerReferences: [],
      },
      status: { succeeded: 1, failed: 0 },
    });
    const result = compositeJobs([], [orphanJob]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('migration-job');
    expect(result[0].schedule).toBeUndefined();
    expect(result[0].cronJob).toBeUndefined();
    expect(result[0].status).toBe('completed');
  });

  it('reports status as suspended when cronJob is suspended', () => {
    const cj = makeCronJob({
      spec: {
        schedule: '0 2 * * *',
        suspend: true,
        jobTemplate: {
          spec: {
            template: {
              spec: {
                containers: [{ name: 'backup', image: 'backup:latest' }],
              },
            },
          },
        },
      },
    });
    const result = compositeJobs([cj], []);

    expect(result[0].status).toBe('suspended');
  });

  it('reports status as active when cronJob has active jobs', () => {
    const cj = makeCronJob({
      status: {
        active: [{ name: 'running-job' }],
        lastScheduleTime: '2025-06-15T02:00:00Z',
      },
    });
    const result = compositeJobs([cj], []);

    expect(result[0].status).toBe('active');
  });

  it('reports status as completed when last job succeeded', () => {
    const cj = makeCronJob();
    const job = makeJob();
    const result = compositeJobs([cj], [job]);

    expect(result[0].status).toBe('completed');
  });

  it('reports status as failed when last job failed', () => {
    const cj = makeCronJob();
    const job = makeJob({
      status: { succeeded: 0, failed: 1 },
    });
    const result = compositeJobs([cj], [job]);

    expect(result[0].status).toBe('failed');
  });

  it('reports status as scheduled for cronJob with no jobs', () => {
    const cj = makeCronJob({
      status: { active: [], lastScheduleTime: undefined },
    });
    const result = compositeJobs([cj], []);

    expect(result[0].status).toBe('scheduled');
  });

  it('computes completions from related jobs', () => {
    const cj = makeCronJob();
    const job1 = makeJob({ metadata: { ...makeJob().metadata, uid: 'j1', name: 'backup-cron-111' } });
    const job2 = makeJob({
      metadata: {
        name: 'backup-cron-222',
        namespace: 'default',
        uid: 'j2',
        creationTimestamp: '2025-06-14T02:00:00Z',
        ownerReferences: [{ name: 'backup-cron', kind: 'CronJob', uid: 'cj-uid-1' }],
      },
      status: { succeeded: 1, failed: 0 },
    });
    const result = compositeJobs([cj], [job1, job2]);

    expect(result[0].completions.succeeded).toBe(2);
    expect(result[0].completions.total).toBe(2);
  });

  it('handles empty inputs', () => {
    expect(compositeJobs([], [])).toEqual([]);
  });

  it('returns both cronJob-based and orphan jobs together', () => {
    const cj = makeCronJob();
    const cronChild = makeJob();
    const orphan = makeJob({
      metadata: {
        name: 'standalone-migrate',
        namespace: 'default',
        uid: 'job-uid-solo',
        creationTimestamp: '2025-06-10T00:00:00Z',
      },
      status: { succeeded: 1, failed: 0 },
    });
    const result = compositeJobs([cj], [cronChild, orphan]);

    expect(result).toHaveLength(2);
    const names = result.map((j) => j.name);
    expect(names).toContain('backup-cron');
    expect(names).toContain('standalone-migrate');
  });
});

describe('formatAge', () => {
  it('returns "-" for undefined input', () => {
    expect(formatAge(undefined)).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(formatAge('')).toBe('-');
  });

  it('returns minutes for recent timestamps', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatAge(tenMinutesAgo)).toBe('10m');
  });

  it('returns hours for timestamps within a day', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(formatAge(fiveHoursAgo)).toBe('5h');
  });

  it('returns days for timestamps within a month', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatAge(tenDaysAgo)).toBe('10d');
  });

  it('returns months for old timestamps', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatAge(ninetyDaysAgo)).toBe('3mo');
  });
});

describe('truncateImage', () => {
  it('extracts name:tag from full registry path', () => {
    expect(truncateImage('registry.io/org/web-app:v1.0')).toBe('web-app:v1.0');
  });

  it('returns the image as-is when no slashes', () => {
    expect(truncateImage('nginx:latest')).toBe('nginx:latest');
  });

  it('handles deeply nested registry paths', () => {
    expect(truncateImage('ghcr.io/cloudnative-pg/postgresql:16')).toBe('postgresql:16');
  });

  it('handles images without tags', () => {
    expect(truncateImage('registry.io/org/myapp')).toBe('myapp');
  });

  it('returns empty string for empty input', () => {
    expect(truncateImage('')).toBe('');
  });
});

describe('getStatusColor', () => {
  it('returns green for healthy statuses', () => {
    expect(getStatusColor('healthy')).toBe('text-green-500');
    expect(getStatusColor('running')).toBe('text-green-500');
    expect(getStatusColor('completed')).toBe('text-green-500');
  });

  it('returns yellow for warning statuses', () => {
    expect(getStatusColor('degraded')).toBe('text-yellow-500');
    expect(getStatusColor('creating')).toBe('text-yellow-500');
    expect(getStatusColor('scaling')).toBe('text-yellow-500');
    expect(getStatusColor('deploying')).toBe('text-yellow-500');
    expect(getStatusColor('active')).toBe('text-yellow-500');
    expect(getStatusColor('scheduled')).toBe('text-yellow-500');
  });

  it('returns red for error statuses', () => {
    expect(getStatusColor('failing')).toBe('text-red-500');
    expect(getStatusColor('failed')).toBe('text-red-500');
  });

  it('returns muted for suspended', () => {
    expect(getStatusColor('suspended')).toBe('text-muted-foreground');
  });

  it('returns muted for unknown', () => {
    expect(getStatusColor('unknown')).toBe('text-muted-foreground');
  });
});

describe('getStatusDot', () => {
  it('returns "healthy" for healthy/running/completed', () => {
    expect(getStatusDot('healthy')).toBe('healthy');
    expect(getStatusDot('running')).toBe('healthy');
    expect(getStatusDot('completed')).toBe('healthy');
  });

  it('returns "warning" for warning-level statuses', () => {
    expect(getStatusDot('degraded')).toBe('warning');
    expect(getStatusDot('creating')).toBe('warning');
    expect(getStatusDot('deploying')).toBe('warning');
    expect(getStatusDot('active')).toBe('warning');
    expect(getStatusDot('scheduled')).toBe('warning');
  });

  it('returns "error" for error-level statuses', () => {
    expect(getStatusDot('failing')).toBe('error');
    expect(getStatusDot('failed')).toBe('error');
  });

  it('returns "info" for suspended', () => {
    expect(getStatusDot('suspended')).toBe('info');
  });

  it('returns "unknown" for unknown', () => {
    expect(getStatusDot('unknown')).toBe('unknown');
  });
});

describe('deriveAppStatus (tested via compositeApps)', () => {
  it('returns "healthy" when all replicas are ready', () => {
    const dep = makeDeployment({
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'x' } },
        template: {
          spec: { containers: [{ name: 'x', image: 'x:1', ports: [] }] },
        },
      },
      status: { replicas: 3, readyReplicas: 3, updatedReplicas: 3 },
    });
    const apps = compositeApps([dep], [], []);
    expect(apps[0].status).toBe('healthy');
  });

  it('returns "deploying" when updatedReplicas < desired', () => {
    const dep = makeDeployment({
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'x' } },
        template: {
          spec: { containers: [{ name: 'x', image: 'x:1', ports: [] }] },
        },
      },
      status: { replicas: 3, readyReplicas: 2, updatedReplicas: 1 },
    });
    const apps = compositeApps([dep], [], []);
    expect(apps[0].status).toBe('deploying');
  });

  it('returns "degraded" when some replicas are ready but not all', () => {
    const dep = makeDeployment({
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'x' } },
        template: {
          spec: { containers: [{ name: 'x', image: 'x:1', ports: [] }] },
        },
      },
      status: { replicas: 3, readyReplicas: 2, updatedReplicas: 3 },
    });
    const apps = compositeApps([dep], [], []);
    expect(apps[0].status).toBe('degraded');
  });

  it('returns "failing" when no replicas are ready', () => {
    const dep = makeDeployment({
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'x' } },
        template: {
          spec: { containers: [{ name: 'x', image: 'x:1', ports: [] }] },
        },
      },
      status: { replicas: 3, readyReplicas: 0, updatedReplicas: 3 },
    });
    const apps = compositeApps([dep], [], []);
    expect(apps[0].status).toBe('failing');
  });

  it('returns "unknown" when desired replicas is 0', () => {
    const dep = makeDeployment({
      spec: {
        replicas: 0,
        selector: { matchLabels: { app: 'x' } },
        template: {
          spec: { containers: [{ name: 'x', image: 'x:1', ports: [] }] },
        },
      },
      status: { replicas: 0, readyReplicas: 0, updatedReplicas: 0 },
    });
    const apps = compositeApps([dep], [], []);
    expect(apps[0].status).toBe('unknown');
  });
});

describe('deriveDatabaseStatus (tested via compositeDatabases)', () => {
  it('returns "running" when all replicas are ready', () => {
    const sts = makeStatefulSet({
      spec: {
        ...makeStatefulSet().spec,
        replicas: 2,
      },
      status: { replicas: 2, readyReplicas: 2 },
    });
    const dbs = compositeDatabases([sts], [], []);
    expect(dbs[0].status).toBe('running');
  });

  it('returns "creating" when some but not all replicas are ready', () => {
    const sts = makeStatefulSet({
      spec: {
        ...makeStatefulSet().spec,
        replicas: 3,
      },
      status: { replicas: 3, readyReplicas: 1 },
    });
    const dbs = compositeDatabases([sts], [], []);
    expect(dbs[0].status).toBe('creating');
  });

  it('returns "failing" when no replicas are ready', () => {
    const sts = makeStatefulSet({
      spec: {
        ...makeStatefulSet().spec,
        replicas: 2,
      },
      status: { replicas: 2, readyReplicas: 0 },
    });
    const dbs = compositeDatabases([sts], [], []);
    expect(dbs[0].status).toBe('failing');
  });

  it('returns "unknown" when desired replicas is 0', () => {
    const sts = makeStatefulSet({
      spec: {
        ...makeStatefulSet().spec,
        replicas: 0,
      },
      status: { replicas: 0, readyReplicas: 0 },
    });
    const dbs = compositeDatabases([sts], [], []);
    expect(dbs[0].status).toBe('unknown');
  });
});
