# Private Network Configuration Checklist

Every line in the codebase that must be changed before this project
runs in a private / air-gapped environment.
Grouped by concern — replace each placeholder with your real value.

---

## 1. Docker base images

Replace public Docker Hub images with your internal mirror in these FROM lines.

| File | Line | Current value | Replace with |
|------|------|---------------|--------------|
| `apps/backend/Dockerfile` | 15 | `FROM python:3.12-slim AS builder` | `FROM <your-registry>/docker-virtual/python:3.12-slim AS builder` |
| `apps/backend/Dockerfile` | 27 | `FROM python:3.12-slim` | `FROM <your-registry>/docker-virtual/python:3.12-slim` |
| `apps/frontend/Dockerfile` | 17 | `FROM node:22.2-alpine AS builder` | `FROM <your-registry>/docker-virtual/node:22.2-alpine AS builder` |
| `apps/frontend/Dockerfile` | 39 | `FROM node:22.2-alpine AS runner` | `FROM <your-registry>/docker-virtual/node:22.2-alpine AS runner` |

---

## 2. Package registries

### pip (Python)
`apps/backend/Dockerfile` — lines 21–22 are commented out. Uncomment and set your PyPI proxy:
```dockerfile
# line 21-22 — change to:
RUN pip install --no-cache-dir -r requirements.txt \
      --index-url https://<your-registry>/api/pypi/pypi/simple
```

### npm (Node)
`apps/frontend/Dockerfile` — lines 22–23 are commented out. Uncomment and set your npm proxy:
```dockerfile
# line 22-23 — change to:
RUN npm config set registry https://<your-registry>/api/npm/npm/ \
    && npm config set strict-ssl false
```

`.npmrc` (root) — line 3 is commented out. Uncomment and set:
```
# line 3 — change to:
registry=https://<your-registry>/api/npm/npm/
```

---

## 3. CI runner images

These are the images pulled by GitLab CI jobs. All must come from your internal registry.

| File | Line | Setting | Replace with |
|------|------|---------|--------------|
| `.gitlab/ci/common.yml` | 14 | `name: <your-kaniko-image>` | Your internal Kaniko image, e.g. `<your-registry>/kaniko:latest` |
| `.gitlab/ci/python.yml` | 7 | `image: <your-python-image>` | Your internal Python image, e.g. `<your-registry>/python:3.12-slim` |
| `.gitlab/ci/node.yml` | 7 | `image: <your-node-image>` | Your internal Node image, e.g. `<your-registry>/node:22-alpine` |
| `.gitlab/ci/gitops.yml` | 18 | `name: <your-helm-image>` | Your internal Helm image, e.g. `<your-registry>/helm:latest` |
| `.gitlab/ci/detect.yml` | 96 | `name: alpine:3.20` | Your internal Alpine mirror, e.g. `<your-registry>/alpine:3.20` |

---

## 4. Image push destination (Kaniko)

Where built images are pushed after a successful build.
Replace `<your-artifactory-registry>` with your actual registry path
(e.g. `artifactory.company.com/docker-local`).

| File | Line | Current value |
|------|------|---------------|
| `.gitlab/ci/python.yml` | 66 | `--destination "<your-artifactory-registry>/backend:$IMAGE_TAG"` |
| `.gitlab/ci/node.yml` | 67 | `--destination "<your-artifactory-registry>/frontend:$IMAGE_TAG"` |
| `.gitlab/ci/gitops.yml` | 232 | `--set backend.image.repository="<your-artifactory-registry>/backend"` |
| `.gitlab/ci/gitops.yml` | 233 | `--set frontend.image.repository="<your-artifactory-registry>/frontend"` |

---

## 5. Helm & ArgoCD image repositories

Replace `your-registry` with your actual registry path in all values files.

> PostgreSQL is NOT deployed by Helm — it is a shared/external database reached
> via `DATABASE_URL`. There is no postgres image to mirror.

### `helm/charts/zabbix-portal/values.yaml`
| Line | Key | Current value |
|------|-----|---------------|
| 7 | `backend.image.repository` | `your-registry/backend` |
| 44 | `frontend.image.repository` | `your-registry/frontend` |

### `argocd/values-dev.yaml` (ArgoCD — planned, not yet wired into CI)
| Line | Key | Current value |
|------|-----|---------------|
| 9 | `backend.image.repository` | `your-registry/backend` |
| 49 | `frontend.image.repository` | `your-registry/frontend` |
| 76 | `postgres.image.repository` | `your-registry/postgres` |

### `argocd/values-staging.yaml` (ArgoCD — planned, not yet wired into CI)
| Line | Key | Current value |
|------|-----|---------------|
| 9 | `backend.image.repository` | `your-registry/backend` |
| 54 | `frontend.image.repository` | `your-registry/frontend` |
| 86 | `postgres.image.repository` | `your-registry/postgres` |

### `argocd/values-production.yaml` (ArgoCD — planned, not yet wired into CI)
| Line | Key | Current value |
|------|-----|---------------|
| 10 | `backend.image.repository` | `your-registry/backend` |
| 79 | `frontend.image.repository` | `your-registry/frontend` |
| 133 | `postgres.image.repository` | `your-registry/postgres` |

---

## 6. GitLab CI/CD variables

Set these in **GitLab → Settings → CI/CD → Variables**.
None of these are in the code — they are injected at pipeline runtime.

| Variable | Description | Sensitive |
|----------|-------------|-----------|
| `PROJECT_NAME` | Helm release name, e.g. `zabbix-portal` | No |
| `K8S_NAMESPACE` | OpenShift namespace where the app is deployed | No |
| `STAGING_SERVER` | Staging cluster API URL, e.g. `https://api.cluster.company.com:6443` | No |
| `STAGING_TOKEN` | Staging cluster service account token | **Yes — mask it** |
| `STAGING_URL` | Staging app URL shown in GitLab environment tab | No |
| `PROD_SERVER` | Production cluster API URL | No |
| `PROD_TOKEN` | Production cluster service account token | **Yes — mask it** |
| `PRODUCTION_URL` | Production app URL shown in GitLab environment tab | No |
| `DR_URL` | DR app URL shown in GitLab environment tab | No |

---

## 7. GitLab runner tag

`.gitlab/ci/common.yml` — line 9.
All jobs inherit this tag. Replace `docker` with the tag of your registered runner:
```yaml
# line 9 — change to:
tags:
  - <your-runner-tag>
```

Note: the backend Docker build job (`.gitlab/ci/python.yml` line 53) overrides this
with `shared-runner`. If your setup uses a single runner tag, remove that override too.

---

## Quick find command

To verify nothing was missed after you make your changes:
```bash
grep -rn "your-registry\|your-kaniko\|your-python\|your-node\|your-helm\|your-artifactory\|<your-" \
  --include="*.yml" --include="*.yaml" --include="Dockerfile" --include=".npmrc" .
```
Should return zero results when everything is filled in.
