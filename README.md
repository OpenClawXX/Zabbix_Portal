# Zabbix Portal

A full-stack DevOps UI for managing Zabbix hosts, items, triggers, teams, and users — with role-based access control, live metrics, custom alert rules, and a PostgreSQL-backed user database.

- **Backend** — Python 3.12 / FastAPI (`apps/backend/`)
- **Frontend** — React 18 / Next.js 15 App Router / TypeScript / MUI (`apps/frontend/`)
- **Database** — PostgreSQL (shared / external — not deployed by this repo)
- **Deployment** — Helm charts, deployed via GitLab CI (`helm upgrade --install`). ArgoCD manifests in `argocd/` are a planned future path, not yet wired in.

> See [`CLAUDE.md`](./CLAUDE.md) for an architectural reference, [`WORKFLOW.md`](./WORKFLOW.md) for the CI/CD flow, [`RELEASING.md`](./RELEASING.md) for the release process, and [`PRIVATE_NETWORK.md`](./PRIVATE_NETWORK.md) for the air-gapped configuration checklist.

---

## Features

- JWT-based login with role-based access control
- Multi-role users — a user can hold multiple roles simultaneously
- Teams — group users and host assignments together
- Role cascade (Windows-style) — selecting a higher role auto-selects lower ones
- Users page — root sees all users platform-wide; team leads see their team
- List, create, and delete Zabbix hosts; tag hosts to teams
- Bulk-create hosts from `.csv` / `.xlsx`; export inventory to `.xlsx`
- Add and delete monitoring items and triggers on hosts
- **Dashboard** — native Zabbix graphs, per-host last-value metrics, recent items; saveable per-user / per-team widget layouts
- **Metrics** — live active-problems table, item-history charts, and custom alert rules (threshold conditions with severities)
- Desktop notifications + audible alerts in the sidebar when new problems fire
- Real-time updates via Server-Sent Events — the UI refreshes when the backend syncs with Zabbix
- Health check for API / Zabbix connectivity with live status dots in the sidebar
- Toast-style notifications for all user actions

---

## Repository layout

```
apps/
  backend/    FastAPI app (Python 3.12) — Zabbix API wrapper + PostgreSQL user DB
  frontend/   Next.js 15 App Router (TypeScript / MUI)
helm/
  charts/
    backend/        standalone Helm chart
    frontend/       standalone Helm chart
    zabbix-portal/  umbrella chart (depends on backend + frontend)
argocd/             AppProject, ApplicationSet, per-env values (planned — not yet active)
.gitlab/ci/         modular GitLab CI pipeline
biome.json          Biome (linter + formatter)
.npmrc              Exact-version / private-registry config
docker-compose.yml  local orchestration (backend + frontend)
```

> PostgreSQL is a **shared/external** database. It is not in `apps/` and not deployed by Helm — the backend connects to it via `DATABASE_URL`.

---

## Requirements

- **Python** 3.12+
- **Node.js** 22+
- **PostgreSQL** 14+ (shared user/team database)
- **Docker** for local containers
- **Helm** 3.17+ and **kubectl** for cluster work
- Access to a Zabbix server with API credentials

---

## Environment files

The project uses two `.env` files — one per app. Neither is committed to git.

### `apps/backend/.env`

Required for the backend to start. Create this file before running the server.

```env
# ── Zabbix connection ────────────────────────────────────────
ZABBIX_URL=http://your-zabbix-server          # plain hostname works — /api_jsonrpc.php is added automatically
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix
# Set to false ONLY on a trusted private network with a self-signed cert.
ZABBIX_SSL_VERIFY=true

# ── PostgreSQL (shared/external) ──────────────────────────────
# Format: postgresql://user:password@host:port/dbname
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zabbix_portal

# ── JWT signing key ───────────────────────────────────────────
# Change this to a long random string before any real deployment.
# Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=change-me-in-production

# ── Seed root account (first boot only) ──────────────────────
# If ADMIN_PASSWORD is unset, the backend seeds 'admin' with a logged warning.
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=change-me

# ── Frontend proxy hint (not used by the backend itself) ─────
# Tells the Next.js route handler where to forward /api/* requests.
BACKEND_URL=http://localhost:6769
```

| Variable            | Required | Description |
| ------------------- | -------- | ----------- |
| `ZABBIX_URL`        | Yes | Full URL of your Zabbix server |
| `ZABBIX_USER`       | Yes | Zabbix API user (must have API access) |
| `ZABBIX_PASS`       | Yes | Zabbix API password |
| `ZABBIX_SSL_VERIFY` | No  | TLS verification for the Zabbix API probe; `true` by default |
| `DATABASE_URL`      | Yes | PostgreSQL connection string for the shared user/team database |
| `SECRET_KEY`        | Yes | Secret used to sign JWT tokens — **change before production** |
| `ADMIN_USERNAME`    | No  | Seed root username (default `Admin`) |
| `ADMIN_PASSWORD`    | No  | Seed root password (default `admin`, with a startup warning) |
| `BACKEND_URL`       | No  | Read by the frontend proxy; defaults to `http://localhost:6769` |

