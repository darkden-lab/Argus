"use client";

import { usePluginStore } from "@/stores/plugins";
import { resolveComponent } from "@/lib/plugins/registry";

export function PluginWidgets() {
  const { plugins } = usePluginStore();

  const widgets = plugins.flatMap((p) =>
    (p.frontend.widgets ?? [])
      .filter((w) => w.type === "dashboard-card")
      .map((w) => ({ ...w, pluginId: p.id }))
  );

  if (widgets.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {widgets.map((widget) => {
        const Component = resolveComponent(widget.pluginId, widget.component);
        if (!Component) return null;
        return <Component key={widget.id} />;
      })}
    </div>
  );
}
