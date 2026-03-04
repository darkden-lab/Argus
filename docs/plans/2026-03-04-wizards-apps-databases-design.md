# Wizards, Apps & Databases — Complete Revision Design

**Date:** 2026-03-04
**Status:** Approved

## Problem Statement

The Argus dashboard has 8 wizards with inconsistent UX patterns, missing autocomplete, no inline resource creation, incomplete app management (no delete/edit/environments), and severely limited database management.

## Design Goals

1. **Unified wizard experience** — all wizards share the same navigation, validation, review, and keyboard patterns
2. **Perfect autocomplete** — async Combobox for all dynamic fields (namespaces, storage classes, gateways, services, secrets, configmaps)
3. **Inline resource creation** — create dependent resources (Gateway, Namespace, Secret, ConfigMap) via nested modal wizards without leaving the current wizard
4. **Complete app CRUD** — delete, edit deployment, environments tab (env vars + ConfigMap/Secret refs + volume mounts), rollout management
5. **Complete database management** — delete, edit/scale, backup/restore, user management, connection strings, logs, replication status, failover

## Phase Plan

### Phase 1 — Unified Wizard Infrastructure
- `UnifiedWizard` component: steps, validation per step, navigation, review, keyboard shortcuts
- Enhanced `Combobox`: async search, "Create new..." integrated button, loading states
- `InlineResourceCreator`: nested modal for creating dependent resources
- `ManifestPreview`: unified YAML/JSON toggle preview
- `ConfirmDeleteDialog`: reusable delete confirmation with resource name typing

### Phase 2 — Refactor All 8 Wizards
Migrate all wizards to unified pattern:
- Add-Cluster, Create-Database, Create-Gateway, Create-HTTPRoute, Create-NetworkPolicy, Create-ConfigMap, Create-PVC, Create-Secret
- Add inline creation for: Gateways (from HTTPRoute), Namespaces (from any), Secrets (from DB wizard)

### Phase 3 — Apps: Complete CRUD + Environments
- Delete app with cleanup
- Edit deployment (image, replicas, strategy, labels)
- Environments tab: inline env vars + ConfigMap/Secret refs + volume mounts + inline create
- Rollout management, resource limits display, health checks display

### Phase 4 — Databases: Complete Revision
- Delete (CNPG/MariaDB)
- Edit/Scale (replicas, storage, config)
- Backup management (create, list, restore, scheduled)
- User management (CNPG: database/owner, MariaDB: users/grants/databases)
- Connection strings (copiable)
- Logs viewer
- Replication status + failover (CNPG)
- Basic monitoring

## Technical Decisions

- Wizards use Dialog + ProgressSteps (existing pattern, unified)
- Combobox enhanced with `onCreateNew` callback prop
- InlineResourceCreator uses z-index stacking for nested modals
- All forms use controlled state (useState) — no form library to keep consistent with existing code
- YAML preview uses existing yaml-editor component
