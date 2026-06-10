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

# ── Runtime stage ─────────────────────────────────────────────────────────────
# PRIVATE NETWORK: change to <your-registry>/docker-virtual/python:3.12-slim
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
# PRIVATE NETWORK: replace with your internal PyPI proxy, e.g.:
# RUN pip install --no-cache-dir -r requirements.txt \
#       --index-url https://artifactory.example.local/api/pypi/pypi/simple
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# OpenShift restricted SCC: non-root user, GID 0 so any platform-assigned UID can read files
RUN chown -R 1001:0 /app && chmod -R g=u /app
USER 1001

EXPOSE 6769

CMD ["python", "-m", "uvicorn", "Zabbix_Main:app", "--host", "0.0.0.0", "--port", "6769"]
