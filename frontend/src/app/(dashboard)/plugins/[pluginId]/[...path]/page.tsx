import { notFound } from "next/navigation";
import { resolveComponent } from "@/lib/plugins/registry";

interface PluginPageProps {
  params: Promise<{
    pluginId: string;
    path: string[];
  }>;
}

// Maps the URL path segments to a component name by convention:
//   /plugins/istio           -> IstioOverview
//   /plugins/istio/virtual-services -> VirtualServiceList
//   /plugins/istio/gateways  -> GatewayList
//
// The component name is derived from the last path segment, converted to
// PascalCase. The backend manifest defines the mapping but we use convention
// so the page works without a network call for the manifest.
function pathToComponentName(pluginId: string, pathSegments: string[]): string {
  if (pathSegments.length === 0) {
    // Root plugin page -> Overview
    const name = pluginId.charAt(0).toUpperCase() + pluginId.slice(1);
    return `${name}Overview`;
  }

  // Convert last segment from kebab-case to PascalCase
  const last = pathSegments[pathSegments.length - 1];
  return last
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export default async function PluginPage({ params }: PluginPageProps) {
  const { pluginId, path } = await params;
  const componentName = pathToComponentName(pluginId, path);
  const Component = resolveComponent(pluginId, componentName);

  if (!Component) {
    notFound();
  }

  return <Component />;
}

// Generate static params for known plugins so Next.js can pre-render them.
export function generateStaticParams() {
  return [
    // Istio
    { pluginId: "istio", path: [] },
    { pluginId: "istio", path: ["virtual-services"] },
    { pluginId: "istio", path: ["gateways"] },
    { pluginId: "istio", path: ["destination-rules"] },
    { pluginId: "istio", path: ["service-entries"] },
    // Prometheus
    { pluginId: "prometheus", path: [] },
    { pluginId: "prometheus", path: ["service-monitors"] },
    { pluginId: "prometheus", path: ["rules"] },
    { pluginId: "prometheus", path: ["alertmanagers"] },
    { pluginId: "prometheus", path: ["pod-monitors"] },
    // Calico
    { pluginId: "calico", path: [] },
    { pluginId: "calico", path: ["network-policies"] },
    { pluginId: "calico", path: ["ip-pools"] },
    { pluginId: "calico", path: ["global-network-policies"] },
    { pluginId: "calico", path: ["host-endpoints"] },
    // CNPG
    { pluginId: "cnpg", path: [] },
    { pluginId: "cnpg", path: ["clusters"] },
    { pluginId: "cnpg", path: ["backups"] },
    { pluginId: "cnpg", path: ["scheduled-backups"] },
    { pluginId: "cnpg", path: ["poolers"] },
    // MariaDB
    { pluginId: "mariadb", path: [] },
    { pluginId: "mariadb", path: ["instances"] },
    { pluginId: "mariadb", path: ["databases"] },
    { pluginId: "mariadb", path: ["backups"] },
    { pluginId: "mariadb", path: ["users"] },
    { pluginId: "mariadb", path: ["connections"] },
    // KEDA
    { pluginId: "keda", path: [] },
    { pluginId: "keda", path: ["scaled-objects"] },
    { pluginId: "keda", path: ["scaled-jobs"] },
    { pluginId: "keda", path: ["trigger-authentications"] },
    // Ceph
    { pluginId: "ceph", path: [] },
    { pluginId: "ceph", path: ["clusters"] },
    { pluginId: "ceph", path: ["block-pools"] },
    { pluginId: "ceph", path: ["filesystems"] },
    { pluginId: "ceph", path: ["object-stores"] },
    // Helm
    { pluginId: "helm", path: [] },
    { pluginId: "helm", path: ["releases"] },
    { pluginId: "helm", path: ["release-detail"] },
  ];
}
