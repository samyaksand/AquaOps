# AquaOps — Production Docker Compose

Runs on a single small VPS (sized for 2 vCPU / 4 GB RAM): `frontend`, `backend`,
`worker`, `redis`, `kafka`. **PostgreSQL/PostGIS is not run here — Supabase is
the production database.**

## 1. Required environment variables

Create `backend/.env.production` (not committed) from
`backend/.env.production.example`. All fields are read by
`backend/app/core/config.py`:

| Variable | Notes |
|---|---|
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `DATABASE_URL` | Supabase connection string, `postgresql+asyncpg://...` |
| `DATABASE_ECHO` | `false` |
| `CORS_ORIGINS` | Your public domain, e.g. `["https://aquaops.example.com"]` — only matters if the frontend is ever split to a different origin than the backend; the default same-origin setup below never hits CORS |
| `REDIS_URL` | `redis://redis:6379/0` (the `redis` service on this same Compose network) |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:19092` (the `kafka` service on this same Compose network) |
| `KAFKA_ENABLED` | `true` |

Frontend variables are **optional build args**, not runtime env vars (Vite
inlines them at build time) — see `frontend/.env.production.example`. Leave
both unset for the default, recommended single-origin setup described below.
Only set them (via shell env before `docker compose build`) if the frontend
and backend are ever deployed on different domains.

## 2. Start production

Use `scripts/deploy-production.sh` (run from the repository root on the VM)
rather than calling `docker compose` by hand — it fails fast on a missing
`backend/.env.production`, pulls the latest code safely (fast-forward only,
no force reset), builds/starts the stack, runs migrations, and verifies
every service's health before printing a summary. It is safe to rerun after
every code update.

**Normal deployment** (every deploy after the first):

```bash
./scripts/deploy-production.sh
```

**First deployment only** — after the script finishes once on a brand-new
(empty) database, run the one-time seed it prints in its summary:

```bash
cd infrastructure/docker
docker compose -f docker-compose.production.yml exec -T backend python -m app.db.seed
```

The seed is idempotent (it only inserts rows that don't already exist), so
it is safe to run again if you're ever unsure whether it already ran — but
`deploy-production.sh` never runs it automatically, so an existing
production database is never silently reseeded or reset by a routine deploy.

If you prefer to run the steps manually instead of the script:

```bash
cd infrastructure/docker
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml exec -T backend alembic upgrade head
```

(No `--env-file` flag is needed for `docker compose` itself unless you are
also overriding `VITE_API_BASE_URL`/`VITE_WS_BASE_URL` as shell variables at
build time — the backend/worker containers already read
`backend/.env.production` directly via `env_file:` in the compose file.)

## 3. Stop production

```bash
docker compose -f docker-compose.production.yml down
```

Add `-v` only if you intentionally want to drop the named network (there is
no database volume here to lose — Supabase holds that data).

## 4. View logs

```bash
docker compose -f docker-compose.production.yml logs -f            # all services
docker compose -f docker-compose.production.yml logs -f backend    # one service
```

## 5. Check service health

`scripts/deploy-production.sh` already checks all of this at the end of
every deployment and prints a summary. To check independently at any time:

```bash
docker compose -f docker-compose.production.yml ps        # health/state column
curl http://localhost:8080/                                # frontend
curl http://localhost:8080/api/v1/health                   # backend, via the frontend proxy
```

Four of the five services define a `healthcheck`; `docker compose ps` shows
`healthy`/`unhealthy` once each has passed its `start_period`. The worker has
no HTTP surface to probe (see `infrastructure/kubernetes/worker.yaml`), so
its liveness is its container `State` (`running`) plus `restart:
unless-stopped`.

Rollback considerations are covered in one place — §8.7, at the end of this
document.

## 6. Supabase vs. the VM

| Runs on Supabase | Runs on the VM (this Compose file) |
|---|---|
| PostgreSQL + PostGIS (the only persistent store) | frontend (nginx + static SPA) |
| | backend (FastAPI, stateless) |
| | worker (Kafka → Redis relay, stateless) |
| | redis (short-TTL cache + pub/sub fanout — not persisted) |
| | kafka (event transport — not persisted) |

Redis and Kafka stay on the VM rather than moving to managed services: the
backend already treats both as best-effort infrastructure (a broker/cache
fault degrades to "no live relay", never a failed request — see
`CLAUDE.md`, "Events & Cache"), so there is no data-loss risk in running them
as plain, unpersisted containers here.

## 7. Cloudflare / domain assumptions

- One public domain, `aquaops.samyaksand.com`, proxied through Cloudflare,
  with its DNS A record pointed at the VM's current IP. The record targets
  the VM's `frontend` container on port `8080` (the only port this Compose
  file publishes to the host).
- `frontend`/nginx is the single origin: it serves the built SPA and
  reverse-proxies `/api/` — including the `/api/v1/ws` WebSocket upgrade —
  to the `backend` container on the internal Compose network
  (`frontend/nginx.conf`, unchanged from the existing dev/Kubernetes setup).
  Cloudflare therefore only ever needs to proxy one origin/port; it does not
  need to know about `backend`, `redis`, or `kafka` individually.
- TLS terminates at Cloudflare; the VM only needs to serve plain HTTP on
  `8080` behind it (add a TLS-terminating proxy in front of nginx instead if
  Cloudflare is not used).

## 8. Backup and recovery

**What is backed up, and where:**

| Data | Where it lives | Lost if the VM is destroyed? |
|---|---|---|
| PostgreSQL + PostGIS (the network, allocations persisted to it, everything `app/db/seed.py` creates) | Supabase | **No** — the VM never holds this database; see §8.1 |
| Application/infrastructure code | Git (GitHub or wherever `origin` is hosted) | No — `git clone` recovers it in full |
| `backend/.env.production` (real production secrets) | Wherever it is stored outside the repo (see §8.3) — **not** this VM alone, **not** Git | **Yes, if it has no copy elsewhere** — see §8.3 |
| Redis cache, Kafka topics (this VM's containers) | Only on the VM, unpersisted | Yes — but see §8.1: this is short-TTL/relay data the backend already treats as best-effort, never authoritative, so its loss is not a data-loss event. The practical effect of a restart mid-operation is narrower than "data loss" implies: it can drop a live WebSocket broadcast to already-connected clients for whichever allocation/scenario result was in flight through the Kafka→Redis relay at that moment — the allocation itself and its direct HTTP/WebSocket response to the client that requested it are computed synchronously and are never affected. |
| Docker named volumes on this VM | — | N/A — this production Compose file defines **no** named volumes; nothing here is a database backup |

### 8.1 Database — Supabase, not the VM

Production PostgreSQL/PostGIS runs on Supabase, reached via `DATABASE_URL`
in `backend/.env.production` — the VM never runs Postgres itself (see §6,
"Supabase vs. the VM"). **Losing the VM does not mean losing the database.**
This repository does not document a specific Supabase backup/retention
policy — none is configured or verified from this codebase; check Supabase's
own project settings/dashboard for whatever backup policy is actually
enabled there.

### 8.2 Application recovery — if the OVH VM is lost

1. Provision a replacement VM (any machine capable of running Docker).
2. Install Docker and Git on it.
3. `git clone` this repository.
4. Recreate `backend/.env.production` from the securely stored production
   configuration (see §8.3 — **never** from Git, since it is not there).
5. Run `./scripts/deploy-production.sh` from the repository root.
6. Run the initial seed (`docker compose -f docker-compose.production.yml
   exec -T backend python -m app.db.seed`) **only if** the Supabase database
   is genuinely empty — it is idempotent, but there is no reason to run it
   against a database that already has data, since the deploy script already
   ran migrations.
7. Verify using the checklist in §8.6 below.
8. Update the Cloudflare DNS record to the replacement VM's IP (§8.5).

### 8.3 Configuration recovery — secrets are never in Git

`backend/.env.production` is gitignored (`.gitignore`) specifically so it
can never be committed — see `backend/.env.production.example` and
`frontend/.env.production.example` for the *shape* of what it needs, with
placeholder values only. The real file must be stored securely outside this
repository (a password manager, a secrets manager, or equivalent — whichever
your team already uses) so it can be restored onto a replacement VM. This
document does not invent or store any actual credential.

### 8.4 Code recovery — Git is the source of truth

All application and infrastructure code (backend, frontend, Dockerfiles,
Compose files, this script) is recovered in full by cloning the Git
repository — nothing on the VM itself is authoritative for code. Docker
named volumes on this VM are **not** backups of production data: this
production Compose file defines no named volumes at all, and even where a
named volume exists elsewhere (e.g. the *development* Compose's
`postgres_data`), a Docker volume living only on one VM is a single point of
failure, not a backup, and is never where production data lives.

### 8.5 DNS recovery

Cloudflare DNS points `aquaops.samyaksand.com` to the current VM's IP via an
A record. After replacing the VM, that A record must be updated to the
replacement VM's new IP in the Cloudflare dashboard — this document does not
assume or record a specific IP, since it changes with every replacement.

### 8.6 Recovery verification checklist

After any recovery (VM replacement, redeploy, or rollback), confirm:

- [ ] VM is reachable (SSH / network access works)
- [ ] `docker compose -f docker-compose.production.yml ps` shows all five
      services, with `backend`/`redis`/`kafka`/`frontend` `healthy` and
      `worker` `running`
- [ ] Backend can reach Supabase (migrations applied without a connection
      error — `scripts/deploy-production.sh` already fails loudly here)
- [ ] Migrations are at `head` (`alembic current` matches `alembic heads`
      inside the `backend` container)
- [ ] `curl http://localhost:8080/api/v1/health` returns `{"status":"ok"}`
- [ ] Frontend loads over HTTP (`curl -I http://localhost:8080/` → `200`)
- [ ] WebSocket connects — open the app in a browser and confirm the header
      shows "Live updates: Live", not "offline"/"connecting"
