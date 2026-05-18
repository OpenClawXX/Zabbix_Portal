# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A full-stack DevOps UI for managing a Zabbix monitoring server with role-based access control, team management, and a PostgreSQL user database. The backend exposes a REST API that wraps the Zabbix JSON-RPC API and manages users/teams; the frontend is a Next.js app that calls it. Primary operations: login/auth, manage teams and users, list/create/delete hosts, add monitoring items and triggers, bulk-import hosts from CSV/XLSX, export inventory to Excel.

The repo is set up for **air-gapped / private-registry** deployment on **OpenShift** (or vanilla Kubernetes), with Helm charts and ArgoCD ApplicationSet across dev / staging / production.

---

## Monorepo layout

```
apps/
  backend/          Python 3.12 / FastAPI — Zabbix wrapper + PostgreSQL user/team DB
  frontend/         React 18 / Next.js 15 App Router / TypeScript / MUI
  postgres/         PostgreSQL 16 — user/team database (Dockerfile + .env)
  filebeat/         Elastic Filebeat 8.17 — ships container logs to Elasticsearch
helm/
  charts/
    backend/        standalone Helm chart
    frontend/       standalone Helm chart
    filebeat/       Filebeat DaemonSet chart
    zabbix-portal/  umbrella chart depending on all three
argocd/             AppProject, Application, ApplicationSet, per-env values
.gitlab/ci/         modular GitLab CI pipeline
docker-compose.yml  local orchestration (postgres → backend → frontend)
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

The easiest way to run all services together is docker compose from the repo root:

```bash
# Build and start postgres + backend + frontend
docker compose up -d --build

# Tear down (data volume is preserved)
docker compose down
```

The compose file starts postgres first (with a healthcheck), then backend, then frontend. All three are on the default compose network so they can reach each other by container name.

To run containers individually without docker compose:

```bash
docker network create zabbix-net

docker run -d --name postgres --network zabbix-net \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zabbix_portal \
  -p 5432:5432 \
  zabbix-portal-postgres

docker run -d --name backend --network zabbix-net \
  --env-file apps/backend/.env \
  -p 6769:6769 \
  zabbix-portal-backend

docker run -d --name frontend --network zabbix-net \
  -p 42069:42069 \
  zabbix-portal-frontend
```

Set `BACKEND_URL=http://backend:6769` in `apps/frontend/.env` and `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/zabbix_portal` in `apps/backend/.env` when all containers are on the same network.

---

## Backend architecture

```mermaid
flowchart LR
    ZabbixBase --> Host_Manager
    ZabbixBase --> Item_Manager
    Database.py --> main["Zabbix_Main.py"]
    Auth.py --> main
    User_Management.py --> main
    Host_Manager --> main
    Item_Manager --> main
```

- **`ZabbixBase`** loads `apps/backend/.env` and creates a `zabbix_utils.ZabbixAPI` session. All Zabbix managers inherit from it. `self.zapi` is `None` when Zabbix is unreachable — callers must guard against this.
- **`Host_Manager`** wraps host CRUD and Excel export (`openpyxl` / `pandas`).
- **`Item_Manager`** wraps item and trigger creation. Trigger expressions follow Zabbix 5.x classic format: `{hostname:item_key.last()} operator threshold`.
- **`Database.py`** owns the PostgreSQL connection (`psycopg2`), creates the schema on startup (`init_db()`), and runs idempotent migrations. Tables: `teams`, `team_users` (with `roles TEXT[]`), `host_assignments`.
- **`Auth.py`** handles password hashing (`bcrypt`), JWT creation/validation (`python-jose`), and FastAPI dependency functions: `get_current_user`, `require_root`, `require_admin`, `require_operator`. Also exports `can_grant_roles()` — the guard that prevents users from granting roles higher than their own.
- **`User_Management.py`** contains all SQL queries for users, teams, host assignments, and the overview aggregation. Seeds a default `admin`/`admin` root user on first startup.
- **`Zabbix_Main.py`** instantiates `Host_Manager`, `Item_Manager`, calls `init_db()` and `seed_root()` at module load. All route handlers live here. There is no dependency injection.
- FastAPI runs on **port 6769** locally and in Docker/Kubernetes.

