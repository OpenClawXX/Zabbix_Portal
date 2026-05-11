# Zabbix Portal

A full-stack DevOps UI for managing Zabbix hosts, items, and triggers — packaged as a Turborepo monorepo with first-class support for Kubernetes / OpenShift deployment via Helm + ArgoCD.

- **Backend** — Python 3.12 / FastAPI (`apps/backend/`)
- **Frontend** — React 18 / Vite / TypeScript / MUI (`apps/frontend/`)
- **Filebeat** — Elastic log shipper, ships container logs to Elasticsearch (`apps/filebeat/`)
- **Toolchain** — pnpm workspaces, Turborepo, Biome
- **Deployment** — Helm charts + ArgoCD ApplicationSet (staging / production / DR)

> See [`CLAUDE.md`](./CLAUDE.md) for an architectural reference, [`WORKFLOW.md`](./WORKFLOW.md) for the end-to-end development and CI/CD flow, and [`RELEASING.md`](./RELEASING.md) for the release process.

---

## Features

- Health check for API / Zabbix connectivity
- Create, list, delete hosts
- Bulk-create hosts from `.csv` / `.xlsx`
- Export host inventory to `.xlsx`
- Add monitoring items and triggers to hosts
- Toast-style notifications for all user actions

---

## Repository layout

```
apps/
  backend/    FastAPI app (Python 3.12)
  frontend/   React/Vite SPA (TypeScript)
  filebeat/   Filebeat log shipper (Elastic 8.17)
helm/
  charts/
    backend/        standalone Helm chart
    frontend/       standalone Helm chart
    filebeat/       Filebeat DaemonSet chart
    zabbix-portal/  umbrella chart (depends on all three)
argocd/             AppProject, Application, ApplicationSet, per-env values
.gitlab/ci/         modular GitLab CI pipeline (common, detect, python, node, elastic, gitops, cleanup)
turbo.json          Turborepo task pipeline
biome.json          Biome (linter + formatter)
pnpm-workspace.yaml pnpm workspace declaration
.npmrc              Frozen-lockfile / private-registry config
docker-compose.yml  Local stack (backend + frontend + Elasticsearch + Filebeat)
```

---

## Requirements

- **Python** 3.12+
- **Node.js** 22+ and **pnpm** 9.15+
- **Docker** + Docker Compose for local containers
- **Helm** 3.17+ and **kubectl** for cluster work
- Access to a Zabbix server with API credentials

Install pnpm if needed:

```bash
corepack enable && corepack prepare pnpm@9.15.4 --activate
```

---

## Quick start (local development)

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Configure backend env (copy and edit)
cp apps/backend/.env.example apps/backend/.env  # set ZABBIX_URL, ZABBIX_USER, ZABBIX_PASS

# 3. Install backend Python deps
cd apps/backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../..

# 4. Start backend (port 6769)
pnpm --filter @zabbix-portal/backend dev

# 5. In another terminal, start frontend (port 42069)
pnpm --filter @zabbix-portal/frontend dev
```

Open <http://localhost:42069>. The frontend proxies `/api/*` to `http://localhost:6769` via `vite.config.ts`.

### `.env` for the backend

Place at `apps/backend/.env`:

```
ZABBIX_URL=http://your-zabbix-server
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix
```

The URL accepts either a base URL or the full `…/api_jsonrpc.php` endpoint.

---

## Available scripts (root)

```bash
pnpm build       # turbo build across all workspaces
pnpm dev         # turbo dev across all workspaces
pnpm lint        # turbo lint (Biome on frontend, ruff on backend)
pnpm typecheck   # turbo typecheck (tsc on frontend, mypy on backend)
pnpm format      # biome format --write .
pnpm check       # biome check --write .
pnpm docker:build
pnpm docker:up
pnpm docker:down
```

Filter to a single app with `--filter`:

```bash
pnpm turbo build --filter=@zabbix-portal/frontend
pnpm turbo lint  --filter=@zabbix-portal/backend
```

---

## Local Docker

```bash
docker compose up --build
```

- Backend → http://localhost:8000
- Frontend → http://localhost:8080
- Elasticsearch → http://localhost:9200

The full stack includes Elasticsearch and Filebeat. Filebeat ships container logs to Elasticsearch automatically. Set `ELASTICSEARCH_PASSWORD` in the Filebeat service environment before starting if your cluster has auth enabled (it is disabled by default in the local compose file for convenience).

The frontend is served by [`serve`](https://www.npmjs.com/package/serve) (no nginx) on port 8080. Inside the cluster, `/api/*` routing to the backend is handled by the Ingress (see `helm/charts/frontend/templates/ingress.yaml` — `apiProxy.enabled`).

---

## API endpoints

| Method | Path                       | Description                           |
| ------ | -------------------------- | ------------------------------------- |
| GET    | `/health`                  | API + Zabbix connectivity check       |
| GET    | `/hosts`                   | List all hosts                        |
| POST   | `/hosts`                   | Create a single host                  |
| POST   | `/hosts/bulk`              | Bulk create from CSV / XLSX upload    |
| GET    | `/hosts/download`          | Download host inventory as `.xlsx`    |
| DELETE | `/hosts/{hostname}`        | Delete a host                         |
| POST   | `/items`                   | Add a monitoring item to a host       |
| POST   | `/triggers`                | Add a trigger to an item              |

### Bulk import file format

CSV or XLSX with columns:

- `hostname` (or `host`) — required
- `ip` (or `ip_address`) — required
- `template` — optional, defaults to `Linux by Zabbix agent`

### Trigger expression format

```
{hostname:item_key.last()} operator threshold

# Example:
{web-01:system.cpu.load.last()}>5
```

---

## Production deployment

### Helm

```bash
# From repo root
helm dependency build helm/charts/zabbix-portal/
helm install zabbix-portal helm/charts/zabbix-portal/ \
  --namespace zabbix-portal --create-namespace
```

### ArgoCD

```bash
kubectl apply -f argocd/appproject.yaml
kubectl apply -f argocd/applicationset.yaml   # generates one Application per env
```

The ApplicationSet creates `zabbix-portal-dev`, `zabbix-portal-staging`, and `zabbix-portal-production` Applications with environment-specific overrides.

---

## Private network / OpenShift

This project is designed to run in air-gapped or private-registry environments:

- All `FROM` lines in Dockerfiles have `# PRIVATE NETWORK:` comments showing the exact image and replacement format — including the Filebeat base image (`docker.elastic.co/beats/filebeat:8.17.0`).
- The Elasticsearch URL in `apps/filebeat/filebeat.yml`, `helm/charts/filebeat/values.yaml`, and `docker-compose.yml` all have `# PRIVATE NETWORK:` comments for the internal cluster address.
- npm packages are pinned to **exact versions** (no `^` or `~`) and `.npmrc` enforces `frozen-lockfile=true`.
- The frontend container uses **`serve` instead of nginx** so it works under OpenShift's `restricted` SCC (non-root, port 8080, random UID + GID 0).
- The Filebeat DaemonSet requires the `hostmount-anyuid` SCC on OpenShift to mount host log paths — see `helm/charts/filebeat/values.yaml` for the exact `oc adm policy` command.

See [`CLAUDE.md`](./CLAUDE.md) for the full set of private-network considerations.

---

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architectural reference and conventions
- [`WORKFLOW.md`](./WORKFLOW.md) — development + CI/CD pipeline flow
- [`RELEASING.md`](./RELEASING.md) — release / deployment process
