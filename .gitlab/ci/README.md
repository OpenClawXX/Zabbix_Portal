# GitLab CI Pipeline Guide

This repository uses a modular monorepo GitLab CI pipeline split into include files.

## CI File Layout

- `.gitlab-ci.yml` - Root orchestrator that includes all CI modules.
- `.gitlab/ci/common.yml` - Shared stages, global variables, workflow rules, and Docker job template.
- `.gitlab/ci/detect.yml` - Detects changed files and classifies language impact (Python vs Node).
- `.gitlab/ci/python.yml` - Python-specific verify, build, and publish jobs.
- `.gitlab/ci/node.yml` - Node-specific verify, build, and publish jobs.

## Pipeline Stages

The pipeline runs in this order:

1. `verify`
2. `build`
3. `staging_publish`
4. `prod_publish`

## How Language Detection Works

`detect_changed_languages` runs first and compares the current commit to a base SHA:

- Merge request: uses `CI_MERGE_REQUEST_TARGET_BRANCH_SHA`
- Branch push: uses `CI_COMMIT_BEFORE_SHA`
- Fallback: uses repository first commit

It writes:

- `PYTHON_CHANGED=true|false`
- `NODE_CHANGED=true|false`

These flags are exported via dotenv artifact (`detection.env`) and consumed by later jobs.

Detection includes source code and important build/CI files. For example:

- Python side: `*.py`, `requirements.txt`, `Dockerfile.backend`, CI Python/common files
- Node side: `frontend/**`, lockfiles, CI Node/common files

Artifacts generated for visibility:

- `changed_files.txt`
- `language_detection_report.txt`
- `no_relevant_changes_notice` job output (explicitly states when language jobs are skipped)

## Verify Stage

- `verify_python` runs only when `PYTHON_CHANGED=true`
  - Uses Python image
  - Installs `requirements.txt`
  - Compiles Python modules (`compileall`) to catch syntax/import issues quickly

- `verify_node` runs only when `NODE_CHANGED=true`
  - Uses Node image
  - Runs `npm ci` and `npm run lint` in `frontend/`

## Build Stage

- `build_backend_image` runs only when Python changed
  - Builds `Dockerfile.backend`
  - Exports `backend-image.tar` artifact

- `build_frontend_image` runs only when Node changed
  - Builds `frontend/Dockerfile`
  - Exports `frontend-image.tar` artifact

## Staging Publish Stage

- Backend publish job: `publish_staging_backend`
- Frontend publish job: `publish_staging_frontend`

Both run only on `develop` and only when their language changed.

Each job:

- Logs in to container registry
- Loads built image tar artifact
- Tags image as `:staging`
- Pushes to registry

## Production Publish Stage

- Backend publish job: `publish_prod_backend`
- Frontend publish job: `publish_prod_frontend`

Both are manual jobs and run on:

- `main` branch, or
- tags

Only affected language jobs appear (based on detection flags).

Each job:

- Logs in to registry
- Loads built image tar artifact
- Tags and pushes `:latest`
- Pushes immutable `:$CI_COMMIT_SHORT_SHA`
- For tag pipelines, also tags and pushes `:$CI_COMMIT_TAG`

## Why This Monorepo Design

- CI logic is split by concern for maintainability.
- Python and Node flows are isolated to reduce accidental breakage.
- Jobs are conditional to avoid running unrelated workloads.
- Shared config in `common.yml` keeps defaults consistent.

## Reliability and Reproducibility Notes

- `GIT_DEPTH` is set to `0` so base commit SHAs are always available for accurate `git diff` detection.
- Python CI image is aligned with backend container runtime (`python:3.12-slim`) to reduce "works in CI but fails in container" drift.
- Node verify caches npm download cache (`.npm`) and uses `npm ci --prefer-offline` for faster repeat runs.
- `pip check` runs during Python verify to catch dependency conflicts early.

## Artifactory / Private Network Notes

Inline comments in CI and Dockerfiles mark what to replace for private registry use:

- Base images (Python, Node, Docker, Alpine, Nginx)
- Package sources (PyPI, npm, Alpine packages)

Search for comments containing `Artifactory` to find all replacement points quickly.

In addition, set these CI variables in GitLab project settings:

- `PIP_INDEX_URL`
- `NPM_CONFIG_REGISTRY`
