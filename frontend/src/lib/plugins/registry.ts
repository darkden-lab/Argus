import type React from "react";

// Istio components
import { IstioOverview } from "@/plugins/istio/overview";
import { VirtualServiceList } from "@/plugins/istio/virtual-services";
import { GatewayList } from "@/plugins/istio/gateways";
import { DestinationRuleList } from "@/plugins/istio/destination-rules";
import { ServiceEntryList } from "@/plugins/istio/service-entries";
import { IstioMeshStatus } from "@/plugins/istio/overview";

// Prometheus components
import { PrometheusOverview } from "@/plugins/prometheus/overview";
import { ServiceMonitorList } from "@/plugins/prometheus/service-monitors";
import { RulesList } from "@/plugins/prometheus/rules";
import { AlertManagerList } from "@/plugins/prometheus/alertmanagers";
import { PodMonitorList } from "@/plugins/prometheus/pod-monitors";
import { PrometheusStatus } from "@/plugins/prometheus/overview";

// Calico components
import { CalicoOverview } from "@/plugins/calico/overview";
import { NetworkPolicyList } from "@/plugins/calico/network-policies";
import { IPPoolList } from "@/plugins/calico/ip-pools";
import { GlobalNetworkPolicyList } from "@/plugins/calico/global-network-policies";
import { HostEndpointList } from "@/plugins/calico/host-endpoints";
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
import { MariadbUserList } from "@/plugins/mariadb/users";
import { MariadbConnectionList } from "@/plugins/mariadb/connections";

// KEDA components
import { KedaOverview, KedaScalerStatus } from "@/plugins/keda/overview";
import { ScaledObjectList } from "@/plugins/keda/scaled-objects";
import { ScaledJobList } from "@/plugins/keda/scaled-jobs";
import { TriggerAuthenticationList } from "@/plugins/keda/trigger-authentications";

// Ceph components
import { CephOverview, CephStatus } from "@/plugins/ceph/overview";
import { CephClusterList } from "@/plugins/ceph/clusters";
import { CephBlockPoolList } from "@/plugins/ceph/block-pools";
import { CephFilesystemList } from "@/plugins/ceph/filesystems";
import { CephObjectStoreList } from "@/plugins/ceph/object-stores";

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
      DestinationRuleList,
      ServiceEntryList,
      IstioMeshStatus,
    },
    prometheus: {
      PrometheusOverview,
      ServiceMonitorList,
      RulesList,
      AlertManagerList,
      PodMonitorList,
      PrometheusStatus,
    },
    calico: {
      CalicoOverview,
      NetworkPolicyList,
      IPPoolList,
      GlobalNetworkPolicyList,
      HostEndpointList,
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
      MariadbUserList,
      MariadbConnectionList,
    },
    keda: {
      KedaOverview,
      KedaScalerStatus,
      ScaledObjectList,
      ScaledJobList,
      TriggerAuthenticationList,
    },
    ceph: {
      CephOverview,
      CephStatus,
      CephClusterList,
      CephBlockPoolList,
      CephFilesystemList,
      CephObjectStoreList,
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