On first startup the backend creates the schema and seeds a root user (`ADMIN_USERNAME` / `ADMIN_PASSWORD`). **Change this password immediately after the first login.**

### `apps/frontend/.env`

Only one variable is needed. This file is **baked into the Docker image** at build time, so update it before building the image when the backend address changes.

```env
# Where the Next.js route handler forwards /api/* requests.
# Local dev:            http://localhost:6769
# Docker shared net:    http://backend:6769
# Mac/Windows Desktop:  http://host.docker.internal:6769
BACKEND_URL=http://localhost:6769
```

In local development (`npm run dev`) Next.js loads this file automatically. In the Docker image it is loaded once at server startup via `src/instrumentation.ts`. In-cluster the Route handles `/api/*`, so this value is unused there.

---

## Quick start (local development)

```bash
# 1. Create apps/backend/.env (see above), pointing DATABASE_URL at your shared
#    PostgreSQL — or start a throwaway local one:
docker run -d --name pg -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=zabbix_portal \
  postgres:16

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

Open <http://localhost:42069>. Log in with your seeded root account and change the password.

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

A `docker-compose.yml` at the repo root wires the two app services together. PostgreSQL is external — set `DATABASE_URL` in `apps/backend/.env` to point at your shared instance.

```bash
# Build and start backend + frontend
docker compose up -d --build

# View logs
docker compose logs -f

# Tear down
docker compose down
```

Open <http://localhost:42069>.

### Running containers individually

```bash
# Build images
docker build -t zabbix-portal-backend  apps/backend/
docker build -t zabbix-portal-frontend apps/frontend/

# Shared network
docker network create zabbix-net

# Backend (DATABASE_URL in .env points at your shared PostgreSQL)
docker run -d --name backend --network zabbix-net \
  --env-file apps/backend/.env \
  -p 6769:6769 \
  zabbix-portal-backend

# Frontend
docker run -d --name frontend --network zabbix-net \
  -p 42069:42069 \
  zabbix-portal-frontend
```

Set `BACKEND_URL=http://backend:6769` in `apps/frontend/.env` **before building** when both containers are on the same network.

---

## API endpoints

All paths require a `Bearer` JWT unless noted. "Operator+" = root / team_lead / operator; "Team Lead+" = root / team_lead; "Root" = root only.

### Auth

| Method | Path            | Auth | Description |
| ------ | --------------- | ---- | ----------- |
| POST   | `/auth/login`   | No   | Login — returns a JWT |
| GET    | `/auth/me`      | Yes  | Decoded current user |

### Status & sync

| Method | Path                      | Auth | Description |
| ------ | ------------------------- | ---- | ----------- |
| GET    | `/health`                 | No   | API + Zabbix connectivity check |
| POST   | `/sync`                   | Root | Trigger a full bidirectional Zabbix sync now |
| GET    | `/sync/debug/{team_name}` | Root | Inspect Zabbix groups/permissions for a team |
| GET    | `/events`                 | Yes  | Server-Sent Events stream for real-time sync |

### Hosts

| Method | Path                | Auth      | Description |
| ------ | ------------------- | --------- | ----------- |
| GET    | `/hosts`            | Yes       | List hosts (filtered by team for non-root/auditor) |
| GET    | `/hosts/download`   | Yes       | Export host inventory to `.xlsx` |
| POST   | `/hosts`            | Operator+ | Create a single host |
| POST   | `/hosts/bulk`       | Operator+ | Bulk create from CSV / XLSX upload |
| DELETE | `/hosts/{hostname}` | Operator+ | Delete a host |

### Items & Triggers

| Method | Path                     | Auth      | Description |
| ------ | ------------------------ | --------- | ----------- |
| GET    | `/items/{hostname}`      | Yes       | List items for a host |
| POST   | `/items`                 | Operator+ | Add a monitoring item to a host |
| DELETE | `/items/{itemid}`        | Operator+ | Delete an item |
| GET    | `/triggers/{hostname}`   | Yes       | List triggers for a host |
| POST   | `/triggers`              | Operator+ | Add a trigger to an item |
| DELETE | `/triggers/{triggerid}`  | Operator+ | Delete a trigger |

### Metrics

| Method | Path                        | Auth | Description |
| ------ | --------------------------- | ---- | ----------- |
| GET    | `/metrics/problems`         | Yes  | Active Zabbix problems |
| GET    | `/metrics/history/{itemid}` | Yes  | Item history time-series (`?minutes=`) |

### Dashboard

