# AquaOps Helm chart

Parameterized version of `infrastructure/kubernetes/`'s raw manifests, plus
an observability stack (Prometheus + Grafana). Same Service names and env
contract — the raw manifests and this chart are interchangeable against the
same backend/frontend images, but **not simultaneously in the same
namespace** (both create resources of the same name).

## Install

```sh
docker build -t aquaops-backend:v2 backend/
docker build -t aquaops-frontend:local frontend/
helm install aquaops infrastructure/helm/aquaops --namespace aquaops --create-namespace
```

If the `aquaops` namespace already holds the raw-manifest deployment,
`helm install` will refuse to adopt it (ownership metadata mismatch).
Either `kubectl delete namespace aquaops` first, or install into a
different namespace.

See `infrastructure/kubernetes/README.md` for the same image-tag-caching
gotcha with Docker Desktop's Kubernetes — it applies here too. `values.yaml`
pins `backend.image.tag: v2`; bump it (and rebuild) on every backend change.

## Configure

All tunables live in `values.yaml`: image tags, replica counts, resource
requests/limits, ports, and `config:` (passed straight through to the
ConfigMap — add a key there for any new backend setting, no template
change needed). `observability.enabled: false` skips Prometheus/Grafana
entirely.

## Observability

- `templates/prometheus.yaml` scrapes any pod in the release namespace
  carrying `prometheus.io/scrape: "true"` (set on the backend and worker
  pod templates) — adding a new instrumented component only needs that
  annotation, not a scrape-config change.
- `templates/grafana.yaml` provisions the Prometheus datasource and the
  dashboard in `dashboards/aquaops-overview.json` automatically on start;
  no manual Grafana setup.
- Default local access: `kubectl port-forward -n aquaops svc/aquaops-grafana 3000:3000`
  (admin / `values.yaml`'s `observability.grafana.adminPassword`, default
  `aquaops`) or `kubectl port-forward -n aquaops svc/aquaops-prometheus 9090:9090`.
  NodePort 30300 (Grafana) and the Prometheus ClusterIP are also set, but
  port-forward is the more reliable path across Docker Desktop networking.

## Verify

```sh
helm lint infrastructure/helm/aquaops
helm template aquaops infrastructure/helm/aquaops   # render without installing
kubectl get pods -n aquaops                          # all should reach 1/1 Running
```