Required environment variables (in `apps/backend/.env`):

```
ZABBIX_URL=http://your-zabbix-server
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zabbix_portal

# Long random string — generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=change-me-in-production

BACKEND_URL=http://localhost:6769
```

- `DATABASE_URL` — PostgreSQL connection string. The backend creates the schema and runs migrations on every startup (idempotent).
- `SECRET_KEY` — signs JWT tokens. **Must be changed before any real deployment.** If rotated, all existing tokens are immediately invalidated.
- `BACKEND_URL` — consumed by the frontend, not the backend itself — it lives here so there is one `.env` file to maintain.

These can be supplied in two ways:
- **Local development** — place them in `apps/backend/.env` (loaded by `python-dotenv`).
- **Kubernetes / OpenShift** — inject them via a ConfigMap (non-sensitive values) or Secret (`ZABBIX_PASS`, `SECRET_KEY`, DB password). Mount via `envFrom`. Do not bake `.env` files into container images.

The Zabbix URL is normalised — either `http://host` or `http://host/api_jsonrpc.php` works.

---

## Frontend architecture

- All API calls go through the thin client in `src/app/api.ts`. Every call is prefixed with `/api` — all environments route through the same Next.js route handler. The client holds the JWT in `localStorage` and attaches it as a `Bearer` token on every request. On a 401 it clears the token and redirects to `/login` (except during the login call itself, which passes `{ skipRedirect: true }`).
- **API proxying** — `src/app/api/[...path]/route.ts` is a catch-all route handler that proxies every `/api/*` request to `BACKEND_URL` at request time. `BACKEND_URL` defaults to `http://localhost:6769` if not set.
- **`BACKEND_URL` loading** — `src/instrumentation.ts` runs `dotenv.config()` once at server startup, loading `apps/frontend/.env` (baked into the image at build time). In dev, Next.js loads `.env` automatically.
- **Auth context** — `src/app/context/AuthContext.tsx` holds the decoded JWT payload (`AuthUser`: `id`, `username`, `roles: string[]`, `team_id`). Consumed throughout the app via `useAuth()`.
- Routing: Next.js App Router (`src/app/`). Routes: `page.tsx` (/), `hosts/page.tsx`, `items/page.tsx`, `teams/page.tsx`, `users/page.tsx`, `login/page.tsx`. Each thin page file re-exports the real view component from `src/views/`.
- Root layout: `src/app/layout.tsx` (server component — html/body/AppRouterCacheProvider). Providers: `src/app/providers.tsx` (client boundary — ThemeProvider + AppShell). The login page bypasses AppShell.
- Theme: `src/app/theme.ts` (MUI v5, dark/light toggle persisted in `localStorage`).
- Shell: `src/app/layout/AppShell.tsx` — polls `/api/health` every **15 s** and shows live status dots (green/red) for Backend API and Zabbix in the sidebar. The Users nav item is hidden for non-admin roles (`root` and `team_lead` can see it).
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
- `SECRET_KEY` in `apps/backend/.env` must be a long random string in any real deployment. Rotating it invalidates all existing JWT sessions immediately.
- The database schema is created and migrated automatically on every backend startup (`init_db()` in `Database.py`). Migrations are idempotent — safe to run against existing data. No manual migration step is needed.
- On first startup the backend seeds an `admin` user with password `admin` and role `root`. This account must have its password changed before the system is used in any real environment.
- Roles are stored as a PostgreSQL `TEXT[]` array in `team_users.roles`. A user can hold multiple roles simultaneously. The JWT `roles` claim is a JSON array.
- `can_grant_roles()` in `Auth.py` is enforced on both `POST /users` and `PUT /users/{id}`. It prevents any user from granting a role higher than their own. Only `root` can grant `auditor`.
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
