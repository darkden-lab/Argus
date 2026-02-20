# Implementation Plans Overview

**Project:** K8s Admin Dashboard
**Created:** 2026-02-20

---

## All Features

| # | Feature | Plan | Tasks | Date | Status |
|---|---|---|---|---|---|
| 0 | Base Project (Dashboard K8s) | [00-base-project.md](./00-base-project.md) | 50 | 2026-02-20 | 96% completado (48/50) |
| 1 | Notifications (Kafka) | [01-notifications-kafka.md](./01-notifications-kafka.md) | 17 | 2026-02-20 | Pendiente |
| 2 | Cluster Agent (gRPC) | [02-cluster-agent.md](./02-cluster-agent.md) | 13 | 2026-02-20 | Pendiente |
| 3 | CLI Web + Auth Proxy | [03-cli-web-auth-proxy.md](./03-cli-web-auth-proxy.md) | 10 | 2026-02-20 | Pendiente |
| 4 | AI Chat Assistant | [04-ai-chat.md](./04-ai-chat.md) | 15 | 2026-02-20 | Pendiente |

**Total: 105 tasks across 5 plans (55 nuevas + 50 base)**

---

## Ideas Backlog (sin plan aun)

Documentadas en [../ideas-backlog.md](../ideas-backlog.md):

| # | Idea | Date |
|---|---|---|
| 1 | CLI Web + Kubectl Auth Proxy | 2026-02-20 |
| 2 | Chat de IA integrado | 2026-02-20 |
| 3 | Agente de conexion a clusters | 2026-02-20 |
| 4 | Sistema de notificaciones por email | 2026-02-20 |

> Nota: Las ideas 1-3 ya fueron diseñadas y tienen plan de implementacion (features 2-4 arriba).
> La idea 4 fue expandida a un sistema completo de notificaciones multi-canal (feature 1).

---

## Execution Order (nuevas features)

Las features son independientes y pueden ejecutarse en paralelo por equipos diferentes.
Orden sugerido si se hace secuencial:

1. **Notifications** - Base para alertas, reutilizable por otras features
2. **Cluster Agent** - Mejora UX de onboarding
3. **CLI Web** - Power user feature
4. **AI Chat** - Mas complejo, se beneficia de que el resto este estable

---

## Agent Roles

### Base project (completado)
| Agent | Tasks completadas |
|---|---|
| backend-dev | 16 tasks (auth, RBAC, cluster, plugins, API docs, tests) |
| frontend-dev | 4 tasks (layout, dashboard, WebSocket, OIDC) |
| frontend-dev-2 | 4 tasks (scaffold, clusters, RBAC gate, error handling) |
| k8s-expert | 4 tasks (Istio, plugin pages) |
| devops | 8 tasks (scaffold, Docker, Helm, CI/CD, plugins) |
| tester | 2 tasks en progreso (unit tests, E2E) |

### Nuevas features (propuesto)
| Agent | Responsabilidad |
|---|---|
| backend-dev | Go backend: brokers, gRPC, AI service, proxy, CLI |
| backend-dev-2 | Go backend: channels, tools, providers, RAG |
| frontend-dev | React: notifications UI, agent tab, terminal |
| frontend-dev-2 | React: AI chat panel, settings pages |
| devops | Docker, Helm charts, proto compilation, agent deployment |
