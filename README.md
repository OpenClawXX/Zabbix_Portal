# Zabbix Portal

A full-stack DevOps UI for managing Zabbix hosts, items, triggers, teams, and users — with role-based access control and a PostgreSQL-backed user database.

- **Backend** — Python 3.12 / FastAPI (`apps/backend/`)
- **Frontend** — React 18 / Next.js 15 App Router / TypeScript / MUI (`apps/frontend/`)
- **Filebeat** — Elastic log shipper, ships container logs to Elasticsearch (`apps/filebeat/`)
- **Deployment** — Helm charts + ArgoCD ApplicationSet (staging / production / DR)

> See [`CLAUDE.md`](./CLAUDE.md) for an architectural reference, [`WORKFLOW.md`](./WORKFLOW.md) for the CI/CD flow, and [`RELEASING.md`](./RELEASING.md) for the release process.

---

## Features

- JWT-based login with role-based access control
- Multi-role users — a user can hold multiple roles simultaneously
- Teams — group users and host assignments together
- Role cascade (Windows-style) — selecting a higher role auto-selects lower ones
- Users page — root sees all users platform-wide; team leads see their team
- Health check for API / Zabbix connectivity with live status dots in the sidebar
- List, create, and delete Zabbix hosts; tag hosts to teams
- Bulk-create hosts from `.csv` / `.xlsx`; export inventory to `.xlsx`
- Add monitoring items and triggers to hosts
- Toast-style notifications for all user actions

---

## Repository layout

```
apps/
  backend/    FastAPI app (Python 3.12) — Zabbix API wrapper + PostgreSQL user DB
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
- **PostgreSQL** 14+ (user/team database)
- **Docker** for local containers
- **Helm** 3.17+ and **kubectl** for cluster work
- Access to a Zabbix server with API credentials

---

## Environment files

The project uses three `.env` files — one per app. None are committed to git.

### `apps/backend/.env`

Required for the backend to start. Create this file before running the server.

```env
# ── Zabbix connection ────────────────────────────────────────
ZABBIX_URL=http://your-zabbix-server          # plain hostname works — /api_jsonrpc.php is added automatically
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix

# ── PostgreSQL ────────────────────────────────────────────────
# Format: postgresql://user:password@host:port/dbname
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zabbix_portal

# ── JWT signing key ───────────────────────────────────────────
# Change this to a long random string before any real deployment.
# Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=change-me-in-production

# ── Frontend proxy hint (not used by the backend itself) ─────
# Tells the Next.js route handler where to forward /api/* requests.
BACKEND_URL=http://localhost:6769
```

| Variable       | Required | Description |
| -------------- | -------- | ----------- |
| `ZABBIX_URL`   | Yes | Full URL of your Zabbix server |
| `ZABBIX_USER`  | Yes | Zabbix API user (must have API access) |
| `ZABBIX_PASS`  | Yes | Zabbix API password |
| `DATABASE_URL` | Yes | PostgreSQL connection string for the user/team database |
| `SECRET_KEY`   | Yes | Secret used to sign JWT tokens — **change before production** |
| `BACKEND_URL`  | No  | Read by the frontend proxy; defaults to `http://localhost:6769` |

On first startup the backend creates the schema and seeds an `admin` user with password `admin` and role `root`. **Change this password immediately after the first login.**

### `apps/frontend/.env`

Only one variable is needed. This file is **baked into the Docker image** at build time, so update it before building the image when the backend address changes.

```env
# Where the Next.js route handler forwards /api/* requests.
# Local dev:            http://localhost:6769
# Docker shared net:    http://backend:6769
# Mac/Windows Desktop:  http://host.docker.internal:6769
BACKEND_URL=http://localhost:6769
```

In local development (`npm run dev`) Next.js loads this file automatically. In the Docker image it is loaded once at server startup via `src/instrumentation.ts`.

### `apps/postgres/.env`

Used to initialise the PostgreSQL container. These values must match the credentials in `DATABASE_URL` inside `apps/backend/.env`.

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=zabbix_portal
```

| Variable            | Description |
| ------------------- | ----------- |
| `POSTGRES_USER`     | Database superuser created on first start |
| `POSTGRES_PASSWORD` | Password for that user |
| `POSTGRES_DB`       | Database created on first start — must match the `dbname` in `DATABASE_URL` |

---

## Quick start (local development)

```bash
# 1. Create the backend .env (see above)
cp apps/backend/.env.example apps/backend/.env   # or create from scratch

# 2. Start PostgreSQL (example using Docker)
docker run -d --name pg -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=zabbix_portal \
  postgres:16

# 3. Install backend Python deps and start the backend (port 6769)
cd apps/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn Zabbix_Main:app --host 0.0.0.0 --port 6769 --reload

