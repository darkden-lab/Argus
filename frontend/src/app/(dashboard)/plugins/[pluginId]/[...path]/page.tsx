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
    { pluginId: "istio", path: [] },
    { pluginId: "istio", path: ["virtual-services"] },
    { pluginId: "istio", path: ["gateways"] },
    { pluginId: "prometheus", path: [] },
    { pluginId: "prometheus", path: ["service-monitors"] },
    { pluginId: "prometheus", path: ["rules"] },
    { pluginId: "calico", path: [] },
    { pluginId: "calico", path: ["network-policies"] },
    { pluginId: "calico", path: ["ip-pools"] },
  ];
}
