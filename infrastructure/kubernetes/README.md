# AquaOps on local Kubernetes

Deploys the same stack as `infrastructure/docker/docker-compose.yml`
(Postgres/PostGIS, Redis, Kafka) plus the FastAPI backend, the event worker,
and the React frontend, to a local cluster (tested against Docker Desktop's
built-in Kubernetes). Does not replace Docker Compose — both work
independently from the same source.

## Build images

```sh
docker build -t aquaops-backend:v1 backend/
docker build -t aquaops-frontend:local frontend/
```

Both Dockerfiles live next to their app (`backend/Dockerfile`,
`frontend/Dockerfile`). The backend image is reused for both the API
(`uvicorn app.main:app`) and the worker (`python -m app.worker`) — same
dependencies, different command. The frontend image is nginx serving the
Vite build and reverse-proxying `/api` (including WebSocket upgrades) to the
backend Service, mirroring the Vite dev server's own proxy. The manifests
reference these exact tags (`aquaops-backend:v1`, `aquaops-frontend:local`);
change both together if you retag.

**Rebuilding an image under a tag the cluster has already pulled does not
reliably update already-running pods** — with Docker Desktop's Kubernetes,
the node's own containerd image cache can keep serving the old layer under
`imagePullPolicy: IfNotPresent` even after a fresh `docker build` with the
same tag, and even after deleting the pod. The backend image is tagged `v1`
(rather than `local`) for exactly this reason, hit while building this
deployment. **When you change backend code, build under a new tag** (e.g.
`v2`) and update it in `backend.yaml` and `worker.yaml`, rather than
reusing `v1` — reusing a tag the cluster has already seen is not reliable.

## Deploy

```sh
kubectl apply -f infrastructure/kubernetes/
```

Or individually, in dependency order: `namespace.yaml`, `configmap.yaml`,
`secret.yaml`, `postgres.yaml`, `redis.yaml`, `kafka.yaml`, `backend.yaml`,
`worker.yaml`, `frontend.yaml`.

The backend Deployment runs an `initContainer` (`alembic upgrade head &&
python -m app.db.seed`) before the API container starts. Both are
idempotent, so this is safe on every pod restart.

## Verify

```sh
kubectl get pods -n aquaops          # all should reach 1/1 Running
kubectl port-forward -n aquaops svc/aquaops-frontend 18080:8080
```

Then `http://localhost:18080` loads the app, and `/api/v1/health` answers
through the same proxy. NodePort 30080 is also configured on the frontend
Service, but port-forward is the more reliable path across Docker Desktop
networking configurations.

## Configuration

- `configmap.yaml` holds every non-secret setting, with keys matching
  `app/core/config.py`'s `Settings` field names (env lookup is
  case-insensitive) — no backend code changes were needed to run under
  Kubernetes.
- `secret.yaml` holds only the local Postgres password, which matches
  `docker-compose.yml`'s plaintext value. Not a real secret; replace before
  any non-local use.
- Service DNS names (`aquaops-postgres`, `aquaops-redis`, `aquaops-kafka`,
  `aquaops-backend`) are what the ConfigMap, Kafka's own advertised
  listener, and `frontend/nginx.conf` all point at — keep them in sync if
  you rename a Service.
