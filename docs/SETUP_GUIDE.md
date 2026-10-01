# GoFeed Platform Setup Guide

A step-by-step runbook for setting up, operating and tearing down the GoFeed platform: local development, AWS infrastructure with Terraform, the EKS cluster add-ons, GitOps with Argo CD, monitoring, logging and autoscaling.

Follow the parts in order the first time. Every command is meant to be copied; anything in `<angle brackets>` is a value you replace.

---

## Contents

0. [How the platform fits together](#0-how-the-platform-fits-together)
1. [Tools to install](#1-tools-to-install)
2. [Run the app locally](#2-run-the-app-locally)
3. [Fork the repo and set up CI](#3-fork-the-repo-and-set-up-ci)
4. [Build the AWS infrastructure (Terraform)](#4-build-the-aws-infrastructure-terraform)
5. [Connect to the private cluster](#5-connect-to-the-private-cluster)
6. [Install the cluster add-ons](#6-install-the-cluster-add-ons)
7. [Secrets in Vault](#7-secrets-in-vault)
8. [Deploy everything with Argo CD](#8-deploy-everything-with-argo-cd)
9. [Verify and log in](#9-verify-and-log-in)
10. [Day-to-day operations](#10-day-to-day-operations)
11. [Troubleshooting](#11-troubleshooting)
12. [Tear everything down](#12-tear-everything-down)

---

## 0. How the platform fits together

```
developer ──git push──▶ GitHub ──▶ GitHub Actions (test → build → Trivy → push to GHCR)
                          │                                        │
                          │ Argo CD pulls deploy/                  │ Image Updater polls new sha- tags
                          ▼                                        ▼
                ┌──────────────── EKS (private API) ────────────────┐
users ──HTTP──▶ ALB ──/v1──▶ API (Go) ──▶ Postgres, Redis           │
                 │  ──/───▶ frontend (nginx)                         │
                 │  ──/argocd, /grafana, /kibana──▶ tool UIs         │
                └────────────────────────────────────────────────────┘
```

Rules to keep in mind:

- **Git is the source of truth.** Never `kubectl edit` a resource Argo CD manages; it will be reverted. Change the file in `deploy/`, commit, push.
- **The EKS API is private.** All `kubectl` and `helm` commands run on the bastion host, reached through AWS Systems Manager (no SSH).
- **No secrets in Git.** Secret values live in Vault; Git only references them.

### Repository map

| Path | What it is |
| --- | --- |
| `cmd/api/` | Go API (chi router, JWT auth, Prometheus `/metrics`) |
| `cmd/migrate/` | Migration tool: embedded SQL, `-seed` flag for sample data |
| `internal/` | Store (Postgres), cache (Redis), auth, mailer, rate limiter |
| `frontend/` | React (Vite) app, served by nginx in production |
| `Dockerfile` | Builds the API (default) or migrations (`--build-arg CMD=migrate`) |
| `.github/workflows/` | `ci.yaml` (API + migrations), `frontend-ci.yaml` |
| `terraform/` | `bootstrap/state` (S3 state bucket), `environments/dev`, `modules/` |
| `deploy/bootstrap/` | Applied **by hand** once: Argo CD values and the Argo CD Applications |
| `deploy/app/` | Synced by the `go-feed` Application: Helm chart, Gateway, secrets, Image Updater |
| `deploy/monitoring/` | kube-prometheus-stack values and extra manifests |
| `deploy/logging/` | ECK (Elasticsearch, Kibana, Filebeat) values and extra manifests |

---

## 1. Tools to install

On your laptop:

| Tool | Version used | Check |
| --- | --- | --- |
| Go | 1.26.x | `go version` |
| Node.js | 20.x | `node -v` |
| Docker + Compose | recent | `docker compose version` |
| golang-migrate CLI (local dev only) | v4 | `migrate -version` |
| Terraform | ≥ 1.11 | `terraform version` |
| AWS CLI | v2 | `aws --version` |
| Session Manager plugin | latest | `session-manager-plugin --version` |
| kubectl, Helm (optional locally) | recent | `kubectl version --client`, `helm version` |

Configure AWS credentials for an IAM user or role that can create VPC, EKS, EC2, IAM and S3 resources:

```bash
aws configure            # or: export AWS_PROFILE=<profile>
aws sts get-caller-identity
```

---

## 2. Run the app locally

### 2.1 Start Postgres and Redis

```bash
git clone https://github.com/<your-user>/go-feed.git
cd go-feed
docker compose up -d          # postgres:16.3 on 5432, redis on 6379, redis-commander
docker ps
```

### 2.2 Environment variables

The API reads everything from environment variables (`internal/env`). Create `.envrc` (git-ignored; load it with [direnv](https://direnv.net/) or `source .envrc`):

```bash
export ADDR=":3000"
export POSTGRES_PASSWORD="adminpassword"          # matches docker-compose.yaml
export DB_ADDR="postgres://admin:${POSTGRES_PASSWORD}@localhost:5432/socialnetwork?sslmode=disable"
export REDIS_ENABLED=true
export REDIS_ADDR="localhost:6379"
export AUTH_TOKEN_SECRET="change-me"
export FRONTEND_URL="http://localhost:4000"
export SENDGRID_API_KEY=""                        # registration emails need a real key
export FROM_EMAIL="you@example.com"
```

### 2.3 Migrate, seed, run

```bash
go run ./cmd/migrate                # applies all migrations in cmd/migrate/migrations
go run ./cmd/migrate -seed          # optional: 100 users, 200 posts, 500 comments (password "password")
go run ./cmd/api                    # API on http://localhost:3000
curl http://localhost:3000/v1/health
```

New migration: `make migration <name>` (needs the golang-migrate CLI), then edit the generated `.up.sql` / `.down.sql`.

### 2.4 Frontend

```bash
cd frontend
npm ci
npm run dev                         # http://localhost:4000, proxies /v1 to localhost:3000
```

### 2.5 Checks CI will run

Run these before every push; CI fails if any of them fail:

```bash
gofmt -l cmd internal scripts       # must print nothing (fix with gofmt -w <file>)
go vet ./...
go test -race -count=1 ./...
```

---

## 3. Fork the repo and set up CI

1. Fork the repository on GitHub.
2. Replace the owner name everywhere it is hard-coded:

    ```bash
    grep -rn "ritesh-karankal" deploy/ .github/ Dockerfile
    ```

    Update `repoURL` in `deploy/bootstrap/*.yaml`, the image names in `deploy/app/helm/go-feed/values.yaml` and `deploy/app/argocd/image-updater.yaml`.
3. Push to `main`. GitHub Actions runs:
    - `ci.yaml`: `test` (gofmt, vet, race tests), then `build-scan-push` for `go-feed` and `go-feed-migrate` (Trivy fails the build on fixable HIGH/CRITICAL CVEs), then pushes `sha-<commit>` and `latest` to GHCR.
    - `frontend-ci.yaml`: same for `go-feed-frontend` when `frontend/**` changes.
4. **Make the three GHCR packages public**: GitHub → your profile → Packages → each package → Package settings → Change visibility → Public. The cluster pulls without credentials, and Image Updater reads tags anonymously.

Check a package is public:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:<owner>/go-feed:pull" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" https://ghcr.io/v2/<owner>/go-feed/tags/list
```

---

## 4. Build the AWS infrastructure (Terraform)

### 4.1 State bucket (once per AWS account)

```bash
cd terraform/bootstrap/state
terraform init
terraform apply -var state_bucket_name=<globally-unique-bucket-name>
```

Put that bucket name in the `backend "s3"` block of `terraform/environments/dev/main.tf`.

### 4.2 Variables

Create `terraform/environments/dev/terraform.tfvars` (git-ignored):

```hcl
aws_region            = "us-east-1"
project_name          = "go-feed"
environment           = "dev"
vpc_cidr              = "10.0.0.0/16"
cluster_name          = "go-feed-dev-eks"
cluster_version       = "1.32"
single_nat_gateway    = true                 # dev: one NAT to save cost
cluster_admin_role_arn = null                # null = the identity running Terraform becomes cluster admin
cluster_admin_cidrs   = []                   # e.g. a VPN range allowed to reach the private API
node_instance_types   = ["t3.large"]
node_min_size         = 2
node_max_size         = 6
node_desired_size     = 2
log_retention_days    = 30
enable_bastion        = true
bastion_instance_type = "t3.micro"
```

### 4.3 Apply

```bash
cd terraform/environments/dev
terraform init
terraform plan -out tfplan        # read it
terraform apply tfplan            # ~15-20 minutes
terraform output                  # cluster_name, vpc_id, bastion_instance_id, kubectl_command
```

What gets created: a 3-AZ VPC (private /20 and public /24 subnets, NAT gateway), an EKS cluster with a **private-only** API endpoint, a managed node group (2 × t3.large, AL2023, IMDSv2 hop limit 1), EKS add-ons (CoreDNS, kube-proxy, VPC CNI, Pod Identity agent, EBS CSI driver), IAM roles for the EBS CSI driver and the AWS Load Balancer Controller (via EKS Pod Identity), and an SSM-only bastion.

Write down `vpc_id`; you need it in step 6.

---

## 5. Connect to the private cluster

```bash
aws ssm start-session --target $(terraform -chdir=terraform/environments/dev output -raw bastion_instance_id)
bash -l                                        # SSM starts a plain sh; a login shell loads your PATH
```

On the bastion, install the tools once:

```bash
# AWS CLI v2
curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
sudo apt-get update && sudo apt-get install -y unzip git && unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
# kubectl
curl -sSLO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && sudo install kubectl /usr/local/bin/
# helm
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

Configure credentials on the bastion (the instance role only has SSM permissions), then point kubectl at the cluster:

```bash
aws configure                   # an identity that is an EKS cluster admin
aws eks update-kubeconfig --region us-east-1 --name go-feed-dev-eks
kubectl get nodes               # 2 nodes Ready
git clone https://github.com/<your-user>/go-feed.git && cd go-feed
```

> If `kubectl` says `exec: executable aws not found`, the AWS CLI is not on the PATH of your current shell: run `bash -l`, or `export PATH=$PATH:/usr/local/bin`.

---

## 6. Install the cluster add-ons

These are installed once with Helm, in this order. (They are the only parts not yet managed by Argo CD.)

### 6.1 StorageClass

```bash
kubectl apply -f deploy/app/storage/storageclass-gp3.yaml     # ebs-gp3: encrypted gp3, Retain, WaitForFirstConsumer
```

### 6.2 Gateway API CRDs and the AWS Load Balancer Controller

```bash
# Gateway API standard CRDs: use the version the controller's docs list as supported
GATEWAY_API_VERSION=<e.g. v1.3.0>
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml
# The controller's own Gateway CRDs (LoadBalancerConfiguration, TargetGroupConfiguration)
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.5.0/config/crd/gateway/gateway-crds.yaml

helm repo add eks https://aws.github.io/eks-charts && helm repo update
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system --version 3.5.0 \
  --set clusterName=go-feed-dev-eks \
  --set region=us-east-1 \
  --set vpcId=<vpc-id-from-terraform-output> \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller

kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller   # 2/2 Running
```

Why each setting matters (all four broke at least once):

- `serviceAccount.create=true` and that exact name: Terraform's Pod Identity association expects `kube-system/aws-load-balancer-controller`. Without the ServiceAccount, no pod can be created.
- `vpcId` and `region`: nodes use IMDSv2 with hop limit 1, so pods cannot read them from instance metadata; without them the controller crash-loops.
- The IAM policy in `terraform/modules/eks/files/lbc_iam_policy.json` must match the controller version. When you upgrade the controller, replace the file with `docs/install/iam_policy.json` from the same controller release tag.

### 6.3 Argo CD

```bash
helm repo add argo https://argoproj.github.io/argo-helm && helm repo update
helm install argo-cd argo/argo-cd -n argocd --create-namespace -f deploy/bootstrap/argocd-values.yaml
kubectl get pods -n argocd
```

The values file serves the UI at `/argocd` through the Gateway and enables Helm inside Kustomize (`--enable-helm`).

### 6.4 Argo CD Image Updater

```bash
helm install argocd-image-updater argo/argocd-image-updater -n argocd
kubectl get pods -n argocd | grep image-updater
```

### 6.5 External Secrets Operator

```bash
helm repo add external-secrets https://charts.external-secrets.io && helm repo update
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
kubectl get pods -n external-secrets
```

### 6.6 Vault

A single-node Vault with persistent storage:

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com && helm repo update
helm install vault hashicorp/vault -n vault --create-namespace \
  --set server.dataStorage.storageClass=ebs-gp3
kubectl get pods -n vault                       # vault-0 Running but 0/1 Ready until unsealed
```

Initialise and unseal (dev setup with one key; store the output somewhere safe, it cannot be recovered):

```bash
kubectl exec -n vault vault-0 -- vault operator init -key-shares=1 -key-threshold=1 -format=json > vault-init.json
kubectl exec -n vault vault-0 -- vault operator unseal $(python3 -c 'import json;print(json.load(open("vault-init.json"))["unseal_keys_b64"][0])')
```

Vault seals itself whenever its pod restarts; run the unseal command again after any restart.

---

## 7. Secrets in Vault

### 7.1 Configure Vault for the cluster

```bash
kubectl exec -n vault -it vault-0 -- sh
vault login                                         # paste root_token from vault-init.json
vault secrets enable -path=secret kv-v2
vault auth enable kubernetes
vault write auth/kubernetes/config kubernetes_host="https://${KUBERNETES_PORT_443_TCP_ADDR}:443"
vault policy write go-feed - <<'EOF'
path "secret/data/go-feed/*" {
  capabilities = ["read"]
}
EOF
vault write auth/kubernetes/role/go-feed-vault-role \
  bound_service_account_names=external-secrets \
  bound_service_account_namespaces=external-secrets \
  policies=go-feed ttl=1h
```

### 7.2 Write the app secrets

Still inside the Vault pod:

```bash
vault kv put secret/go-feed/production \
  ENV=production \
  ADDR=":8080" \
  POSTGRES_PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  AUTH_TOKEN_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  AUTH_BASIC_USER=admin \
  AUTH_BASIC_PASS="<strong-password>" \
  REDIS_PW="" REDIS_DB=0 \
  DB_MAX_OPEN_CONNS=30 DB_MAX_IDLE_CONNS=30 DB_MAX_IDLE_TIME=15m \
  SENDGRID_API_KEY="<sendgrid-key>" FROM_EMAIL="<sender@yourdomain>"

vault kv put secret/go-feed/monitoring \
  slack-webhook-url="<https://hooks.slack.com/services/...>" \
  grafana-admin-user=admin \
  grafana-admin-password="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"
exit
```

Rules:

- `POSTGRES_PASSWORD` must be URL-safe (no `@ : / ? # %`): the chart inserts it into the database URL. Hex is safe.
- **Do not** put `DB_ADDR`, `REDIS_ADDR`, `REDIS_ENABLED` or URLs in Vault. The Helm chart sets those from the cluster's own service names (and `deploy/app/values-dev.yaml`), and chart values override the Secret.

To get a Slack webhook: <https://api.slack.com/apps> → Create New App → From scratch → Incoming Webhooks → On → Add New Webhook → choose `#alertmanager`.

### 7.3 How secrets reach pods

`deploy/app/external-secrets/` contains the `ClusterSecretStore vault-backend` (how to reach Vault) and the `ExternalSecret go-feed-secrets` (copy every key of `go-feed/production` into a Kubernetes Secret, refreshed hourly). The API reads it with `envFrom`. Argo CD applies these in the next step.

---

## 8. Deploy everything with Argo CD

### 8.1 The app

```bash
kubectl apply -f deploy/bootstrap/application.yaml
kubectl get application go-feed -n argocd -w     # wait for Synced / Healthy (Ctrl+C)
```

This creates, from `deploy/app/`: the GatewayClass, Gateway and HTTPRoute (and with them the ALB), target group configs, the ExternalSecret, the ImageUpdater CR, and the Helm chart (frontend, API with a migrations init container, Postgres, Redis, HPAs, PDBs, ServiceMonitor, seed Job).

Find the ALB hostname:

```bash
kubectl get gateway go-feed-gateway -n default -o jsonpath='{.status.addresses[0].value}{"\n"}'
```

Put it in `deploy/app/values-dev.yaml` (`FRONTEND_URL` with `http://`, `EXTERNAL_URL` without), commit and push. Confirmation emails use `FRONTEND_URL` for the link.

### 8.2 metrics-server, monitoring, logging

```bash
kubectl apply -f deploy/bootstrap/metrics-server.yaml
kubectl apply -f deploy/bootstrap/monitoring.yaml
kubectl apply -f deploy/bootstrap/eck-operator.yaml
kubectl get pods -n logging -w                    # wait for elastic-operator-0 Running
kubectl apply -f deploy/bootstrap/logging.yaml
kubectl get applications -n argocd
```

Before logging, check node capacity (it needs about 3.5 GiB of memory requests):

```bash
kubectl describe nodes | grep -A7 "Allocated resources" | grep -E "Allocated|cpu|memory"
```

If memory requests are above ~60% on both nodes, raise `node_desired_size` to 3 in `terraform.tfvars` and `terraform apply` first.

---

## 9. Verify and log in

Base URL: `http://<alb-hostname>` (type `http://` explicitly; browsers may try `https://`, which is not configured).

| What | URL | User | Password |
| --- | --- | --- | --- |
| App | `/` | register, or a seeded user `Liam0@example.com` | `password` (seeded users) |
| API health | `/v1/health` | | |
| Argo CD | `/argocd` | `admin` | `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' \| base64 -d` |
| Grafana | `/grafana` | `kubectl get secret grafana-admin -n monitoring -o jsonpath='{.data.admin-user}' \| base64 -d` | same command with `admin-password` |
| Kibana | `/kibana` | `elastic` | `kubectl get secret elasticsearch-es-elastic-user -n logging -o go-template='{{.data.elastic \| base64decode}}'` |

Checklist:

```bash
kubectl get applications -n argocd                                  # all Synced / Healthy
kubectl get pods -A | grep -vE "Running|Completed"                  # nothing stuck
kubectl get hpa,pdb -n default                                      # cpu: x%/70%, REPLICAS 2
kubectl logs -n default deploy/go-feed -c migrate                   # migrations applied: version=13
kubectl logs -n default job/go-feed-seed                            # Seeding complete / already present
curl -s http://<alb-hostname>/v1/health
```

Test Slack alerting:

```bash
kubectl exec -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -c alertmanager -- \
  amtool alert add TestAlert severity=warning namespace=default \
  --annotation=summary="Test alert" --alertmanager.url=http://localhost:9093
```

A FIRING message arrives in about 30 s, RESOLVED about 5 minutes later.

Set log retention once (otherwise logs are never deleted and the 20Gi volume fills up):

```bash
PW=$(kubectl get secret elasticsearch-es-elastic-user -n logging -o go-template='{{.data.elastic | base64decode}}')
kubectl exec -n logging elasticsearch-es-default-0 -- curl -s -k -u "elastic:$PW" -H 'Content-Type: application/json' \
  -X PUT "https://localhost:9200/_ilm/policy/filebeat" -d '{"policy":{"phases":{
    "hot":{"actions":{"rollover":{"max_age":"1d","max_primary_shard_size":"10gb"}}},
    "delete":{"min_age":"7d","actions":{"delete":{}}}}}}'
```

---

## 10. Day-to-day operations

### Ship a code change

1. Branch, change code, run the checks from 2.5, open a PR (CI builds and scans but does not push).
2. Merge to `main`: CI pushes `sha-<commit>` images.
3. Within ~2 minutes Image Updater sets the new tag on the `go-feed` Application; Argo CD rolls the pods. The `migrate` init container applies new migrations first.

```bash
kubectl get deploy go-feed -n default -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl logs -n argocd deploy/argocd-image-updater-controller --since=10m | grep -iE "go-feed|error"
```

### Change configuration

Edit files under `deploy/` (for example replicas limits in `deploy/app/helm/go-feed/values.yaml`), render locally, commit, push:

```bash
kubectl kustomize --enable-helm deploy/app | less      # exactly what Argo CD will apply
```

### Argo CD from the command line

```bash
# status
kubectl get application go-feed -n argocd -o jsonpath='{.status.sync.status} / {.status.health.status} / {.status.operationState.phase}: {.status.operationState.message}{"\n"}'
# re-read Git now
kubectl annotate application go-feed -n argocd argocd.argoproj.io/refresh=normal --overwrite
# cancel a stuck sync and start a new one
kubectl patch application go-feed -n argocd --type json -p '[{"op":"remove","path":"/operation"}]'
kubectl patch application go-feed -n argocd --type merge -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
```

### Change a secret

```bash
kubectl exec -n vault -it vault-0 -- vault kv patch secret/go-feed/production SENDGRID_API_KEY="<new>"
kubectl annotate externalsecret go-feed-secrets -n default force-sync=$(date +%s) --overwrite
kubectl rollout restart deploy/go-feed -n default      # env vars are read at container start
```

### Look at metrics (Grafana → Explore → Prometheus)

```promql
sum by (route) (rate(http_requests_total{job="go-feed"}[5m]))
100 * sum(rate(http_requests_total{job="go-feed",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="go-feed"}[5m]))
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="go-feed"}[5m])))
go_sql_in_use_connections{job="go-feed"}
kube_horizontalpodautoscaler_status_current_replicas{namespace="default"}
```

Useful built-in dashboards: *Kubernetes / Compute Resources / Namespace (Pods)*, *Node Exporter / Nodes*.

### Look at logs (Kibana → Discover)

Create a data view once: Stack Management → Data Views → `filebeat-*`, timestamp `@timestamp`. Then:

```
kubernetes.namespace : "default" and kubernetes.container.name : "go-feed"
kubernetes.namespace : "default" and kubernetes.container.name : "go-feed-frontend"
kubernetes.container.name : "migrate"
```

### Load test the autoscaler

```bash
cat > load.js <<'EOF'
import http from 'k6/http';
const BASE = 'http://<alb-hostname>';
export const options = { stages: [{ duration: '30s', target: 300 }, { duration: '4m', target: 300 }, { duration: '30s', target: 0 }] };
export default function () { http.get(`${BASE}/`); http.get(`${BASE}/login`); }
EOF
docker run --rm -i -v $PWD/load.js:/load.js grafana/k6 run /load.js
```

Watch on the bastion: `kubectl get hpa go-feed-frontend -n default -w`. Expect 2 → 5 replicas within ~3 minutes and a scale-down 5 minutes after the load stops.

### Prometheus UI (not public on purpose)

```bash
# on the bastion
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090
# on your laptop
aws ssm start-session --target <bastion-instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["9090"],"localPortNumber":["9090"]}'
```

---

## 11. Troubleshooting

Start one layer below the symptom: Application status, then pod status, then pod logs, then the controller's logs.

| Symptom | Likely cause | What to run / do |
| --- | --- | --- |
| UI "not reachable", Gateway `attachedRoutes=0` | Load Balancer Controller not running | `kubectl get deploy,pods -n kube-system \| grep load`; `kubectl describe rs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller` |
| Controller pods never created | ServiceAccount missing | `helm upgrade ... --reuse-values --set serviceAccount.create=true`, then `kubectl rollout restart` |
| Controller CrashLoop: `failed to get VPC ID` | IMDS blocked by hop limit 1 | `--set vpcId=<vpc-id> --set region=us-east-1` |
| Controller log `AccessDenied ... elasticloadbalancing:<Action>` | IAM policy older than the controller | Replace `lbc_iam_policy.json` with the release's `iam_policy.json`, `terraform apply -target=module.platform.module.eks.aws_iam_policy.lbc` |
| Target group targets unhealthy | Health check path returns 404 | Set `healthCheckConfig.healthCheckPath` in the TargetGroupConfiguration |
| Argo sync error `spec.selector: field is immutable` | Deployment labels changed | `kubectl delete deployment <name> -n default`, then sync |
| Sync stuck `waiting for healthy state` | A Deployment never becomes healthy | Fix the crashing pod; cancel and restart the sync |
| Pod `CreateContainerConfigError` | Secret missing | `kubectl get externalsecret -A`; `kubectl describe externalsecret go-feed-secrets -n default` |
| API CrashLoop `dial tcp ...:5432` | Database unreachable | `kubectl get pods -n default \| grep postgres`; check `DB_ADDR` is set by the chart |
| Login works, then every request 401 | Cache error reported as 401 (Redis down/misconfigured) | `kubectl get pods -n default \| grep redis`; `kubectl logs deploy/go-feed \| grep -i unauthorized` |
| `Metrics API not available` | metrics-server not ready yet | `kubectl get apiservice v1beta1.metrics.k8s.io` |
| HPA `cpu: <unknown>` | No metrics yet or no CPU requests | Wait 1 min; `kubectl describe hpa <name> -n default` |
| CI fails at "Check formatting" | Unformatted Go file | `gofmt -l cmd internal scripts`, then `gofmt -w <file>` |
| CI fails at Trivy | Fixable HIGH/CRITICAL CVE | Update the dependency or base image; never lower the threshold |
| `kubectl`: `executable aws not found` | AWS CLI not on PATH in this shell | `bash -l` |
| Vault pod 0/1 Ready after restart | Vault sealed | Run the unseal command from 6.6 |

---

## 12. Tear everything down

The ALB and the data volumes were created by Kubernetes controllers, not Terraform. Remove them through Kubernetes **first**, or `terraform destroy` fails on the VPC and leaves billed volumes behind.

```bash
# on the bastion
# 0. Save the secrets you will need to rebuild
kubectl exec -n vault -it vault-0 -- vault kv get secret/go-feed/production
kubectl exec -n vault -it vault-0 -- vault kv get secret/go-feed/monitoring

# 1. Let deleted claims delete their EBS volumes (StorageClass uses Retain)
for pv in $(kubectl get pv -o jsonpath='{.items[*].metadata.name}'); do
  kubectl patch pv "$pv" -p '{"spec":{"persistentVolumeReclaimPolicy":"Delete"}}'
done

# 2. Delete the Argo CD Applications (this deletes the Gateway, so the controller deletes the ALB)
kubectl delete application -n argocd logging eck-operator monitoring metrics-server go-feed

# 3. Delete the volume claims (StatefulSet claims are never deleted automatically)
for ns in default monitoring logging vault; do kubectl delete pvc --all -n $ns; done

# 4. Wait until these are empty
kubectl get pv
kubectl get gateway -A
```

Check AWS from your laptop:

```bash
aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName'
aws ec2 describe-volumes --query 'Volumes[].[VolumeId,State,Size]' --output table
```

Then destroy from the **environment folder** (running it in `terraform/` does nothing: "No changes"):

```bash
cd terraform/environments/dev
terraform destroy          # read the plan, type yes; ~15-20 minutes
```

Keep the state bucket (`terraform/bootstrap/state`) if you plan to rebuild.

### If `terraform destroy` was run first

The VPC delete fails with `DependencyViolation`. Clean up with the AWS CLI, then run `terraform destroy` again:

```bash
LB=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?starts_with(LoadBalancerName,'k8s-')].LoadBalancerArn" --output text)
aws elbv2 delete-load-balancer --load-balancer-arn $LB
for tg in $(aws elbv2 describe-target-groups --query "TargetGroups[?starts_with(TargetGroupName,'k8s-')].TargetGroupArn" --output text); do
  aws elbv2 delete-target-group --target-group-arn $tg
done
# after ~1 minute: security groups the controller created
aws ec2 describe-security-groups --filters Name=group-name,Values='k8s-*' --query 'SecurityGroups[].GroupId' --output text \
  | xargs -n1 aws ec2 delete-security-group --group-id
# data volumes left "available" (this deletes the data)
aws ec2 describe-volumes --filters Name=status,Values=available --query 'Volumes[].VolumeId' --output text \
  | xargs -n1 aws ec2 delete-volume --volume-id
```

### Rebuild

`terraform apply` → section 5 → section 6 → put the saved secrets back (section 7) → `kubectl apply -f deploy/bootstrap/` (section 8). Argo CD recreates everything else, including the database schema and seed data.
