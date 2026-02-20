# K8s Dashboard - Ideas Backlog

Ideas pendientes de diseñar e implementar.

---

## 1. CLI Web + Kubectl Auth Proxy

**Idea:** Añadir una opcion en el dashboard para abrir una CLI (terminal web) y/o poder usar la API del dashboard como proxy de autenticacion para kubectl.

**Concepto:**
- **Terminal web:** Embeber un terminal en el dashboard (xterm.js + WebSocket) que permita ejecutar comandos kubectl directamente desde el navegador, autenticado con la sesion del usuario.
- **Auth proxy:** Exponer un endpoint que actue como proxy de autenticacion para kubectl local. El usuario configura su kubeconfig apuntando al dashboard, y este hace de intermediario autenticando con JWT/OIDC y reenviando las peticiones al cluster destino con las credenciales reales.
- Respetar RBAC del dashboard (el usuario solo puede hacer lo que sus permisos permiten).

**Estado:** Por diseñar

---

## 2. Chat de IA integrado

**Idea:** Añadir un chat con IA dentro del dashboard que asista al usuario en la gestion del cluster.

**Concepto:**
- Chat panel (drawer/sidebar) accesible desde cualquier pagina del dashboard.
- El asistente tiene contexto del cluster actual, namespace, recursos visibles y permisos del usuario.
- Casos de uso: diagnosticar pods en CrashLoopBackOff, sugerir configuraciones, explicar eventos/errores, generar YAML de recursos, guiar en troubleshooting.
- Backend: endpoint que hace proxy a API de LLM (Claude, OpenAI, o modelo local) inyectando contexto K8s.
- Respetar RBAC: el asistente solo puede ver/sugerir acciones dentro de los permisos del usuario.

**Estado:** Por diseñar

---

## 3. Agente de conexion a clusters (sin kubeconfig)

**Idea:** Desplegar un agente ligero dentro de cada cluster que se conecte al dashboard automaticamente, eliminando la necesidad de subir kubeconfig manualmente. Mantener ambos metodos (kubeconfig + agente).

**Concepto:**
- **Agente en el cluster:** Pod ligero que se despliega en el cluster objetivo. Se registra automaticamente contra el dashboard usando un token de registro.
- **Conexion inversa:** El agente abre una conexion WebSocket/gRPC hacia el dashboard (no al reves), evitando problemas de firewall y NAT.
- **Proxy de API:** El agente actua como proxy local al API server del cluster, reenviando peticiones del dashboard sin exponer el API server externamente.
- **Dos metodos coexistentes:** Añadir clusters via kubeconfig (como ahora) O desplegando el agente (helm install dashboard-agent).
- **Auto-discovery:** El agente reporta info del cluster (version, nodos, namespaces) automaticamente al registrarse.
- Respetar RBAC del dashboard + ServiceAccount RBAC del agente en el cluster.

**Estado:** Por diseñar

---

## 4. Sistema de notificaciones por email

**Idea:** Enviar notificaciones por email a los usuarios cuando ocurran eventos importantes en sus clusters.

**Posibles notificaciones utiles:**
- **Alertas criticas:** Pod en CrashLoopBackOff, nodo NotReady, PVC sin provisionar, OOMKilled.
- **Seguridad:** Login fallido repetido, cambios en RBAC/roles, nuevo cluster añadido, certificados proximos a expirar.
- **Recursos:** Namespace con alto consumo de CPU/memoria, PersistentVolume casi lleno, cuotas de recursos superadas.
- **Operaciones:** Despliegue fallido, Job fallido, Helm release con error, backup CNPG fallido.
- **Resumen periodico:** Email diario/semanal con estado general de los clusters (health, eventos, metricas clave).

**Concepto:**
- Backend: servicio de notificaciones con cola (goroutine + channel o Redis) que procesa eventos y envia emails via SMTP o servicio externo (SendGrid, SES, Mailgun).
- Configuracion por usuario: cada usuario elige que notificaciones recibir y con que frecuencia (inmediata, digest diario, semanal).
- Templates de email responsive (HTML + texto plano).
- Panel de preferencias de notificacion en /settings/notifications.
- Posibilidad futura: webhook, Slack, Telegram ademas de email.

**Estado:** Por diseñar
