# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A full-stack DevOps UI for managing a Zabbix monitoring server. The backend exposes a REST API that wraps the Zabbix JSON-RPC API; the frontend is a Next.js app that calls it. Primary operations: list/create/delete hosts, add monitoring items and triggers, bulk-import hosts from CSV/XLSX, export inventory to Excel.

The repo is set up for **air-gapped / private-registry** deployment on **OpenShift** (or vanilla Kubernetes), with Helm charts and ArgoCD ApplicationSet across dev / staging / production.

---

## Monorepo layout

```
apps/
  backend/          Python 3.12 / FastAPI
  frontend/         React 18 / Next.js 15 App Router / TypeScript / MUI
  filebeat/         Elastic Filebeat 8.17 — ships container logs to Elasticsearch
helm/
  charts/
    backend/        standalone Helm chart
    frontend/       standalone Helm chart
    filebeat/       Filebeat DaemonSet chart
    zabbix-portal/  umbrella chart depending on all three
argocd/             AppProject, Application, ApplicationSet, per-env values
.gitlab/ci/         modular GitLab CI pipeline
```

---

## Development commands

### Backend (from `apps/backend/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Dev server (port 6769)
uvicorn Zabbix_Main:app --host 0.0.0.0 --port 6769 --reload

# Lint / format
ruff check . && ruff format --check .

# Type-check
mypy . --ignore-missing-imports
```

### Frontend (from `apps/frontend/`)

```bash
npm install

# Dev server (Next.js on :42069, proxies /api → :6769 via route handler)
npm run dev

# Build / lint / typecheck
npm run build       # next build
npm run lint        # Biome
npm run typecheck   # tsc

# Format whole repo (from repo root)
npm run format
```

### Docker (each app built independently)

```bash
# Backend — build context is apps/backend/
docker build -t zabbix-portal-backend apps/backend/

# Frontend — build context is apps/frontend/ (Dockerfile lives there)
docker build -t zabbix-portal-frontend apps/frontend/

# Filebeat — build context is apps/filebeat/
docker build -t zabbix-portal-filebeat apps/filebeat/
```

Running containers — backend and frontend must share a Docker network so the frontend route handler can reach the backend:

```bash
docker network create zabbix-net

docker run -d --name backend --network zabbix-net \
  --env-file apps/backend/.env \
  -p 6769:6769 \
  zabbix-portal-backend

docker run -d --name frontend --network zabbix-net \
  -p 42069:42069 \
  zabbix-portal-frontend
```

Set `BACKEND_URL=http://backend:6769` in `apps/frontend/.env` when both containers are on the same Docker network. Use `http://host.docker.internal:6769` for Mac/Windows Docker Desktop when the backend runs natively or on a separate container without a shared network.

---

## Backend architecture

```mermaid
flowchart LR
    ZabbixBase --> Host_Manager
    ZabbixBase --> Item_Manager
    Host_Manager --> main["Zabbix_Main.py"]
    Item_Manager --> main
```

- **`ZabbixBase`** loads `apps/backend/.env` and creates a `zabbix_utils.ZabbixAPI` session. All managers inherit from it. `self.zapi` is `None` when Zabbix is unreachable — callers must guard against this.
- **`Host_Manager`** wraps host CRUD and Excel export (`openpyxl` / `pandas`).
- **`Item_Manager`** wraps item and trigger creation. Trigger expressions follow Zabbix 5.x classic format: `{hostname:item_key.last()} operator threshold`.
- **`Zabbix_Main.py`** instantiates one `Host_Manager` and one `Item_Manager` at module load time (module-level singletons). There is no dependency injection.
- FastAPI runs on **port 6769** locally and in Docker/Kubernetes.

Required environment variables (in `apps/backend/.env`):

```
ZABBIX_URL=http://your-zabbix-server
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix
BACKEND_URL=http://localhost:6769
```

