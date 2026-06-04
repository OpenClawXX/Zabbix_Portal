# Running with Docker

This guide covers building and running the backend and frontend as standalone Docker containers. No Python or Node.js installation required on your machine.

---

## Prerequisites

- **Docker** 24+ with Docker Desktop (Mac / Windows) or Docker Engine (Linux)

---

## Stack overview

```
Browser
  └── frontend (Next.js :42069)
        └── /api/* → route handler → backend (FastAPI :6769)
                                          ├── Zabbix JSON-RPC
                                          └── PostgreSQL (shared/external)
```

The Next.js route handler at `src/app/api/[...path]/route.ts` proxies all `/api/*` requests to the backend. The backend address is controlled by `BACKEND_URL` in `apps/frontend/.env`, which is baked into the frontend image at build time.

PostgreSQL is **not** part of this stack — it is a shared/external database. The backend reaches it via `DATABASE_URL` in `apps/backend/.env`.

---

## One-time setup

### 1. Configure the backend environment file

Create `apps/backend/.env` (required — the backend will not start without it):

```
ZABBIX_URL=http://your-zabbix-server
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix

# Shared/external PostgreSQL — point this at your DB host
DATABASE_URL=postgresql://postgres:postgres@<db-host>:5432/zabbix_portal

# Long random string — signs JWT tokens
SECRET_KEY=change-me-in-production

BACKEND_URL=http://backend:6769
```

`DATABASE_URL` must reach your shared PostgreSQL from inside the container — use the DB's reachable host/IP, not `localhost` (which would resolve to the container itself). `BACKEND_URL` is used by the frontend, not the backend process itself; set it to `http://backend:6769` when running both containers on the same Docker network (the recommended setup below).

### 2. Configure the frontend environment file

Edit `apps/frontend/.env`:

```
BACKEND_URL=http://backend:6769
```

| Scenario | Value |
|---|---|
| Both containers on the same Docker network | `http://backend:6769` |
| Mac / Windows Docker Desktop, backend running natively | `http://host.docker.internal:6769` |
| Linux server, backend on the same host | `http://<host-ip>:6769` |

This file is baked into the image — rebuild the frontend image after changing it.

---

## Build images

```bash
# Backend — build context is apps/backend/
docker build -t zabbix-portal-backend apps/backend/

# Frontend — build context is apps/frontend/
docker build -t zabbix-portal-frontend apps/frontend/
```

---

## Run the stack

### Recommended: shared Docker network

Containers on the same network reach each other by container name.

```bash
# Create the network once
docker network create zabbix-net

# Backend
docker run -d \
  --name backend \
  --network zabbix-net \
  --env-file apps/backend/.env \
  -p 6769:6769 \
  zabbix-portal-backend

# Frontend
docker run -d \
  --name frontend \
  --network zabbix-net \
  -p 42069:42069 \
  zabbix-portal-frontend
```

Open <http://localhost:42069>.

### Stopping

```bash
docker stop frontend backend
docker rm frontend backend
```

---

## Common operations

### View logs

```bash
docker logs -f frontend
docker logs -f backend
```

### Rebuild a single image after a code change

```bash
docker build -t zabbix-portal-frontend apps/frontend/
docker stop frontend && docker rm frontend
docker run -d --name frontend --network zabbix-net -p 42069:42069 zabbix-portal-frontend
```

### Open a shell inside a running container

```bash
docker exec -it backend bash
docker exec -it frontend sh
```

---

## Health check

The frontend polls `/api/health` every 15 seconds. The sidebar shows two live status dots — one for the Backend API and one for Zabbix (green = up, red = down). On mobile, the top bar shows a single "Healthy" / "Degraded" chip.

The backend exposes its own health endpoint directly:

```bash
curl http://localhost:6769/health
```

---

## Private network

**Docker base images** — every `FROM` line in the Dockerfiles has a `# PRIVATE NETWORK:` comment with the exact image path. Replace the public image with your internal mirror.

**npm packages** — in `apps/frontend/Dockerfile`, uncomment the `npm config set registry` line and set it to your Artifactory / Nexus npm proxy URL.

**pip packages** — in `apps/backend/Dockerfile`, uncomment the `--index-url` flag on the `pip install` line and set it to your internal PyPI proxy.