- [ ] Worker logs show it joined its Kafka consumer group without crash-looping
      (`docker compose -f docker-compose.production.yml logs worker`)
- [ ] Cloudflare DNS A record for `aquaops.samyaksand.com` points at the
      (replacement) VM's current IP
- [ ] Demo Mode runs end-to-end in the browser (Launch Demo → Run Allocation
      → Scenario → Apply → Reallocate → Decision Analysis) against the real
      recovered backend

### 8.7 Rollback principle

- **Code**: to roll back the application, use Git — identify the last
  known-good commit or tag, check it out on the VM
  (`git checkout <previous-commit-or-tag>`), and redeploy
  (`./scripts/deploy-production.sh`, or the manual steps in §2). The
  script's fast-forward-only pull will refuse to silently overwrite a
  rollback you've checked out locally — it only pulls when your current
  branch is behind `origin`, so check out the older revision explicitly
  before rerunning it.
- **Database**: **never** run `alembic downgrade` automatically, as part of
  any script — `scripts/deploy-production.sh` does not and will not do
  this. Rolling back a migration against the production Supabase database
  is a deliberate, manual, data-aware decision: a code rollback does not
  imply a schema rollback is safe, or even necessary — confirm whether the
  older application revision is compatible with the current (possibly
  newer) schema before deciding whether `alembic downgrade <revision>` is
  actually warranted, and only then run it by hand.
- **Containers**: `docker compose -f docker-compose.production.yml down`
  stops everything without removing the Supabase data (there is no local
  database volume to lose) or the named Docker network's configuration.