| Method | Path                                   | Auth | Description |
| ------ | -------------------------------------- | ---- | ----------- |
| GET    | `/dashboard/graphs`                    | Yes  | List Zabbix graphs (`?hostid=`) |
| GET    | `/dashboard/graphs/{graphid}/image`    | Yes  | Proxy native Zabbix graph PNG |
| GET    | `/dashboard/graphs/{graphid}/data`     | Yes  | Chart.js series for a graph |
| GET    | `/dashboard/hosts/metrics`             | Yes  | Last metric values for all hosts |
| GET    | `/dashboard/items/recent`              | Yes  | Recently created items |
| GET    | `/dashboard/layout`                    | Yes  | Saved widget layout (`?scope=user\|team`) |
| PUT    | `/dashboard/layout`                    | Yes  | Save widget layout |

### Teams

| Method | Path                                | Auth       | Description |
| ------ | ----------------------------------- | ---------- | ----------- |
| GET    | `/teams/overview`                   | Yes        | Teams with members and assigned hosts |
| GET    | `/teams`                            | Yes        | List teams |
| POST   | `/teams`                            | Root       | Create a team |
| DELETE | `/teams/{team_id}`                  | Root       | Delete a team |
| POST   | `/teams/{team_id}/hosts`            | Team Lead+ | Assign a host to a team |
| DELETE | `/teams/{team_id}/hosts/{hostname}` | Team Lead+ | Remove a host from a team |

### Users

| Method | Path                       | Auth       | Description |
| ------ | -------------------------- | ---------- | ----------- |
| GET    | `/users`                   | Team Lead+ | List users (root sees all; team lead sees their team) |
| POST   | `/users`                   | Team Lead+ | Create a new user |
| PUT    | `/users/{user_id}`         | Team Lead+ | Update roles and/or team |
| PUT    | `/users/{user_id}/password`| Team Lead+ | Change a user's password |
| DELETE | `/users/{user_id}`         | Team Lead+ | Delete a user |

### Alerts

| Method | Path                            | Auth | Description |
| ------ | ------------------------------- | ---- | ----------- |
| GET    | `/alerts/rules`                 | Yes  | List the current user's alert rules |
| POST   | `/alerts/rules`                 | Yes  | Create an alert rule (threshold condition) |
| DELETE | `/alerts/rules/{rule_id}`       | Yes  | Delete an alert rule |
| PATCH  | `/alerts/rules/{rule_id}/toggle`| Yes  | Enable/disable an alert rule |
| GET    | `/alerts/events`                | Yes  | Recent alert events for the current user |

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

### Helm (current method)

Deployments run from GitLab CI via `helm upgrade --install` against each cluster's API. To deploy manually:

```bash
helm dependency build helm/charts/zabbix-portal/
helm upgrade --install zabbix-portal helm/charts/zabbix-portal/ \
  --namespace zabbix-portal \
  -f helm/charts/zabbix-portal/values.yaml \
  -f helm/charts/zabbix-portal/values-staging.yaml \
  --set backend.image.tag=vX.Y.Z \
  --set frontend.image.tag=vX.Y.Z \
  --wait --timeout 5m
```

Sensitive credentials (`ZABBIX_PASS`, `SECRET_KEY`, the DB connection string) belong in a Kubernetes Secret referenced via `existingSecret` in Helm values — never baked into images or stored in plain ConfigMaps. See [`RELEASING.md`](./RELEASING.md) for the full release runbook.

### ArgoCD (planned, not yet active)

The `argocd/` directory contains an AppProject, ApplicationSet, and per-environment values for a future GitOps migration. These are **not applied by the current pipeline** — they are scaffolding for when the project switches from direct Helm to ArgoCD-reconciled deploys.

---

## Private network / OpenShift

This project is designed to run in air-gapped or private-registry environments:

- All `FROM` lines in Dockerfiles have `# PRIVATE NETWORK:` comments showing the exact image and Artifactory replacement format.
- npm packages are pinned to **exact versions** (no `^` or `~`) and `.npmrc` is set up for a private registry.
- Both containers run as **non-root** (`USER 1001`, GID 0) — the frontend as a Next.js standalone server (`node server.js`) on port 42069, with no nginx, so they work under OpenShift's `restricted` SCC.

See [`PRIVATE_NETWORK.md`](./PRIVATE_NETWORK.md) for the complete line-by-line checklist of every value to change, and [`CLAUDE.md`](./CLAUDE.md) for the architectural rationale.

---

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architectural reference and conventions
- [`WORKFLOW.md`](./WORKFLOW.md) — development + CI/CD pipeline flow
- [`RELEASING.md`](./RELEASING.md) — release / deployment runbook
- [`PRIVATE_NETWORK.md`](./PRIVATE_NETWORK.md) — air-gapped configuration checklist
- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — running the stack with Docker