# 4. In another terminal, install frontend deps and start the frontend (port 42069)
cd apps/frontend
npm install
npm run dev
```

Open <http://localhost:42069>. Log in with `admin` / `admin` and change the password.

The frontend proxies `/api/*` to `http://localhost:6769` via the Next.js catch-all route handler at `src/app/api/[...path]/route.ts`.

---

## Roles

| Role        | Level | Description |
| ----------- | ----- | ----------- |
| `root`      | 4     | Full platform access — create/delete teams, manage all users and hosts |
| `team_lead` | 3     | Full access within their team — users, hosts, assignments, passwords |
| `operator`  | 2     | Host and monitoring CRUD within the team — no user management |
| `member`    | 1     | Read-only access to the team's hosts |
| `auditor`   | —     | Read-only cross-team visibility (standalone — only root can grant this) |

A user can hold multiple roles. When a higher role is selected in the UI, lower roles in the hierarchy are automatically selected (Windows-style cascade). A user can only grant roles at or below their own level; only root can grant `auditor`.

---

## Running with Docker

A `docker-compose.yml` at the repo root wires all three services together (postgres → backend → frontend):

```bash
# Build and start everything
docker compose up -d --build

# View logs
docker compose logs -f

# Tear down (data volume is preserved)
docker compose down
```

Open <http://localhost:42069>. The backend waits for postgres to pass its healthcheck before starting.

### Running containers individually

If you need to run containers without docker compose:

```bash
# Build images
docker build -t zabbix-portal-postgres apps/postgres/
docker build -t zabbix-portal-backend  apps/backend/
docker build -t zabbix-portal-frontend apps/frontend/

# Shared network
docker network create zabbix-net

# PostgreSQL
docker run -d --name postgres --network zabbix-net \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zabbix_portal \
  -p 5432:5432 \
  zabbix-portal-postgres

# Backend
docker run -d --name backend --network zabbix-net \
  --env-file apps/backend/.env \
  -p 6769:6769 \
  zabbix-portal-backend

# Frontend
docker run -d --name frontend --network zabbix-net \
  -p 42069:42069 \
  zabbix-portal-frontend
```

Set `BACKEND_URL=http://backend:6769` in `apps/frontend/.env` and `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/zabbix_portal` in `apps/backend/.env` **before building** when all containers are on the same network.

---

## API endpoints

### Auth

| Method | Path            | Auth required | Description |
| ------ | --------------- | ------------- | ----------- |
| POST   | `/auth/login`   | No            | Login — returns a JWT |
| POST   | `/auth/logout`  | Yes           | Logout (client-side token discard) |
| POST   | `/auth/change-password` | Yes   | Change the current user's password |

### Status

| Method | Path      | Auth required | Description |
| ------ | --------- | ------------- | ----------- |
| GET    | `/health` | No            | API + Zabbix connectivity check |

### Hosts

| Method | Path                    | Auth required | Description |
| ------ | ----------------------- | ------------- | ----------- |
| GET    | `/hosts`                | Yes           | List hosts (filtered by team for non-root/auditor) |
| POST   | `/hosts`                | Operator+     | Create a single host |
| POST   | `/hosts/bulk`           | Operator+     | Bulk create from CSV / XLSX upload |
| GET    | `/hosts/download`       | Yes           | Export host inventory to `.xlsx` |
| DELETE | `/hosts/{hostname}`     | Operator+     | Delete a host |

### Items & Triggers

| Method | Path        | Auth required | Description |
| ------ | ----------- | ------------- | ----------- |
| POST   | `/items`    | Operator+     | Add a monitoring item to a host |
| POST   | `/triggers` | Operator+     | Add a trigger to an item |

### Teams

| Method | Path                              | Auth required | Description |
| ------ | --------------------------------- | ------------- | ----------- |
| GET    | `/teams`                          | Yes           | List teams and their members/hosts |
| POST   | `/teams`                          | Root          | Create a team |
| DELETE | `/teams/{team_id}`                | Root          | Delete a team |
| POST   | `/teams/{team_id}/users`          | Team Lead+    | Add a user to a team |
| DELETE | `/teams/{team_id}/users/{username}` | Team Lead+  | Remove a user from a team |
| POST   | `/teams/{team_id}/hosts`          | Team Lead+    | Assign a host to a team |
| DELETE | `/teams/{team_id}/hosts/{hostname}` | Team Lead+  | Remove a host from a team |
| POST   | `/teams/{team_id}/reset-password` | Team Lead+    | Reset a team member's password |

### Users

| Method | Path              | Auth required | Description |
| ------ | ----------------- | ------------- | ----------- |
| GET    | `/users`          | Team Lead+    | List users (root sees all; team lead sees their team) |
| POST   | `/users`          | Team Lead+    | Create a new user |
| PUT    | `/users/{id}`     | Team Lead+    | Update roles and/or team for a user |
| DELETE | `/users/{username}` | Team Lead+  | Delete a user |

### Overview

| Method | Path        | Auth required | Description |
| ------ | ----------- | ------------- | ----------- |
| GET    | `/overview` | Yes           | Dashboard stats (teams, hosts, users) |

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

Sensitive credentials (`ZABBIX_PASS`, `SECRET_KEY`, PostgreSQL password) should be placed in a Kubernetes Secret named `zabbix-portal-backend-secret` and referenced via `existingSecret` in Helm values — never baked into images or stored in plain ConfigMaps.

### ArgoCD

```bash
kubectl apply -f argocd/appproject.yaml
kubectl apply -f argocd/applicationset.yaml   # generates one Application per env
```

The ApplicationSet creates `zabbix-portal-dev`, `zabbix-portal-staging`, and `zabbix-portal-production` Applications. In-cluster the Ingress routes `/api/*` to the backend service directly — the frontend's `BACKEND_URL` is not used in that path.

---

## Private network / OpenShift

This project is designed to run in air-gapped or private-registry environments:

- All `FROM` lines in Dockerfiles have `# PRIVATE NETWORK:` comments showing the exact image and Artifactory replacement format.
- npm packages are pinned to **exact versions** (no `^` or `~`) and `.npmrc` enforces `frozen-lockfile=true`.
- The frontend container runs as a **Next.js standalone server** (`node server.js`) on port 42069 — no nginx, works under OpenShift's `restricted` SCC (non-root, random UID + GID 0).
- The Filebeat DaemonSet requires the `hostmount-anyuid` SCC on OpenShift.

See [`CLAUDE.md`](./CLAUDE.md) for the full set of private-network considerations.

---

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architectural reference and conventions
- [`WORKFLOW.md`](./WORKFLOW.md) — development + CI/CD pipeline flow
- [`RELEASING.md`](./RELEASING.md) — release / deployment process
