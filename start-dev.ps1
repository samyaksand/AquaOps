<#
.SYNOPSIS
    Starts the full AquaOps local development stack from one PowerShell
    session: Docker infrastructure (Postgres/PostGIS, Redis, Kafka), the
    FastAPI backend, and the Vite frontend dev server.

.DESCRIPTION
    Uses the project's own existing commands (docker compose, uvicorn, npm
    run dev) rather than duplicating their configuration. Backend and
    frontend run as separate tracked child processes with their console
    windows visible; closing either window, or pressing Ctrl+C here, stops
    everything cleanly via Stop-AllProcesses.

    Does not touch production configuration or any docker-compose.production
    file — this only ever runs infrastructure/docker/docker-compose.yml.
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

$backendProc = $null
$frontendProc = $null

function Stop-AllProcesses {
    Write-Step "Stopping backend and frontend"
    foreach ($p in @($backendProc, $frontendProc)) {
        if ($p -and -not $p.HasExited) {
            # -Force kills the whole process tree under this PID (npm's own
            # child node process included), not just the launcher process.
            taskkill /PID $p.Id /T /F 2>$null | Out-Null
        }
    }
}

# Ctrl+C in an interactive session raises a terminating exception that the
# try/finally below catches; closing the window runs the same via PowerShell's
# own engine event.
Register-EngineEvent PowerShell.Exiting -Action { Stop-AllProcesses } | Out-Null

try {
    Write-Step "Starting Docker infrastructure (Postgres/PostGIS, Redis, Kafka)"
    docker compose -f "$root/infrastructure/docker/docker-compose.yml" up -d
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

    Write-Step "Waiting for Postgres to become healthy"
    $deadline = (Get-Date).AddSeconds(60)
    do {
        $status = docker inspect -f '{{.State.Health.Status}}' aquaops-postgres 2>$null
        if ($status -eq 'healthy') { break }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    if ($status -ne 'healthy') {
        Write-Host "Postgres did not report healthy in time; continuing anyway." -ForegroundColor Yellow
    }

    Write-Step "Running database migrations"
    Push-Location "$root/backend"
    & ".\.venv\Scripts\python.exe" -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "alembic upgrade head failed" }

    Write-Step "Seeding database (idempotent, safe to rerun)"
    & ".\.venv\Scripts\python.exe" -m app.db.seed
    Pop-Location

    Write-Step "Starting backend (FastAPI) on http://127.0.0.1:8000"
    $backendProc = Start-Process -FilePath ".\backend\.venv\Scripts\python.exe" `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory "$root\backend" `
        -PassThru -NoNewWindow

    Write-Step "Starting frontend (Vite) on http://localhost:5173"
    $frontendProc = Start-Process -FilePath "npm.cmd" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory "$root\frontend" `
        -PassThru -NoNewWindow

    Write-Host "`nAquaOps is running:" -ForegroundColor Green
    Write-Host "  Backend:  http://127.0.0.1:8000"
    Write-Host "  Frontend: http://localhost:5173"
    Write-Host "`nPress Ctrl+C to stop everything.`n"

    # Block until either process exits or the user interrupts.
    while (-not $backendProc.HasExited -and -not $frontendProc.HasExited) {
        Start-Sleep -Seconds 1
    }
    if ($backendProc.HasExited) { Write-Host "Backend exited unexpectedly." -ForegroundColor Red }
    if ($frontendProc.HasExited) { Write-Host "Frontend exited unexpectedly." -ForegroundColor Red }
}
finally {
    Stop-AllProcesses
}
