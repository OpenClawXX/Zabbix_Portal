# =============================================================================
# PRIVATE NETWORK — IMAGE CHANGES REQUIRED
# =============================================================================
# Replace the public image below with your internal mirror before deploying.
#
#   Public image  : python:3.12-slim
#   Private mirror: <your-registry>/docker-virtual/python:3.12-slim
#
# Example (Artifactory):
#   FROM artifactory.example.local/docker-virtual/python:3.12-slim
#
# Also set the pip index to your internal PyPI proxy:
#   --index-url https://artifactory.example.local/api/pypi/pypi/simple
# =============================================================================
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

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
