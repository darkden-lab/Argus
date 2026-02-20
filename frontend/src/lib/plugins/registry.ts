import type React from "react";

// Istio components
import { IstioOverview } from "@/plugins/istio/overview";
import { VirtualServiceList } from "@/plugins/istio/virtual-services";
import { GatewayList } from "@/plugins/istio/gateways";
import { IstioMeshStatus } from "@/plugins/istio/overview";

// Prometheus components
import { PrometheusOverview } from "@/plugins/prometheus/overview";
import { ServiceMonitorList } from "@/plugins/prometheus/service-monitors";
import { RulesList } from "@/plugins/prometheus/rules";
import { PrometheusStatus } from "@/plugins/prometheus/overview";

// Calico components
import { CalicoOverview } from "@/plugins/calico/overview";
import { NetworkPolicyList } from "@/plugins/calico/network-policies";
import { IPPoolList } from "@/plugins/calico/ip-pools";
import { CalicoStatus } from "@/plugins/calico/overview";

// CNPG components
import { CnpgOverview, CnpgStatus } from "@/plugins/cnpg/overview";
import { CnpgClusterList } from "@/plugins/cnpg/clusters";
import { CnpgBackupList, CnpgScheduledBackupList } from "@/plugins/cnpg/backups";
import { CnpgPoolerList } from "@/plugins/cnpg/poolers";

// MariaDB components
import { MariadbOverview, MariadbStatus } from "@/plugins/mariadb/overview";
import { MariadbInstanceList } from "@/plugins/mariadb/instances";
import { MariadbDatabaseList } from "@/plugins/mariadb/databases";
import { MariadbBackupList } from "@/plugins/mariadb/backups";

// KEDA components
import { KedaOverview, KedaScalerStatus } from "@/plugins/keda/overview";
import { ScaledObjectList } from "@/plugins/keda/scaled-objects";
import { ScaledJobList } from "@/plugins/keda/scaled-jobs";

// Ceph components
import { CephOverview, CephStatus } from "@/plugins/ceph/overview";
import { CephClusterList } from "@/plugins/ceph/clusters";
import { CephBlockPoolList } from "@/plugins/ceph/block-pools";
import { CephFilesystemList } from "@/plugins/ceph/filesystems";

// Helm components
import { HelmOverview, HelmStatus } from "@/plugins/helm/overview";
import { HelmReleaseList } from "@/plugins/helm/releases";
import { HelmReleaseDetail } from "@/plugins/helm/release-detail";

// Registry maps plugin ID -> component name -> React component
const componentRegistry: Record<string, Record<string, React.ComponentType>> =
  {
    istio: {
      IstioOverview,
      VirtualServiceList,
      GatewayList,
      IstioMeshStatus,
    },
    prometheus: {
      PrometheusOverview,
      ServiceMonitorList,
      RulesList,
      PrometheusStatus,
    },
    calico: {
      CalicoOverview,
      NetworkPolicyList,
      IPPoolList,
      CalicoStatus,
    },
    cnpg: {
      CnpgOverview,
      CnpgStatus,
      CnpgClusterList,
      CnpgBackupList,
      CnpgScheduledBackupList,
      CnpgPoolerList,
    },
    mariadb: {
      MariadbOverview,
      MariadbStatus,
      MariadbInstanceList,
      MariadbDatabaseList,
      MariadbBackupList,
    },
    keda: {
      KedaOverview,
      KedaScalerStatus,
      ScaledObjectList,
      ScaledJobList,
    },
    ceph: {
      CephOverview,
      CephStatus,
      CephClusterList,
      CephBlockPoolList,
      CephFilesystemList,
    },
    helm: {
      HelmOverview,
      HelmStatus,
      HelmReleaseList,
      HelmReleaseDetail,
    },
  };

export function resolveComponent(
  pluginId: string,
  componentName: string
): React.ComponentType | null {
  return componentRegistry[pluginId]?.[componentName] ?? null;
}
