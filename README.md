# Zabbix Portal

A full-stack DevOps UI for managing Zabbix hosts, items, and triggers.

- **Backend** — Python 3.12 / FastAPI (`apps/backend/`)
- **Frontend** — React 18 / Next.js 15 App Router / TypeScript / MUI (`apps/frontend/`)
- **Filebeat** — Elastic log shipper, ships container logs to Elasticsearch (`apps/filebeat/`)
- **Toolchain** — npm, Biome
- **Deployment** — Helm charts + ArgoCD ApplicationSet (staging / production / DR)

> See [`CLAUDE.md`](./CLAUDE.md) for an architectural reference, [`WORKFLOW.md`](./WORKFLOW.md) for the end-to-end development and CI/CD flow, and [`RELEASING.md`](./RELEASING.md) for the release process.

---

## Features

- Health check for API / Zabbix connectivity with inline banners for backend/Zabbix errors
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
  frontend/   Next.js 15 App Router (TypeScript / MUI)
  filebeat/   Filebeat log shipper (Elastic 8.17)
helm/
  charts/
    backend/        standalone Helm chart
    frontend/       standalone Helm chart
    filebeat/       Filebeat DaemonSet chart
    zabbix-portal/  umbrella chart (depends on all three)
argocd/             AppProject, Application, ApplicationSet, per-env values
.gitlab/ci/         modular GitLab CI pipeline
biome.json          Biome (linter + formatter)
.npmrc              Frozen-lockfile / private-registry config
```

---

## Requirements

- **Python** 3.12+
- **Node.js** 22+
- **Docker** for local containers
- **Helm** 3.17+ and **kubectl** for cluster work
- Access to a Zabbix server with API credentials

---

## Quick start (local development)

```bash
# 1. Configure backend env
# Edit apps/backend/.env — set ZABBIX_URL, ZABBIX_USER, ZABBIX_PASS, BACKEND_URL

# 2. Install backend Python deps and start the backend (port 6769)
cd apps/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn Zabbix_Main:app --host 0.0.0.0 --port 6769 --reload

# 3. In another terminal, install frontend deps and start the frontend (port 42069)
cd apps/frontend
npm install
npm run dev
```

Open <http://localhost:42069>. The frontend proxies `/api/*` to `http://localhost:6769` via the Next.js route handler at `src/app/api/[...path]/route.ts`.

### Environment files

**`apps/backend/.env`** — required for both apps:

```
ZABBIX_URL=http://your-zabbix-server
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix
BACKEND_URL=http://localhost:6769
```

`BACKEND_URL` tells the frontend route handler where to forward API requests. Use `http://localhost:6769` for local dev, `http://host.docker.internal:6769` for Mac/Windows Docker Desktop, or `http://backend:6769` when both containers are on the same Docker network.

**`apps/frontend/.env`** — baked into the frontend Docker image:

```
BACKEND_URL=http://host.docker.internal:6769
```

Update this before building the frontend image when the backend address changes.

---

## Running with Docker

Each app is built and run independently. There is no docker-compose.

```bash
# Build images
docker build -t zabbix-portal-backend apps/backend/
docker build -t zabbix-portal-frontend apps/frontend/

# Create a shared network so the frontend can reach the backend by name
docker network create zabbix-net

# Run backend
docker run -d --name backend --network zabbix-net \
  --env-file apps/backend/.env \
  -p 6769:6769 \
  zabbix-portal-backend

# Run frontend
docker run -d --name frontend --network zabbix-net \
  -p 42069:42069 \
  zabbix-portal-frontend
```

Set `BACKEND_URL=http://backend:6769` in `apps/frontend/.env` before building when using the shared network above.

Open <http://localhost:42069>.

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
helm dependency build helm/charts/zabbix-portal/
helm install zabbix-portal helm/charts/zabbix-portal/ \
  --namespace zabbix-portal --create-namespace
```

### ArgoCD

```bash
kubectl apply -f argocd/appproject.yaml
kubectl apply -f argocd/applicationset.yaml   # generates one Application per env
```

The ApplicationSet creates `zabbix-portal-dev`, `zabbix-portal-staging`, and `zabbix-portal-production` Applications with environment-specific overrides. In-cluster, the Ingress routes `/api/*` to the backend service directly — the frontend route handler's `BACKEND_URL` is not used.

---

## Private network / OpenShift

This project is designed to run in air-gapped or private-registry environments:

- All `FROM` lines in Dockerfiles have `# PRIVATE NETWORK:` comments showing the exact image and replacement format.
- npm packages are pinned to **exact versions** (no `^` or `~`) and `.npmrc` enforces `frozen-lockfile=true`.
- The frontend container runs as a **Next.js standalone server** (`node server.js`) on port 42069 — no nginx, works under OpenShift's `restricted` SCC (non-root, random UID + GID 0).
- The Filebeat DaemonSet requires the `hostmount-anyuid` SCC on OpenShift to mount host log paths.

See [`CLAUDE.md`](./CLAUDE.md) for the full set of private-network considerations.

---

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architectural reference and conventions
- [`WORKFLOW.md`](./WORKFLOW.md) — development + CI/CD pipeline flow
- [`RELEASING.md`](./RELEASING.md) — release / deployment process
