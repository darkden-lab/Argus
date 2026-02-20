import { notFound } from "next/navigation";
import { resolveComponent } from "@/lib/plugins/registry";

interface PluginIndexPageProps {
  params: Promise<{ pluginId: string }>;
}

export default async function PluginIndexPage({ params }: PluginIndexPageProps) {
  const { pluginId } = await params;

  // Root plugin page always renders the Overview component
  const componentName =
    pluginId.charAt(0).toUpperCase() + pluginId.slice(1) + "Overview";

  const Component = resolveComponent(pluginId, componentName);
  if (!Component) {
    notFound();
  }

  return <Component />;
}

export function generateStaticParams() {
  return [
    { pluginId: "istio" },
    { pluginId: "prometheus" },
    { pluginId: "calico" },
  ];
}
