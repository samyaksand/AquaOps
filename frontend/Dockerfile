# Builds the static frontend, then serves it from nginx with the same
# relative-path `/api` contract the Vite dev server proxy already uses — the
# app's own code never needs to know whether it's running in dev or in this
# container.
FROM node:20-slim AS build

# Optional build-time overrides (see src/lib/api.ts / src/hooks/useRealtime.ts).
# Vite inlines import.meta.env.VITE_* at build time, so these must be ARGs
# turned into ENV before `npm run build` runs, not plain runtime env vars.
# Left empty, the app calls relative /api paths — correct for the default
# same-origin nginx reverse-proxy deploy below.
ARG VITE_API_BASE_URL=""
ARG VITE_WS_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_BASE_URL=${VITE_WS_BASE_URL}

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# The unprivileged variant runs the master process as a non-root user out
# of the box (correct ownership on its own directories already set up by
# the image) rather than needing a manual USER + permission dance on top of
# the standard nginx image — it already listens on 8080 by default, which
# matches nginx.conf.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
