# =============================================================================
# PRIVATE NETWORK — IMAGE CHANGES REQUIRED
# =============================================================================
# Replace the public image below with your internal mirror before deploying.
#
#   Public image  : python:3.12-slim
#   Private mirror: <your-registry>/docker-virtual/python:3.12-slim
#
# Also set the pip index to your internal PyPI proxy:
#   --index-url https://artifactory.example.local/api/pypi/pypi/simple
# =============================================================================

# ── Build stage ───────────────────────────────────────────────────────────────
# PRIVATE NETWORK: change to <your-registry>/docker-virtual/python:3.12-slim
FROM python:3.12-slim AS builder

WORKDIR /app

COPY requirements.txt .
# PRIVATE NETWORK: replace with your internal PyPI proxy, e.g.:
# RUN pip install --no-cache-dir -r requirements.txt \
#       --index-url https://artifactory.example.local/api/pypi/pypi/simple
RUN pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ─────────────────────────────────────────────────────────────
# PRIVATE NETWORK: change to <your-registry>/docker-virtual/python:3.12-slim
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Runtime system deps only (curl for healthcheck probes)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only installed packages — pip, gcc, and build cache stay in the builder stage
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

# OpenShift restricted SCC: non-root user, GID 0 so any platform-assigned UID can read files
RUN chown -R 1001:0 /app && chmod -R g=u /app
USER 1001

EXPOSE 6769

CMD ["python", "-m", "uvicorn", "Zabbix_Main:app", "--host", "0.0.0.0", "--port", "6769"]
