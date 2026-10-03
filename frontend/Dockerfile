# Builds the static frontend, then serves it from nginx with the same
# relative-path `/api` contract the Vite dev server proxy already uses — the
# app's own code never needs to know whether it's running in dev or in this
# container.
FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
