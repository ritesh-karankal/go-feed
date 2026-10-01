# GoFeed: a GitOps platform on AWS EKS

[![CI](https://github.com/ritesh-karankal/go-feed/actions/workflows/ci.yaml/badge.svg)](https://github.com/ritesh-karankal/go-feed/actions/workflows/ci.yaml)
[![Frontend CI](https://github.com/ritesh-karankal/go-feed/actions/workflows/frontend-ci.yaml/badge.svg)](https://github.com/ritesh-karankal/go-feed/actions/workflows/frontend-ci.yaml)

A Go + React social feed, running on a private Amazon EKS cluster built with Terraform and deployed entirely through GitOps. A merged pull request is tested, built, vulnerability-scanned, pushed to GHCR and rolled out by Argo CD without anyone touching the cluster. The platform includes secrets management with Vault, automatic database migrations, Prometheus metrics and Slack alerts, centralized logging with the Elastic stack, and CPU-based autoscaling.

---

## Highlights

- **Infrastructure as code**: Terraform modules for a 3-AZ VPC, an EKS cluster with a **private-only API endpoint**, an SSM-only bastion (no SSH), KMS-encrypted secrets, and IAM through **EKS Pod Identity**. Remote state in S3 with native locking.
- **GitOps**: Argo CD syncs a Helm chart rendered through Kustomize; monitoring, logging and metrics-server are Argo CD Applications too. Drift is reverted automatically.
- **CI/CD**: GitHub Actions runs gofmt, `go vet` and race-enabled tests, then builds images, blocks on HIGH/CRITICAL CVEs with **Trivy**, and pushes immutable `sha-<commit>` tags. **Argo CD Image Updater** deploys new tags automatically.
- **One load balancer**: the AWS Load Balancer Controller builds a single ALB from **Kubernetes Gateway API** objects and routes by path to the app, API, Argo CD, Grafana and Kibana.
- **Secrets**: HashiCorp Vault + External Secrets Operator; no secret values in Git.
- **Data**: Postgres StatefulSet on encrypted gp3 EBS, Redis cache, migrations as an init container, idempotent seed Job for dev.
- **Observability**: kube-prometheus-stack with alerts to Slack, plus custom API metrics (request rate, errors, latency histogram, DB pool); Elasticsearch, Filebeat and Kibana via the ECK operator.
- **Scaling**: HorizontalPodAutoscaler and PodDisruptionBudgets; load-tested to 5 pods at ~1,150 req/s with **0 failed requests**.

---

## Architecture

```mermaid
flowchart TB
    dev["Developer"] -->|git push| repo["GitHub repo<br/>code + deploy/ manifests"]
    repo -->|triggers| ci["GitHub Actions<br/>test, build, Trivy scan"]
    ci -->|sha-commit images| ghcr["GHCR"]
    users["Users"] -->|HTTP| alb

    subgraph aws["AWS us-east-1 · VPC (Terraform)"]
        bastion["SSM bastion"]
        alb["ALB<br/>Gateway API, path routing"]
        subgraph eks["EKS · private API endpoint"]
            argocd["argocd<br/>Argo CD + Image Updater"]
            app["default<br/>frontend (nginx), API (Go)<br/>Postgres, Redis"]
            mon["monitoring<br/>Prometheus, Alertmanager, Grafana"]
            logs["logging<br/>Elasticsearch, Kibana, Filebeat"]
            sec["vault + external-secrets"]
            sys["kube-system<br/>LB Controller, metrics-server, EBS CSI"]
        end
    end

    repo -->|Argo CD pulls| argocd
    ghcr -->|Image Updater polls tags| argocd
    argocd -->|syncs| app
    alb -->|"/ and /v1"| app
    alb -->|"/argocd, /grafana, /kibana"| eks
    bastion -->|kubectl| eks
    sec -->|Secrets| app
    mon -->|alerts| slack["Slack"]
```

### Request routing (one ALB)

| Path | Backend | Health check |
| --- | --- | --- |
| `/v1/*` | Go API | `/v1/health` |
| `/argocd*` | Argo CD | `/argocd/healthz` |
| `/grafana*` | Grafana | `/grafana/api/health` |
| `/kibana*` | Kibana | `/kibana/login` |
| `/*` | React frontend (nginx) | `/` |

Targets are pod IPs (`targetType: ip`); Prometheus is intentionally not exposed (it has no authentication).

### From commit to production

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub Actions
    participant GHCR
    participant IU as Image Updater
    participant Argo as Argo CD
    participant K8s as EKS
    Dev->>GH: push to main
    GH->>GH: gofmt, go vet, go test -race
    GH->>GH: docker build, Trivy scan (fail on HIGH/CRITICAL)
    GH->>GHCR: push go-feed:sha-commit
    IU->>GHCR: poll every 2 min (newest-build, ^sha-)
    IU->>Argo: set new image tag on the Application
    Argo->>K8s: render chart, rolling update
    K8s->>K8s: migrate init container applies new SQL, then the API starts
```

---

## Tech stack

| Area | Tools |
| --- | --- |
| Application | Go 1.26 (chi, JWT, lib/pq, go-redis, SendGrid, Prometheus client), React + Vite, nginx |
| Containers | Multi-stage Docker builds, `FROM scratch` Go images, non-root nginx |
| Infrastructure | Terraform (terraform-aws-modules VPC + EKS), AWS EKS 1.32, EC2, EBS gp3, KMS, S3, SSM |
| Networking | AWS Load Balancer Controller v3.5, Kubernetes Gateway API |
| GitOps / CD | Argo CD, Argo CD Image Updater, Helm, Kustomize |
| CI | GitHub Actions, Trivy, GitHub Container Registry |
| Secrets | HashiCorp Vault, External Secrets Operator |
| Data | PostgreSQL 16, Redis 8, golang-migrate (embedded migrations) |
| Observability | kube-prometheus-stack (Prometheus, Alertmanager, Grafana), Slack |
| Logging | ECK: Elasticsearch 9, Kibana, Filebeat |
| Scaling | metrics-server, HorizontalPodAutoscaler, PodDisruptionBudget, k6 for load tests |

---

## Repository structure

```
.
├── cmd/
│   ├── api/                  # Go API: routes, middleware, handlers, /metrics
│   └── migrate/              # migration tool (embedded SQL), -seed for sample data
├── internal/                 # store (Postgres), cache (Redis), auth, mailer, rate limiter
├── frontend/                 # React app + nginx config + Dockerfile
├── Dockerfile                # API (default) or migrations (--build-arg CMD=migrate)
├── .github/workflows/        # ci.yaml, frontend-ci.yaml
├── terraform/
│   ├── bootstrap/state/      # S3 remote-state bucket
│   ├── environments/dev/     # the stack: backend, providers, tfvars
│   └── modules/              # network, eks (+ IAM), bastion, platform
├── deploy/
│   ├── bootstrap/            # Argo CD values + Application definitions (applied once)
│   ├── app/                  # Helm chart, Gateway, ExternalSecrets, Image Updater (synced by Argo CD)
│   ├── monitoring/           # kube-prometheus-stack values + manifests
│   └── logging/              # ECK stack values + manifests
└── docs/
    └── SETUP_GUIDE.md        # full step-by-step runbook
```

---

## Getting started

### Run locally 

```bash
docker compose up -d                                    # Postgres + Redis
export DB_ADDR="postgres://admin:adminpassword@localhost:5432/socialnetwork?sslmode=disable"
export ADDR=":3000" REDIS_ENABLED=true REDIS_ADDR=localhost:6379
go run ./cmd/migrate -seed                              # schema + sample data
go run ./cmd/api                                        # http://localhost:3000/v1/health
cd frontend && npm ci && npm run dev                    # http://localhost:4000
```

Seeded users log in as `Liam0@example.com` / `password`.

### Deploy to AWS

The full runbook, with every command, is in **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)**. In short:

1. **Terraform**: create the state bucket (`terraform/bootstrap/state`), then `terraform apply` in `terraform/environments/dev`.
2. **Connect** to the private cluster through the SSM bastion: `aws ssm start-session --target <bastion-id>`, then `aws eks update-kubeconfig --name go-feed-dev-eks`.
3. **Install the add-ons**: `ebs-gp3` StorageClass, Gateway API CRDs, AWS Load Balancer Controller, Argo CD, Image Updater, External Secrets Operator, Vault.
4. **Store secrets** in Vault at `secret/go-feed/production` and `secret/go-feed/monitoring`.
5. **Hand over to GitOps**:

    ```bash
    kubectl apply -f deploy/bootstrap/application.yaml
    kubectl apply -f deploy/bootstrap/metrics-server.yaml
    kubectl apply -f deploy/bootstrap/monitoring.yaml
    kubectl apply -f deploy/bootstrap/eck-operator.yaml
    kubectl apply -f deploy/bootstrap/logging.yaml
    ```

6. **Open** `http://<alb-hostname>/`, `/argocd`, `/grafana`, `/kibana`.

Cost while running: roughly $8-10/day (EKS control plane, 2 × t3.large, NAT gateway, ALB, EBS). See the guide's teardown section: controller-created resources must be removed before `terraform destroy`.

---

## Design decisions

| Decision | Why |
| --- | --- |
| Private EKS API + SSM bastion | No Kubernetes API or SSH exposed to the internet |
| GitOps pull model | CI never needs cluster credentials; Git is the audit log and rollback |
| EKS Pod Identity over IRSA | Simpler role binding, no per-role OIDC trust policies, no ServiceAccount annotations |
| Gateway API + one ALB | Teams own routes in their namespaces; one load balancer instead of five |
| `sha-<commit>` image tags | Immutable and traceable to a commit; `latest` is never deployed |
| Own migration binary instead of `migrate/migrate` | The upstream image had 5 HIGH CVEs; mine is built from patched dependencies, `FROM scratch` |
| Migrations as an init container | Runs before every API start, safe with replicas (advisory lock), works on the first sync |
| Topology in the chart, secrets in Vault | `DB_ADDR`, `REDIS_ADDR`, URLs come from the chart; Vault holds only real secrets |
| Route-pattern metric labels | `/v1/users/{userID}` instead of raw IDs keeps Prometheus cardinality bounded (covered by a test) |
| Prometheus not exposed | No authentication on Prometheus; Grafana Explore covers the same queries |
| HPA owns `replicas` | Deployments omit `replicas` when autoscaling, so Argo CD and the HPA never fight |

---

## Observability

**Metrics** (`/metrics`, scraped via a ServiceMonitor):

| Metric | Use |
| --- | --- |
| `http_requests_total{method,route,status}` | Traffic and error rate |
| `http_request_duration_seconds` | p50/p95/p99 latency per route |
| `go_sql_*{db_name="socialnetwork"}` | Connection pool usage and waits |
| `go_goroutines`, `go_memstats_*` | Runtime health |
| `go_feed_build_info{version}` | Running version |

```promql
100 * sum(rate(http_requests_total{job="go-feed",status=~"5.."}[5m]))
    / sum(rate(http_requests_total{job="go-feed"}[5m]))                       # error %
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="go-feed"}[5m])))
```

**Alerts**: Alertmanager groups by namespace and alert name and posts warnings and criticals to Slack (with resolved notices). The Slack webhook is read from a file mounted from a Vault-backed Secret.

**Logs**: Filebeat (DaemonSet) ships every container's logs to Elasticsearch; search them in Kibana with `kubernetes.container.name : "go-feed"`.

---

## Results

Load test with [k6](https://k6.io): 300 virtual users for 5 minutes against the frontend through the ALB.

| Measure | Result |
| --- | --- |
| Requests | 346,018 (~1,150 per second) |
| Failed requests | 0 |
| Latency | p50 225 ms, p95 287 ms (from India to us-east-1) |
| Autoscaling | 2 → 3 → 4 → 5 pods within 3 minutes; back to 2 after a 5-minute stabilization window |

---

## Problems solved along the way

A selection; each one is a real incident from building this:

- **ALB kept routing `/` to the API** after a route was deleted. The controller logs showed `AccessDenied ... SetRulePriorities`: the controller's IAM policy predated v3.5.0. Diffed it against the official policy, added the two missing actions via Terraform.
- **Load Balancer Controller crash-looping** because IMDSv2 hop limit 1 blocks pods from instance metadata (by design). Passed `vpcId` and `region` explicitly instead of weakening node security.
- **Every authenticated request returned 401** although tokens were valid: the user cache pointed at a Redis that did not exist, and the auth middleware reported any error as 401. Added Redis to the chart.
- **Argo CD sync failed with `spec.selector: field is immutable`** after migrating from plain manifests to the Helm chart's labels.
- **Trivy blocked the upstream migrations image** (5 HIGH CVEs); replaced it with a migration binary built from the project's own dependencies.
- **Seed data never appeared**: the seeder never committed its transaction, set no password on a `NOT NULL` column, and left users inactive. Fixed and shipped as an idempotent Argo CD PostSync Job.

---

## Roadmap

- HTTPS with a domain, ACM and ExternalDNS
- Manage the remaining hand-installed add-ons (Load Balancer Controller, Vault, External Secrets, Image Updater) as Argo CD Applications
- Image Updater Git write-back for a full audit trail
- Postgres backups to S3 (or RDS / CloudNativePG)
- Rate limiting on the real client IP (`X-Forwarded-For`) behind the ALB
- `preStop` hooks for zero-error rolling updates; Karpenter for node autoscaling

---
