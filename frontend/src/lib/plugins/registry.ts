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
  };

export function resolveComponent(
  pluginId: string,
  componentName: string
): React.ComponentType | null {
  return componentRegistry[pluginId]?.[componentName] ?? null;
}