`BACKEND_URL` is consumed by the frontend, not the backend itself — it lives here so there is one `.env` file to maintain. These can be supplied in two ways:
- **Local development** — place them in `apps/backend/.env` (loaded by `python-dotenv`).
- **Kubernetes / OpenShift** — inject them via a ConfigMap (non-sensitive values) or Secret (credentials). Mount the ConfigMap as environment variables in the Pod spec or via `envFrom`. Do not bake `.env` files into container images.

The URL is normalised — either `http://host` or `http://host/api_jsonrpc.php` works.

---

## Frontend architecture

- All API calls go through the thin client in `src/app/api.ts`. Every call is prefixed with `/api` — all environments route through the same Next.js route handler.
- **API proxying** — `src/app/api/[...path]/route.ts` is a catch-all route handler that proxies every `/api/*` request to `BACKEND_URL` at request time. `BACKEND_URL` defaults to `http://localhost:6769` if not set.
- **`BACKEND_URL` loading** — `src/instrumentation.ts` runs `dotenv.config()` once at server startup, loading `apps/frontend/.env` (baked into the image at build time). In dev, Next.js loads `.env` automatically.
- Routing: Next.js App Router (`src/app/`). Three routes: `page.tsx` (/), `hosts/page.tsx`, `items/page.tsx`. Each thin page file re-exports the real component from `src/views/`.
- Root layout: `src/app/layout.tsx` (server component — html/body/AppRouterCacheProvider). Providers: `src/app/providers.tsx` (client boundary — ThemeProvider + AppShell).
- Theme: `src/app/theme.ts` (MUI v5).
- Shell: `src/app/layout/AppShell.tsx` — uses `usePathname` from `next/navigation` and `Link` from `next/link`. Polls `/api/health` every 10 s and shows a red banner if the backend is unreachable or a yellow banner if the backend is up but Zabbix is disconnected.
- No global state manager — components call `api.*` directly.
- All page components are client components (`'use client'`) because they use React hooks and browser APIs.

### Frontend code style

- **Always use arrow-function syntax** for all functions — components, hooks, helpers, callbacks. Never use the `function` keyword.

```tsx
// correct
const MyComponent = () => { ... };
const useMyHook = () => { ... };
const handleClick = () => { ... };

// wrong — never do this
function MyComponent() { ... }
function useMyHook() { ... }
function handleClick() { ... }
```

---

## Private network / OpenShift conventions

- **Every `FROM` line** in Dockerfiles has a `# PRIVATE NETWORK:` comment with the exact image and the format for an Artifactory replacement. Do not change images without preserving these comments.
- **npm packages are pinned to exact versions** (no `^` or `~`) in `package.json` files. `.npmrc` enforces `frozen-lockfile=true` and disables peer auto-install. The commented-out `registry=` line is where to point at a private npm proxy.
- **pip packages** must be fetched from an internal PyPI proxy. The `pip install` line in `apps/backend/Dockerfile` has a commented `--index-url` flag ready to uncomment.
- The frontend runs on **port 42069** as a Next.js standalone server (`node server.js`). This is required for OpenShift's `restricted` SCC: non-root, unprivileged port, random UID with GID 0. Files are `chown 1001:0` so any UID in group 0 can read them.
- `apps/frontend/nginx.conf` exists but is **not used** by the container — kept only as a reference for standalone nginx.

---

## Helm

- Sub-charts (`backend/`, `frontend/`, `filebeat/`) are deployable independently.
- The umbrella chart (`zabbix-portal/`) depends on all three via `file://` references. Always run `helm dependency build helm/charts/zabbix-portal/` before templating or installing it.
- The frontend chart's `apiProxy.enabled: true` adds an `/api/` path rule to the Ingress that routes to the backend service — in-cluster, the Ingress handles `/api/*` routing so the Next.js route handler's `BACKEND_URL` is not used. The backend service name is auto-derived as `<release-name>-zabbix-portal-backend`.
- Sensitive Zabbix credentials are expected in an existing Secret named `zabbix-portal-backend-secret` (set via `existingSecret`). The chart only renders its own `secret.yaml` when `existingSecret` is empty.
- Probes target port `42069` on the frontend and `/health` on port `6769` on the backend.
- The Filebeat chart deploys a DaemonSet. It reads the Elasticsearch password from a Secret named `filebeat-elasticsearch-secret` (key: `ELASTICSEARCH_PASSWORD`). The Elasticsearch host is set via `elasticsearch.hosts` in `values.yaml` — see the `# PRIVATE NETWORK:` comment there. On OpenShift, grant the `hostmount-anyuid` SCC to the Filebeat ServiceAccount before deploying.

