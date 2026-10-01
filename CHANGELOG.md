# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-02

First release: the application and the full platform it runs on.

### Added

- **Application**: Go API (users, posts, comments, followers, roles, feed, email activation, JWT auth) and React frontend served by nginx.
- **Infrastructure**: Terraform for a 3-AZ VPC, EKS with a private API endpoint, SSM-only bastion, EKS Pod Identity roles, and S3 remote state with native locking.
- **GitOps**: Argo CD Applications for the app, monitoring, logging and metrics-server; Helm chart rendered through Kustomize with per-environment values.
- **CI/CD**: GitHub Actions with gofmt, `go vet`, race tests, Trivy scanning and GHCR publishing; Argo CD Image Updater deploys new `sha-` tags automatically.
- **Networking**: one ALB built from Kubernetes Gateway API objects, routing by path to the app, API, Argo CD, Grafana and Kibana.
- **Secrets**: Vault + External Secrets Operator.
- **Data**: in-cluster Postgres and Redis, migrations as an init container (own `cmd/migrate` binary with embedded SQL), idempotent seed Job for dev.
- **Observability**: kube-prometheus-stack with Slack alerts, API Prometheus metrics (requests, latency, DB pool, build info), ECK logging (Elasticsearch, Kibana, Filebeat).
- **Scaling**: HorizontalPodAutoscaler and PodDisruptionBudgets for the API and frontend.
- **Versioning**: the release version is injected at build time and reported by `/v1/health` and `go_feed_build_info`.
- **Docs**: README and a step-by-step setup guide (`docs/SETUP_GUIDE.md`).

### Fixed

- Rate limiter keyed on `ip:port`, giving every connection its own counter.
- Invalid `follower_id` JSON struct tag.
- Seeder never committed its transaction, set no password and left users inactive.
- Confirmation emails linked to `localhost` instead of the public URL.
- Authenticated requests failing with 401 when the Redis cache was unreachable (Redis now deployed in the cluster).

[Unreleased]: https://github.com/ritesh-karankal/go-feed/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ritesh-karankal/go-feed/releases/tag/v0.1.0
