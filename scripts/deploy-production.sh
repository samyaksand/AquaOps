#!/usr/bin/env bash
#
# AquaOps — production deployment script.
#
# Run from the repository root on the production VM:
#   ./scripts/deploy-production.sh
#
# Safe to rerun after every code update. It builds/starts the production
# Docker Compose stack (infrastructure/docker/docker-compose.production.yml),
# runs Alembic migrations against the configured Supabase database, and
# verifies every service is healthy. It never seeds the database and never
# touches the development stack — see "Initial database seed" below for the
# one-time step a brand-new deployment needs.
#
# Requires backend/.env.production to already exist (see
# backend/.env.production.example and infrastructure/docker/PRODUCTION.md).
# This script never creates, overwrites, or prints the contents of that file.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="${REPO_ROOT}/infrastructure/docker"
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE="${REPO_ROOT}/backend/.env.production"

log()  { printf '\n==> %s\n' "$1"; }
die()  { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

compose() {
  # Always run compose from the directory the file's relative build
  # contexts (../../backend, ../../frontend) are written against.
  (cd "${COMPOSE_DIR}" && docker compose -f "${COMPOSE_FILE}" "$@")
}

# ---------------------------------------------------------------------------
# 1-2. Fail fast; verify Docker and Docker Compose are available.
# ---------------------------------------------------------------------------
log "Checking Docker and Docker Compose"
command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"
docker info >/dev/null 2>&1 || die "docker daemon is not reachable (is it running? do you have permission?)"
docker compose version >/dev/null 2>&1 || die "'docker compose' (v2 plugin) is not available"

# ---------------------------------------------------------------------------
# 3. Verify backend/.env.production exists. Never create, overwrite, or
#    print it — only confirm its presence.
# ---------------------------------------------------------------------------
log "Checking for backend/.env.production"
if [[ ! -f "${ENV_FILE}" ]]; then
  die "backend/.env.production is missing. Create it from backend/.env.production.example and fill in real values first. This script will not create or overwrite it."
fi
log "Found backend/.env.production (contents not shown)"

# ---------------------------------------------------------------------------
# 5. Pull the latest Git code safely — no force reset, no discarding local
#    changes. backend/.env.production is gitignored, so a pull never touches
#    it regardless.
# ---------------------------------------------------------------------------
log "Pulling latest code"
cd "${REPO_ROOT}"
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree has uncommitted changes — refusing to pull. Commit, stash, or discard them first."
fi
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin
git merge --ff-only "origin/${CURRENT_BRANCH}" \
  || die "git pull would not fast-forward on '${CURRENT_BRANCH}' — resolve manually (no automatic force reset will be performed)."

# ---------------------------------------------------------------------------
# 6. Build/start the production Compose services.
# ---------------------------------------------------------------------------
log "Building and starting production services"
compose up -d --build

# ---------------------------------------------------------------------------
# 7. Run Alembic migrations against the configured Supabase database.
#    Migrations only ever move forward here — this script never runs
#    'alembic downgrade' or any destructive database command.
# ---------------------------------------------------------------------------
log "Running database migrations (alembic upgrade head)"
compose exec -T backend alembic upgrade head

# ---------------------------------------------------------------------------
# 8. Seeding is explicit and separate — never automatic. See the
#    "Initial database seed" section this script prints at the end.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# 9. Wait for backend health.
# ---------------------------------------------------------------------------
log "Waiting for backend health"
BACKEND_READY=false
for _ in $(seq 1 30); do
  STATUS="$(compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null | awk '$1=="aquaops-backend"{print $2}')"
  if [[ "${STATUS}" == "healthy" ]]; then
    BACKEND_READY=true
    break
  fi
  sleep 3
done
[[ "${BACKEND_READY}" == "true" ]] || die "backend did not become healthy in time — check: docker compose -f ${COMPOSE_FILE} logs backend"

# ---------------------------------------------------------------------------
# 10. Verify backend health endpoint, frontend HTTP, Redis, Kafka, worker.
# ---------------------------------------------------------------------------
log "Verifying backend health endpoint"
curl -fsS http://localhost:8080/api/v1/health >/dev/null \
  || die "backend health endpoint (via frontend proxy) did not respond"
BACKEND_HEALTH="ok"

log "Verifying frontend HTTP availability"
curl -fsS -o /dev/null http://localhost:8080/ \
  || die "frontend did not respond over HTTP"
FRONTEND_HTTP="ok"

log "Verifying Redis health"
REDIS_STATUS="$(compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null | awk '$1=="aquaops-redis"{print $2}')"
[[ "${REDIS_STATUS}" == "healthy" ]] || die "Redis is not healthy (status: ${REDIS_STATUS:-unknown})"

log "Verifying Kafka health"
KAFKA_STATUS="$(compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null | awk '$1=="aquaops-kafka"{print $2}')"
[[ "${KAFKA_STATUS}" == "healthy" ]] || die "Kafka is not healthy (status: ${KAFKA_STATUS:-unknown})"

log "Verifying worker is running"
WORKER_STATE="$(compose ps --format '{{.Name}} {{.State}}' 2>/dev/null | awk '$1=="aquaops-worker"{print $2}')"
[[ "${WORKER_STATE}" == "running" ]] || die "worker container is not running (state: ${WORKER_STATE:-unknown}) — check: docker compose -f ${COMPOSE_FILE} logs worker"

# ---------------------------------------------------------------------------
# 11. Deployment summary.
# ---------------------------------------------------------------------------
log "Deployment summary"
cat <<SUMMARY
  Backend health   : ${BACKEND_HEALTH}
  Frontend HTTP    : ${FRONTEND_HTTP}
  Redis            : ${REDIS_STATUS}
  Kafka            : ${KAFKA_STATUS}
  Worker           : ${WORKER_STATE}
  Migrations       : applied (alembic upgrade head)
  Seeding          : NOT run automatically — see below

  First deployment on a brand-new (empty) database only:
    cd ${COMPOSE_DIR#"${REPO_ROOT}/"}
    docker compose -f ${COMPOSE_FILE} exec -T backend python -m app.db.seed

  (The seed is idempotent — safe to run again if ever unsure whether it
  already ran — but this script does not run it automatically on every
  deploy, since production data should not be silently reset/reseeded.)
SUMMARY

log "Deployment complete"
