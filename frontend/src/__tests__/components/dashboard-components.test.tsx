import React from 'react';
import { render, screen } from '../test-utils';
import { ClusterHealthCard, type ClusterInfo } from '@/components/dashboard/cluster-health-card';
import { ResourceSummary, type ResourceCounts } from '@/components/dashboard/resource-summary';
import { RecentEvents, type K8sEvent } from '@/components/dashboard/recent-events';

describe('ClusterHealthCard', () => {
  const clusters: ClusterInfo[] = [
    { id: '1', name: 'production', status: 'connected', apiServer: 'https://k8s-prod:6443', lastCheck: '10s ago' },
    { id: '2', name: 'staging', status: 'disconnected', apiServer: 'https://k8s-staging:6443', lastCheck: '5m ago' },
    { id: '3', name: 'dev', status: 'error', apiServer: 'https://k8s-dev:6443', lastCheck: '1m ago' },
  ];

  it('renders the card title', () => {
    render(<ClusterHealthCard clusters={clusters} />);
    expect(screen.getByText('Cluster Health')).toBeInTheDocument();
  });

  it('renders all cluster names', () => {
    render(<ClusterHealthCard clusters={clusters} />);
    expect(screen.getByText('production')).toBeInTheDocument();
    expect(screen.getByText('staging')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('renders API server addresses', () => {
    render(<ClusterHealthCard clusters={clusters} />);
    expect(screen.getByText('https://k8s-prod:6443')).toBeInTheDocument();
    expect(screen.getByText('https://k8s-staging:6443')).toBeInTheDocument();
  });

  it('renders status badges', () => {
    render(<ClusterHealthCard clusters={clusters} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders last check times', () => {
    render(<ClusterHealthCard clusters={clusters} />);
    expect(screen.getByText('10s ago')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('shows empty state when no clusters', () => {
    render(<ClusterHealthCard clusters={[]} />);
    expect(screen.getByText('No clusters configured.')).toBeInTheDocument();
  });
});

describe('ResourceSummary', () => {
  const resources: ResourceCounts = {
    pods: 124,
    deployments: 38,
    services: 52,
    namespaces: 12,
  };

  it('renders the card title', () => {
    render(<ResourceSummary resources={resources} />);
    expect(screen.getByText('Resource Summary')).toBeInTheDocument();
  });

  it('renders resource counts', () => {
    render(<ResourceSummary resources={resources} />);
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders resource labels', () => {
    render(<ResourceSummary resources={resources} />);
    expect(screen.getByText('Pods')).toBeInTheDocument();
    expect(screen.getByText('Deployments')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Namespaces')).toBeInTheDocument();
  });

  it('renders zero counts', () => {
    const empty: ResourceCounts = { pods: 0, deployments: 0, services: 0, namespaces: 0 };
    render(<ResourceSummary resources={empty} />);
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
  });
});

describe('RecentEvents', () => {
  const events: K8sEvent[] = [
    { id: '1', type: 'Normal', reason: 'Scheduled', message: 'Pod assigned to node-1', object: 'pod/nginx', timestamp: '2m ago' },
    { id: '2', type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', object: 'pod/api-server', timestamp: '5m ago' },
  ];

  it('renders the card title', () => {
    render(<RecentEvents events={events} />);
    expect(screen.getByText('Recent Events')).toBeInTheDocument();
  });

  it('renders event types as badges', () => {
    render(<RecentEvents events={events} />);
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('renders event reasons', () => {
    render(<RecentEvents events={events} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('BackOff')).toBeInTheDocument();
  });

  it('renders event messages', () => {
    render(<RecentEvents events={events} />);
    expect(screen.getByText('Pod assigned to node-1')).toBeInTheDocument();
    expect(screen.getByText('Back-off restarting failed container')).toBeInTheDocument();
  });

  it('renders event objects', () => {
    render(<RecentEvents events={events} />);
    expect(screen.getByText('pod/nginx')).toBeInTheDocument();
    expect(screen.getByText('pod/api-server')).toBeInTheDocument();
  });

  it('renders timestamps', () => {
    render(<RecentEvents events={events} />);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('shows empty state when no events', () => {
    render(<RecentEvents events={[]} />);
    expect(screen.getByText('No recent events.')).toBeInTheDocument();
  });
});
