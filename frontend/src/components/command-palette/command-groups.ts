import {
  LayoutGrid,
  Rocket,
  Database,
  Timer,
  Network,
  Wifi,
  HardDrive,
  Activity,
  Terminal,
  Sparkles,
  Settings,
  Puzzle,
  Server,
  Bell,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  shortcut?: string;
  href?: string;
  action?: () => void;
  keywords?: string[];
}

export interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

export const navigationCommands: CommandGroup = {
  id: "navigation",
  label: "Navigation",
  items: [
    {
      id: "nav-dashboard",
      label: "Dashboard",
      description: "Overview of your clusters",
      icon: LayoutGrid,
      href: "/dashboard",
      keywords: ["home", "overview", "main"],
    },
    {
      id: "nav-apps",
      label: "Apps",
      description: "Deployments, StatefulSets, DaemonSets",
      icon: Rocket,
      href: "/apps",
      keywords: ["deployments", "workloads", "applications"],
    },
    {
      id: "nav-databases",
      label: "Databases",
      description: "Database resources and operators",
      icon: Database,
      href: "/databases",
      keywords: ["postgres", "mysql", "mariadb", "cnpg"],
    },
    {
      id: "nav-jobs",
      label: "Jobs",
      description: "Jobs and CronJobs",
      icon: Timer,
      href: "/jobs",
      keywords: ["cronjobs", "batch", "scheduled"],
    },
    {
      id: "nav-clusters",
      label: "Clusters",
      description: "Manage Kubernetes clusters",
      icon: Network,
      href: "/clusters",
      keywords: ["kubernetes", "k8s", "infrastructure"],
    },
    {
      id: "nav-networking",
      label: "Networking",
      description: "Services, Ingresses, Network Policies",
      icon: Wifi,
      href: "/networking",
      keywords: ["services", "ingress", "network", "policies"],
    },
    {
      id: "nav-storage",
      label: "Storage",
      description: "PVs, PVCs, StorageClasses",
      icon: HardDrive,
      href: "/storage",
      keywords: ["volumes", "pv", "pvc", "persistent"],
    },
    {
      id: "nav-monitoring",
      label: "Monitoring",
      description: "Metrics and alerting",
      icon: Activity,
      href: "/monitoring",
      keywords: ["metrics", "prometheus", "alerts", "grafana"],
    },
    {
      id: "nav-terminal",
      label: "Terminal",
      description: "kubectl terminal",
      icon: Terminal,
      href: "/terminal",
      keywords: ["shell", "kubectl", "exec", "console"],
    },
  ],
};

export const actionCommands: CommandGroup = {
  id: "actions",
  label: "Actions",
  items: [
    {
      id: "action-ai",
      label: "Ask AI Assistant",
      description: "Get help from the AI assistant",
      icon: Sparkles,
      keywords: ["chat", "help", "question", "ai"],
    },
  ],
};

export const settingsCommands: CommandGroup = {
  id: "settings",
  label: "Settings",
  items: [
    {
      id: "settings-general",
      label: "General Settings",
      description: "Application configuration",
      icon: Settings,
      href: "/settings",
      keywords: ["config", "preferences"],
    },
    {
      id: "settings-plugins",
      label: "Plugins",
      description: "Manage installed plugins",
      icon: Puzzle,
      href: "/settings/plugins",
      keywords: ["extensions", "addons"],
    },
    {
      id: "settings-users",
      label: "User Management",
      description: "Manage users and roles",
      icon: Users,
      href: "/settings/users",
      keywords: ["accounts", "permissions"],
    },
    {
      id: "settings-roles",
      label: "Roles & Permissions",
      description: "RBAC configuration",
      icon: Shield,
      href: "/settings/roles",
      keywords: ["rbac", "access", "authorization"],
    },
    {
      id: "settings-notifications",
      label: "Notification Settings",
      description: "Configure notification channels",
      icon: Bell,
      href: "/settings/notifications",
      keywords: ["alerts", "email", "slack"],
    },
    {
      id: "settings-clusters",
      label: "Cluster Settings",
      description: "Manage cluster connections",
      icon: Server,
      href: "/clusters",
      keywords: ["kubeconfig", "agent"],
    },
  ],
};

export const allCommandGroups: CommandGroup[] = [
  navigationCommands,
  actionCommands,
  settingsCommands,
];