---

## GitLab CI pipeline

`.gitlab-ci.yml` declares stages `[.pre, lint, build, staging, production, dr, cleanup]` and includes seven files from `.gitlab/ci/`:

- **`common.yml`** — **the only file you edit when adapting to a new project.** All paths, image names, Helm keys, ArgoCD app names, environment URLs, tooling versions, and `ROOT_JS_CONFIGS` live here.
- **`detect.yml`** — diffs current tag vs. previous tag; emits `BACKEND_CHANGED` / `FRONTEND_CHANGED` / `FILEBEAT_CHANGED` / `HELM_CHANGED` dotenv vars. Downstream jobs skip when their app is untouched.
- **`python.yml`** — ruff lint, mypy, Docker build + push for `BACKEND_IMAGE`.
- **`node.yml`** — Biome lint, tsc typecheck, Docker build + push for `FRONTEND_IMAGE`.
- **`elastic.yml`** — Docker build + push for `FILEBEAT_IMAGE` (no lint stage; gated on `FILEBEAT_CHANGED`).
- **`gitops.yml`** — `helm lint` + `helm template`; auto `deploy:staging`; manual `deploy:production`; manual `deploy:dr`. All three deploy scripts pin all three image tags per-app.
- **`cleanup.yml`** — manual `cleanup:registry` prunes old image tags via GitLab API.

The pipeline fires **only on tag pushes**. Branch pushes and MR merges do nothing. Required CI variables: `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, plus GitLab's built-in `CI_REGISTRY_*`.

---

## Image promotion

- **`:vX.Y.Z`** — pushed on every tag push for apps that changed. Production and DR are pinned to a specific tag via `argocd app set` and never auto-update.
- **`:latest`** — updated alongside `:vX.Y.Z` on every tag push. Staging points at this by default; also used as a Docker build cache source.

---

## Things to know before editing

- The frontend Docker build context is `apps/frontend/` — the Dockerfile lives there and uses plain `npm ci`.
- `apps/frontend/.env` is baked into the frontend image at build time (not excluded by `.dockerignore`). Update it before building the image when the backend address changes.
- When you change Helm values that drive in-cluster behaviour, also bump the chart's `version:` in `Chart.yaml` so ArgoCD detects the change as a new revision.
- Don't reintroduce nginx in the frontend container without thinking through OpenShift compatibility — the standard nginx image runs as root and binds port 80, both of which fail under the `restricted` SCC.
- Don't change `package.json` versions to `^x.y.z` ranges — see [`README.md`](./README.md#private-network--openshift) for why exact pinning matters in this environment.
- When adding a new app to the pipeline, you need to touch exactly four things: (1) add its path/image/helm-key variables to `common.yml`; (2) add its `_CHANGED` detection line to `detect.yml`; (3) create a new CI file for its build job; (4) add its `--helm-set` block to all three deploy scripts in `gitops.yml`.
- The Filebeat DaemonSet version (`FILEBEAT_VERSION` in `common.yml`) must stay in sync with the `FROM` tag in `apps/filebeat/Dockerfile` and the `image.tag` in `helm/charts/filebeat/values.yaml`.

---

## Related docs

- [`README.md`](./README.md) — project overview and quick start
- [`WORKFLOW.md`](./WORKFLOW.md) — end-to-end development and CI/CD pipeline
- [`RELEASING.md`](./RELEASING.md) — release / rollback runbook
