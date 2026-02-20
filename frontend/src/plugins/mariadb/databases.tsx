"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ResourceTable, type Column } from "@/components/resources/resource-table";

interface MariaDatabase {
  metadata: { name: string; namespace: string };
  spec?: { mariaDbRef?: { name?: string }; characterSet?: string; collate?: string };
}

const columns: Column<MariaDatabase>[] = [
  { key: "metadata.name",           label: "Name" },
  { key: "metadata.namespace",      label: "Namespace" },
  { key: "spec.mariaDbRef.name",    label: "Instance",    render: (r) => r.spec?.mariaDbRef?.name ?? "-" },
  { key: "spec.characterSet",       label: "Charset",     render: (r) => r.spec?.characterSet ?? "-" },
  { key: "spec.collate",            label: "Collation",   render: (r) => r.spec?.collate ?? "-" },
];

export function MariadbDatabaseList() {
  const [items, setItems] = useState<MariaDatabase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clusterID = localStorage.getItem("selected_cluster") ?? "";
    if (!clusterID) { setLoading(false); return; }
    api.get<{ items: MariaDatabase[] }>(`/api/plugins/mariadb/databases?clusterID=${clusterID}`)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Databases</h1>
      <ResourceTable data={items} columns={columns} loading={loading} searchPlaceholder="Filter databases..." />
    </div>
  );
}
