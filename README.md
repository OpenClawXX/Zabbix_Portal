# Zabbix DevOps UI + API

A full-stack app for managing Zabbix hosts, items, and triggers.

- **Backend:** FastAPI (`main.py`)
- **Frontend:** React + Vite (`frontend/`)
- **Core features:** host management, item creation, trigger creation, host inventory export, bulk host import (`.csv`/`.xlsx`)

## Features

- Health check for API/Zabbix connectivity
- Create, list, delete hosts
- Export hosts inventory to Excel (`.xlsx`)
- Bulk create hosts from `.csv` / `.xlsx`
- Add monitoring items to hosts
- Add triggers for host items
- Frontend popup notifications for user actions

## Project Structure

- `main.py` - FastAPI app and routes
- `Host_Manager.py` - Host operations (create/delete/list/export)
- `Item_Manager.py` - Item and trigger operations
- `ZabbixBase.py` - Base Zabbix connection logic
- `frontend/` - React app
- `Dockerfile.backend` - Backend Docker image
- `frontend/Dockerfile` - Frontend Docker image (Nginx)

## Requirements

- Python 3.10+
- Node.js 20+ (or 22 recommended)
- Access to a Zabbix server/API

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

## Run Locally

### 1) Start backend

From project root:

```bash
python main.py
```

Backend runs on:

- `http://0.0.0.0:8000`

### 2) Start frontend

From `frontend/`:

```bash
npm run dev
```

Frontend host/port is configured in:

- `frontend/vite.config.ts`

Example:

- `host: 'localhost'`
- `port: 42069`

## API Endpoints

- `GET /health` - API status + Zabbix connectivity
- `GET /hosts` - List hosts
- `POST /hosts` - Create host
- `DELETE /hosts/{hostname}` - Delete host
- `GET /hosts/download` - Download Excel inventory
- `POST /hosts/bulk` - Bulk create hosts from file upload
- `POST /items` - Add item to host
- `POST /triggers` - Add trigger to item

## Bulk Import File Format

Upload `.csv` or `.xlsx` with these columns:

- `hostname` (or `host`) - required
- `ip` (or `ip_address`) - required
- `template` - optional (defaults to `Linux by Zabbix agent`)

## Trigger Creation

Trigger creation uses expression format:

`{hostname:item_key.last()} operator threshold`

Example:

`{web-01:system.cpu.load.last()}>5`

## Docker

### Build backend image

From project root:

```bash
docker build -f Dockerfile.backend -t zabb-backend .
```

### Build frontend image

From project root:

```bash
docker build -f frontend/Dockerfile -t zabb-frontend ./frontend
```

> Frontend Nginx config proxies `/api` to `http://backend:8000/`, so the backend container/service should be reachable as `backend` on the same Docker network.

## Notes

- Restart dev servers after config changes (`vite.config.ts`, backend host/port, etc.).
- Keep credentials/secrets in `.env` and do not commit them.
- Ignore files are set up in:
  - `.gitignore`
  - `.dockerignore`
  - `frontend/.dockerignore`
