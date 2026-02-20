#!/usr/bin/env bash
set -euo pipefail

# K8s Dashboard Agent Installer
# Usage: curl -sSL https://<dashboard-url>/api/agents/install.sh | bash -s -- \
#   --dashboard-url <url> --token <token> --cluster-name <name> [--namespace <ns>] [--rbac-preset <preset>]

DASHBOARD_URL=""
TOKEN=""
CLUSTER_NAME=""
NAMESPACE="argus"
RBAC_PRESET="read-only"
CHART_VERSION=""
IMAGE_TAG="latest"

usage() {
  cat <<EOF
K8s Dashboard Agent Installer

Usage:
  install.sh --dashboard-url <url> --token <token> --cluster-name <name> [options]

Required:
  --dashboard-url    Dashboard gRPC endpoint URL
  --token            Registration token from the dashboard
  --cluster-name     Name for this cluster in the dashboard

Options:
  --namespace        Kubernetes namespace (default: argus)
  --rbac-preset      RBAC preset: read-only, operator, admin, custom (default: read-only)
  --chart-version    Helm chart version (default: latest)
  --image-tag        Agent image tag (default: latest)
  -h, --help         Show this help message
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dashboard-url) DASHBOARD_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --cluster-name) CLUSTER_NAME="$2"; shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --rbac-preset) RBAC_PRESET="$2"; shift 2 ;;
    --chart-version) CHART_VERSION="$2"; shift 2 ;;
    --image-tag) IMAGE_TAG="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$DASHBOARD_URL" || -z "$TOKEN" || -z "$CLUSTER_NAME" ]]; then
  echo "Error: --dashboard-url, --token, and --cluster-name are required."
  echo ""
  usage
fi

# Check for helm
if ! command -v helm &> /dev/null; then
  echo "Error: helm is not installed. Please install Helm first: https://helm.sh/docs/intro/install/"
  exit 1
fi

# Check for kubectl
if ! command -v kubectl &> /dev/null; then
  echo "Error: kubectl is not installed. Please install kubectl first."
  exit 1
fi

echo "Installing K8s Dashboard Agent..."
echo "  Dashboard URL:  $DASHBOARD_URL"
echo "  Cluster Name:   $CLUSTER_NAME"
echo "  Namespace:      $NAMESPACE"
echo "  RBAC Preset:    $RBAC_PRESET"
echo ""

# Create namespace if it doesn't exist
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Build helm install command
HELM_ARGS=(
  upgrade --install dashboard-agent
  oci://registry.argus.io/charts/dashboard-agent
  --namespace "$NAMESPACE"
  --set "dashboard.url=$DASHBOARD_URL"
  --set "dashboard.token=$TOKEN"
  --set "dashboard.clusterName=$CLUSTER_NAME"
  --set "rbac.preset=$RBAC_PRESET"
  --set "image.tag=$IMAGE_TAG"
)

if [[ -n "$CHART_VERSION" ]]; then
  HELM_ARGS+=(--version "$CHART_VERSION")
fi

helm "${HELM_ARGS[@]}"

echo ""
echo "Dashboard agent installed successfully."
echo "The agent will connect to $DASHBOARD_URL and register as '$CLUSTER_NAME'."
echo ""
echo "Check agent status:"
echo "  kubectl -n $NAMESPACE get pods -l app.kubernetes.io/name=dashboard-agent"
echo "  kubectl -n $NAMESPACE logs -l app.kubernetes.io/name=dashboard-agent"
