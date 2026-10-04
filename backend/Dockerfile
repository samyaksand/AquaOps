#  AquaOps backend image. Serves the FastAPI app (HTTP + WebSocket) and, via
# an alternate entrypoint, the standalone event worker — the same image is
# used for both, since both are plain `app.*` modules with the same
# dependencies. Keeps the Docker surface to one image instead of two nearly
# identical ones.
FROM python:3.13-slim AS base

WORKDIR /app

# psycopg/geoalchemy2 need libpq; shapely/numpy/scipy need build tools only
# at install time, not at runtime, so pip's wheels cover them without extra
# system packages beyond libpq.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user — nothing here needs root once dependencies are
# installed and files are copied in.
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
