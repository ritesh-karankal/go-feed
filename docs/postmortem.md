# GoFeed Postmortems: Top 5 Incidents

Five real incidents from building and running GoFeed on AWS EKS, written in a blameless postmortem format. Each one links to the full write-up in the [incident journal](journal.md), which has every command I ran and its output.

## How I debug

1. **Find out who actually answered.** A response's body, size and headers tell you whether nginx, the Go API or the load balancer replied.
2. **Reproduce outside the UI** with `curl`, so the frontend is out of the picture.
3. **Go one layer down at a time**, and read each system's own signals: Argo CD sync status, ReplicaSet events, controller logs, AWS API state.
4. **Prove suspects innocent one at a time** before changing anything.
5. **Fix in Git, not in the cluster**, and verify from the outside.

## Summary

| # | Incident | Layers involved | Severity | Time to resolve |
|---|---|---|---|---|
| 1 | [Website served the API's 404](#1-website-served-the-apis-404-stale-alb-rule) | ALB, Kubernetes controller, IAM, Terraform | High | ~35 min |
| 2 | [Every request returned 401 after login](#2-every-request-returned-401-after-login) | Frontend, Go API, Redis, Helm | High | ~20 min |
| 3 | [Load Balancer Controller down](#3-load-balancer-controller-down-three-failures-stacked) | Kubernetes, Helm, EC2 metadata, IAM | High | ~1 h |
| 4 | [Teardown blocked by `DependencyViolation`](#4-teardown-blocked-by-dependencyviolation) | Terraform, AWS VPC/ELB/EBS | High (cost) | same night |
| 5 | [Trivy blocked the migrations image](#5-trivy-blocked-the-migrations-image) | CI, container security, Go | Medium | ~30 min |

---

## 1. Website served the API's 404 (stale ALB rule)

**Impact:** The site's home page returned `404 page not found` for about 35 minutes. The API and Argo CD kept working.

**Detection:** `curl -i http://<alb>/` returned a 19-byte `text/plain` 404. That is Go's default response, not nginx's, so requests for `/` were reaching the API instead of the frontend.

**Investigation:**
- The ALB still had a listener rule (`/*` → API) from an HTTPRoute that had already been deleted, and it was evaluated before the frontend's rule.
- Restarting the Load Balancer Controller did not remove it, so this wasn't a stale cache.
- The controller's logs gave the real reason: `AccessDenied … elasticloadbalancing:SetRulePriorities`. Its internal model was correct, but it wasn't allowed to reorder the rules to remove the old one.

**Root cause:** The controller's IAM policy in Terraform was older than the controller version (v3.5.0). Diffing it against the official policy for that release showed exactly two missing actions.

**Resolution:** I replaced the policy file with the official v3.5.0 policy and applied only that one resource with `terraform apply -target=…`. Then I restarted the controller so it retried immediately. Result: three correct rules, `/` → 200 with the React app, and every target group healthy.

**Lessons:**
- An IAM policy belongs to a controller version; upgrade them together.
- Restarting a controller only helps when the cause is temporary. Its logs tell you why it can't do its job.

→ Full write-up: [INC-010](journal.md#inc-010--site-root-returns-the-apis-404-stale-alb-rule)

---

## 2. Every request returned 401 after login

**Impact:** Users could log in, but the app then spun forever. Every authenticated request failed for about 20 minutes.

**Detection:** The browser console showed `401 (Unauthorized)` straight after a successful login.

**Investigation:**
- I reproduced it with `curl`: login returned a valid JWT, but `GET /v1/users/{id}` with that token returned 401.
- I suspected JWT validation, so I tested it in isolation with a small Go test. It passed.
- The user record was fine too (active, valid role). That left the user cache: the API was configured to use Redis (`REDIS_ENABLED=true`, copied from my laptop into Vault), but no Redis existed in the cluster.

**Root cause:** The auth middleware reports **any** error as `401 unauthorized`, so a cache connection failure looked like an authentication problem.

**Resolution:** I added Redis to the Helm chart as a pure cache (no persistence, memory cap with LRU eviction) and had the chart point the API at it, overriding the Vault values. I tested it locally with Docker (two `200`s and a cache key present), then verified it live as requests went from `401` to `200` during the rollout.

**Lessons:**
- Infrastructure failures should return 500, not 401; a wrong status code sends you looking in the wrong place.
- Cluster topology (hosts, URLs) belongs in the chart; only real secrets belong in Vault.

→ Full write-up: [INC-018](journal.md#inc-018--login-spins-forever-every-request-returns-401-redis)

---

## 3. Load Balancer Controller down (three failures stacked)

**Impact:** For about an hour, no new routing reached the ALB; it had no listener at all, so the Argo CD UI was unreachable.

**Detection:** The HTTPRoute was `Accepted`, but the Gateway reported `attachedRoutes=0`, and the controller's Deployment showed `0/2` pods.

**Investigation and fixes:**
1. **Zero pods, not even failed ones,** meant pods couldn't be *created*, so I read the ReplicaSet events: `serviceaccount "aws-load-balancer-controller" not found`. A hand-run Helm install had stopped creating it. I set `serviceAccount.create=true`, then used `kubectl rollout restart` to skip the ReplicaSet's retry backoff.
2. **The new pod crash-looped:** `failed to fetch VPC ID from instance metadata`. The nodes block pods from the EC2 metadata service (IMDSv2 hop limit 1), which is a deliberate security setting. I passed `vpcId` and `region` explicitly instead of weakening it.
3. **A leftover duplicate `TargetGroupConfiguration`** was stuck deleting behind a finalizer that only the controller can remove. It cleared once the controller ran again.

**Root cause:** The add-on was installed and reinstalled by hand, and each install could silently drop a setting.

**Lessons:**
- Zero pods means read the ReplicaSet events, not pod logs.
- Don't weaken a security control to fix a symptom; give the program the information it needs.
- Install add-ons from Git so their configuration can't drift.

→ Full write-up: [INC-004](journal.md#inc-004--argo-cd-ui-not-reachable-load-balancer-controller-down)

---

## 4. Teardown blocked by `DependencyViolation`

**Impact:** Paid resources (cluster, nodes, load balancer, disks) stayed running longer than intended, at about $8–10 per day.

**Detection:**
- My first `terraform destroy` reported "0 destroyed". I had run it in the wrong folder, which I confirmed by listing what was still running in AWS.
- The second run, from the right folder, failed after 20 minutes with `DependencyViolation` on the internet gateway and the public subnets.

**Investigation:** I listed everything left in the VPC. The leftovers were an ALB, 5 target groups, 2 security groups and 3 network interfaces, all created by the Load Balancer Controller rather than Terraform. Terraform had destroyed the cluster, and with it the controller that would normally have cleaned them up. The data volumes also survived because the StorageClass uses `Retain`.

**Resolution:** I deleted the leftovers with the AWS CLI in dependency order: the load balancer first, then (once its network interfaces were released) the security groups, then the target groups, retrying them until AWS had detached them from the deleted listener. Then I finished `terraform destroy` (5 resources) and deleted the retained volumes and the unused DNS zone. A final sweep confirmed nothing billable was left except the state bucket, which I kept on purpose.

**Lessons:**
- Destroy in reverse order of creation: remove what Kubernetes controllers created while they still run, then run Terraform.
- "Destroy complete" with 0 resources is a warning sign, not a success.

→ Full write-up: [INC-021](journal.md#inc-021--teardown-destroy-in-the-wrong-folder-then-a-vpc-that-would-not-delete)

---

## 5. Trivy blocked the migrations image

**Impact:** None in production. I caught it before pushing, but it would have failed every CI build.

**Detection:** Before adopting the official `migrate/migrate` image for database migrations, I ran the same Trivy scan CI runs. It found 5 HIGH CVEs, all with fixes available, in old Go libraries compiled into the upstream binary.

**Resolution:** **I didn't lower the security gate.** Instead I wrote a small migration tool (`cmd/migrate`):
- It uses golang-migrate as a library, with the SQL files embedded in the binary.
- It retries the database connection, so it can start before Postgres is ready.
- It's built `FROM scratch` from my own up-to-date dependencies.

Tested locally (it waited for Postgres, applied 13 migrations, and a second run was a no-op), and both images now scan clean.

**Lesson:** Scan third-party images with the same rules as your own. When a tool fails the scan, rebuild it from patched dependencies rather than weakening the gate.

→ Full write-up: [INC-008](journal.md#inc-008--trivy-blocks-the-migrations-image-5-high-cves)

---

## Patterns across all 21 incidents

- **Laptop config leaking into the cluster** (`localhost` in Vault or as a code default) caused three outages. Fix: the Helm chart defines hosts and URLs; Vault holds only secrets.
- **Hand-installed components drifted.** Fix: everything in Git, applied by Argo CD or Terraform.
- **Misleading signals** (a wrong status code, "0 destroyed", "not reachable"). Fix: always check the layer below the summary.

The other 16 incidents, and the full debugging history, are in the [incident journal](journal.md).
