#!/usr/bin/env bash
# =============================================================================
# ArgoCD bootstrap — applies the AppProject + ApplicationSet (or single
# Application) with project-specific values substituted.
#
# Usage:
#   1. Copy .cienv-example → .cienv (at repo root) and fill in the values.
#   2. Run from repo root:    ./argocd/bootstrap.sh
#
# What it does:
#   - Sources .cienv (or accepts vars via the environment)
#   - Validates that all required variables are present
#   - Runs `envsubst` on each YAML in this directory
#   - Pipes the result into `kubectl apply -f -`
#
# To preview without applying, run:    ./argocd/bootstrap.sh --dry-run
# To apply only one file:              ./argocd/bootstrap.sh appproject.yaml
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
REPO_ROOT="$( cd -- "$SCRIPT_DIR/.." &> /dev/null && pwd )"

# ── Load environment ──────────────────────────────────────────────────────────
if [ -f "$REPO_ROOT/.cienv" ]; then
  echo "→ Loading variables from $REPO_ROOT/.cienv"
  set -a; source "$REPO_ROOT/.cienv"; set +a
else
  echo "⚠  No .cienv at repo root — relying on already-exported environment."
fi

# ── Required variables ────────────────────────────────────────────────────────
REQUIRED_VARS=(
  PROJECT_NAME
  ARGOCD_NAMESPACE
  REPO_URL
  HELM_CHART_PATH
  K8S_NAMESPACE
  IN_CLUSTER_SERVER
  BACKEND_HELM_KEY
  FRONTEND_HELM_KEY
  PROD_TARGET_REVISION
  LOCAL_DOMAIN
  PROD_DOMAIN
)

missing=0
for v in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!v:-}" ]; then
    echo "✗ Missing required variable: $v"
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo
  echo "Set these in .cienv or export them before re-running."
  echo "See .cienv-example for the full list."
  exit 1
fi

# ── Determine targets ─────────────────────────────────────────────────────────
DRY_RUN=0
TARGETS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *.yaml)    TARGETS+=("$SCRIPT_DIR/$arg") ;;
  esac
done

if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=(
    "$SCRIPT_DIR/appproject.yaml"
    "$SCRIPT_DIR/applicationset.yaml"
  )
fi

# ── Apply ─────────────────────────────────────────────────────────────────────
for f in "${TARGETS[@]}"; do
  echo
  echo "── $(basename "$f") ────────────────────────────────────────"
  RENDERED=$(envsubst < "$f")

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "$RENDERED"
  else
    echo "$RENDERED" | kubectl apply -f -
  fi
done

echo
echo "✓ Done."
