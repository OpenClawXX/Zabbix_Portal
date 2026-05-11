# Running with Docker Compose

This guide covers building and running the full stack locally using Docker and Docker Compose. No Node.js or Python installation required on your machine.

---

## Prerequisites

- **Docker** 24+ with the Compose plugin (`docker compose`)  
  Verify: `docker compose version`

---

## Stack overview

```
Browser
  └── proxy (nginx :80)
        ├── /api/*  →  backend (FastAPI :8000)
        └── /*      →  frontend (serve :8080)

filebeat (optional) → your Elasticsearch server
```

The nginx proxy container replicates what the Kubernetes Ingress does in production — the frontend React app makes all API calls to `/api/*` as relative paths, so without the proxy those calls would fail.

---

## One-time setup

### 1. Create the backend environment file

The backend container will not start without this file.

Create `apps/backend/.env`:

```
ZABBIX_URL=http://your-zabbix-server
ZABBIX_USER=Admin
ZABBIX_PASS=zabbix
```

The URL accepts either a base URL (`http://host`) or the full endpoint (`http://host/api_jsonrpc.php`).

### 2. Configure Filebeat (optional)

If you want container logs shipped to Elasticsearch, open `docker-compose.yml` and fill in the Filebeat environment block:

```yaml
  filebeat:
    environment:
      - ELASTICSEARCH_HOSTS=https://your-elasticsearch:9200   # UPDATE ME
      - ELASTICSEARCH_USER=elastic
      - ELASTICSEARCH_PASSWORD=your-password
```

If you do not need log shipping, you can skip this or comment out the `filebeat` service entirely.

---

## Build and start

```bash
# Build all images and start the stack (runs in foreground, Ctrl+C to stop)
docker compose up --build

# Or run in the background
docker compose up --build -d
```

The first build takes a few minutes — subsequent builds reuse Docker layer cache.

The stack is ready when you see the backend health check pass:

```
zabbix-portal-backend  | INFO:     Application startup complete.
zabbix-portal-proxy    | ...nginx started
```

---

## Access points

| URL | What it is |
|-----|-----------|
| `http://localhost` | Full application UI (use this) |
| `http://localhost/api/docs` | FastAPI interactive API docs |
| `http://localhost:8000` | Backend API directly (bypasses proxy) |
| `http://localhost:8000/health` | Health check endpoint |

---

## Common operations

### View logs

```bash
# All services
docker compose logs -f

# One service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f proxy
docker compose logs -f filebeat
```

### Stop the stack

```bash
docker compose down
```

### Rebuild a single service after a code change

```bash
docker compose up --build backend -d
docker compose up --build frontend -d
```

### Open a shell inside a running container

```bash
docker compose exec backend bash
docker compose exec frontend sh
```

### Check container status

```bash
docker compose ps
```

---

## Building images individually

Useful for testing a single Dockerfile or pushing to a registry manually.

```bash
# Backend — build context is apps/backend/
docker build -t zabbix-portal-backend apps/backend/

# Frontend — build context MUST be repo root (Turborepo prune requires the full workspace)
docker build -f apps/frontend/Dockerfile -t zabbix-portal-frontend .

# Filebeat — build context is apps/filebeat/
docker build -t zabbix-portal-filebeat apps/filebeat/
```

---

## Private network

If your environment cannot reach public registries:

**Docker base images** — every `FROM` line in the Dockerfiles has a `# PRIVATE NETWORK:` comment with the exact image path. Replace the public image with your internal mirror in that line.

**npm packages** — in `apps/frontend/Dockerfile`, uncomment the `npm config set registry` and `pnpm config set registry` lines in each stage and set them to your Artifactory / Nexus npm proxy URL.

**pip packages** — in `apps/backend/Dockerfile`, uncomment the `--index-url` flag on the `pip install` line and set it to your internal PyPI proxy.

**nginx image** — in `docker-compose.yml`, replace `nginx:1.27-alpine` with your internal mirror (`# PRIVATE NETWORK:` comment is on that line).
