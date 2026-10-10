# GoFeed Incident Journal

Everything that broke while I built, ran and tore down the GoFeed platform on AWS (29 September – 2 October 2026), written up one incident at a time: what I saw, the exact commands I ran and what they printed, what I tried, what fixed it, and why it happened.

It is written so that someone who has never used Kubernetes or AWS can follow it. Each entry starts with a **Background** section that explains the concepts the error depends on.

---

## How to read this journal

### Conventions

- **Times** are IST (UTC+5:30), the clock on my laptop and in my git history. Where a log line shows UTC (`...Z` timestamps), I left it as printed.
- **Where a command ran** is shown in its prompt:
  - `laptop$` – my machine. It has the repo, Docker, Go, Terraform and the AWS CLI, but **cannot** reach the Kubernetes API (the cluster's API endpoint is private).
  - `bastion$` – an SSM session on the bastion EC2 instance inside the VPC. This is where `kubectl` and `helm` work.
  - `browser` / `GitHub UI` / `Argo CD UI` – something I looked at, not a command.
- **Outputs** are copied from my terminal and trimmed with `…` when long. Where an output was not captured, the block says `(output not captured)`, and where I show what the output should look like, it is labelled `expected output (not captured)`.
- **Redaction:** AWS account IDs, instance/volume/VPC/subnet/security-group/ENI IDs, IP addresses, the load balancer hostname, the EKS endpoint, tokens and request IDs are replaced with placeholders like `<account-id>`, `<alb-hostname>`, `<vpc-id>`.
- Commands marked `# suggested, not run` are recommendations I did not execute.

### The platform in one paragraph

GoFeed is a Go REST API (`cmd/api`) and a React frontend (`frontend/`, served by nginx). They run on **Amazon EKS** (managed Kubernetes) inside a private VPC built with **Terraform** (`terraform/`). **GitHub Actions** tests the code, builds container images, scans them with **Trivy** and pushes them to **GHCR**. **Argo CD** watches this Git repo (`deploy/`) and applies it to the cluster; **Argo CD Image Updater** rolls out new image tags. One AWS **Application Load Balancer (ALB)**, created by the **AWS Load Balancer Controller** from Kubernetes **Gateway API** objects, routes `/v1/*` to the API, `/` to the frontend, and `/argocd`, `/grafana`, `/kibana` to the tools. Secrets come from **HashiCorp Vault** through the **External Secrets Operator**. Postgres and Redis run inside the cluster. Prometheus/Grafana/Alertmanager (with Slack alerts) watch metrics, and Elasticsearch/Kibana/Filebeat hold logs.

The full design is described in [`docs/SETUP_GUIDE.md`](SETUP_GUIDE.md).

### Glossary

| Term | Plain meaning |
|---|---|
| **Pod** | One running copy of a container (or a few containers) in Kubernetes. |
| **Deployment** | Tells Kubernetes "keep N copies of this pod running" and replaces them during updates. |
| **ReplicaSet** | The object a Deployment uses to actually create pods. If pods cannot be created, the reason is in the ReplicaSet's *events*. |
| **Init container** | A container that must finish successfully before the pod's main container starts. |
| **Service** | A stable internal name and IP in front of a set of pods. |
| **Controller** | A program that watches Kubernetes objects and makes the real world match them (for example: creates an ALB for a Gateway). |
| **CRD / custom resource** | A new object type added to Kubernetes, such as `TargetGroupConfiguration` or `Elasticsearch`. |
| **Finalizer** | A "do not delete yet" marker. The object stays (in `Terminating`) until a controller finishes cleanup and removes the marker. |
| **ServiceAccount** | The identity a pod runs as inside Kubernetes. A pod cannot start if its ServiceAccount does not exist. |
| **Helm chart / release** | A package of Kubernetes YAML with configurable *values*. A *release* is one installed copy, with a numbered history of upgrades. |
| **Argo CD Application / sync** | Argo CD's record of "this Git folder belongs in this cluster". A *sync* applies Git's version to the cluster. |
| **Gateway / HTTPRoute** | Gateway API objects. The Gateway describes the load balancer and its listeners; HTTPRoutes are routing rules attached to it. |
| **Listener / rule / target group** | ALB parts. A listener accepts traffic on a port; rules match paths in priority order; a target group is the list of pod IPs a rule forwards to, plus a health check. |
| **IAM policy** | AWS permission list: which API calls an identity may make. |
| **IMDS** | The EC2 instance metadata service at `169.254.169.254`. A machine asks it about itself (region, VPC, credentials). |
| **EKS Pod Identity** | AWS feature that gives a specific Kubernetes ServiceAccount an IAM role, without static keys. |
| **PVC / PV / StorageClass** | A request for disk (claim), the actual disk (volume), and the template that says how disks are created (here: encrypted EBS gp3). |
| **GitOps** | Running infrastructure by changing Git; a tool in the cluster (Argo CD) applies the changes. |

### Entry format

Every incident follows the same template: Summary → Background → Timeline → What happened → How we got there → Why (root cause) → Impact → Resolution → Terminal commands → Code / config change → Lessons learned → How to approach it next time → Prevention / follow-up → References.

---

## Index

| ID | Date | Where | Symptom | Severity | Status |
|---|---|---|---|---|---|
| [INC-001](#inc-001--go-vet-fails-on-a-struct-tag) | 2026-10-01 | Go code, `internal/store/followers.go` | `go vet`: struct tag not compatible | Low | Resolved |
| [INC-002](#inc-002--rate-limiter-test-returns-200-instead-of-429) | 2026-10-01 | Go API middleware | Rate limiter test gets 200 instead of 429 | Medium | Resolved (follow-up open) |
| [INC-003](#inc-003--ci-fails-at-check-formatting-and-no-image-is-built) | 2026-10-01 | GitHub Actions `ci.yaml` | "Check formatting" fails, no image built | Medium | Resolved |
| [INC-004](#inc-004--argo-cd-ui-not-reachable-load-balancer-controller-down) | 2026-10-01 | AWS Load Balancer Controller | Argo CD UI not reachable | High | Resolved |
| [INC-005](#inc-005--argo-cd-sync-fails-specselector--field-is-immutable) | 2026-10-01 | Argo CD / Deployments | Sync failed: `spec.selector … field is immutable` | High | Resolved |
| [INC-006](#inc-006--argo-cd-sync-stuck-at-waiting-for-healthy-state) | 2026-10-01 | Argo CD | Sync stuck "waiting for healthy state" | Low | Explained |
| [INC-007](#inc-007--api-crash-loops-with-dial-tcp-15432-connection-refused) | 2026-10-01 | API pods / config | CrashLoop `dial tcp [::1]:5432` | High | Resolved |
| [INC-008](#inc-008--trivy-blocks-the-migrations-image-5-high-cves) | 2026-10-01 | CI / container image | Trivy: 5 HIGH CVEs in migrations image | Medium | Resolved |
| [INC-009](#inc-009--alb-health-checks-return-404) | 2026-10-01 | ALB target groups | Health checks get 404, targets unhealthy | Medium | Resolved |
| [INC-010](#inc-010--site-root-returns-the-apis-404-stale-alb-rule) | 2026-10-01 | ALB rules / IAM / Terraform | `/` returns the API's `404 page not found` | High | Resolved |
| [INC-011](#inc-011--domain-not-delegated-acm-certificate-stuck-pending) | 2026-10-01 | DNS / ACM | Domain does not resolve, certificate pending | Low | Workaround (HTTP) |
| [INC-012](#inc-012--confirmation-email-links-point-to-localhost4000) | 2026-10-01 | API config | Email link points to `localhost:4000` | High | Resolved (follow-up open) |
| [INC-013](#inc-013--slack-alert-targetdown-for-grafana) | 2026-10-01 | Monitoring | Slack: `TargetDown` for Grafana | Low | Resolved |
| [INC-014](#inc-014--kubectl-on-the-bastion-executable-aws-not-found) | 2026-10-01 | Bastion shell | `kubectl`: `executable aws not found` | Low | Resolved |
| [INC-015](#inc-015--kibana-shows-red-pod-01) | 2026-10-01 | Logging (ECK) | Kibana `red`, pod `0/1` | Low | Explained |
| [INC-016](#inc-016--error-metrics-api-not-available) | 2026-10-01 | metrics-server | `error: Metrics API not available` | Low | Explained |
| [INC-017](#inc-017--no-hpa-then-cpu-unknown-and-1-replica) | 2026-10-01 | HPA | No HPA, then `<unknown>` and 1 replica | Low | Explained |
| [INC-018](#inc-018--login-spins-forever-every-request-returns-401-redis) | 2026-10-02 | API auth / Redis | Login spins, every request 401 | High | Resolved (follow-up open) |
| [INC-019](#inc-019--request-dropped-during-a-rolling-update) | 2026-10-02 | Rollout behind ALB | One request got no response (`000`) | Medium | Open |
| [INC-020](#inc-020--seed-data-never-appears) | 2026-10-02 | Go seeder | Sample data never appears | Medium | Resolved |
| [INC-021](#inc-021--teardown-destroy-in-the-wrong-folder-then-a-vpc-that-would-not-delete) | 2026-10-02 | Terraform / AWS | "0 destroyed", then `DependencyViolation` | High (cost) | Resolved |

---

## INC-001 – `go vet` fails on a struct tag

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 13:00 IST) |
| **Where** | Go code, `internal/store/followers.go`; found while adding a `go vet` step to `.github/workflows/ci.yaml` |
| **Severity** | Low – no crash, but the API returned a wrong JSON field name |
| **Status** | Resolved (commit `1327981`) |

### Summary
A struct tag in the `Follower` type was missing its quotes (`json:follower_id`). Go ignored it, so the API sent the field as `FollowerID` instead of `follower_id`. `go vet` flagged it; adding the quotes fixed it.

### Background
- **Struct tags** are small strings attached to fields of a Go struct. The `encoding/json` package reads them to decide the JSON key name: ``UserID int64 `json:"user_id"` `` means "call this field `user_id` in JSON".
- The format is strict: `key:"value"`, **with double quotes**. A malformed tag is not a compile error; Go silently ignores it and falls back to the field name.
- **`go vet`** is Go's built-in static checker. It finds code that compiles but is almost certainly wrong, including malformed struct tags.

### Timeline
1. I was adding a "Vet & Test" job to CI and ran the same checks locally first.
2. `go vet ./...` failed on `followers.go` line 12.
3. I looked at the struct and saw one tag without quotes.
4. I checked whether the frontend depended on the wrong name (it did not), fixed the tag, and re-ran `go vet`.

### What happened (symptom)
```
internal/store/followers.go:12:2: struct field tag `json:follower_id` not compatible with reflect.StructTag.Get: bad syntax for struct tag value
```
From the outside: nothing visible; the API had been returning `"FollowerID"` in JSON instead of `"follower_id"`.

### How we got there
Running `go vet` for the first time on a codebase that had never been vetted.

### Why (root cause)
A typo (missing `"` … `"`) → the tag is invalid → `encoding/json` ignores it → the JSON key falls back to the Go field name `FollowerID`. Confirmed against the `reflect.StructTag` docs, which define the `key:"value"` syntax.

### Impact
- A wrong JSON field name in follower responses. The frontend never read this field, so no user-visible bug.
- No data affected.

### Resolution (step by step)
1. Fix the tag:
   `sed -i 's/`json:follower_id`/`json:"follower_id"`/' internal/store/followers.go` – rewrites the tag in place.
2. Verify: `go vet ./...` prints nothing when there are no problems.

### Terminal commands

**Finding it**
```
laptop$ go vet ./... && go test ./...
internal/store/followers.go:12:2: struct field tag `json:follower_id` not compatible with reflect.StructTag.Get: bad syntax for struct tag value

laptop$ sed -n 8,16p internal/store/followers.go
)

type Follower struct {
	UserID     int64  `json:"user_id"`
	FollowerID int64  `json:follower_id`
	CreatedAt  string `json:"created_at"`
}

laptop$ grep -rn "FollowerID\|follower_id" frontend/src cmd | head
cmd/migrate/migrations/000007_add_followers_table.up.sql:3:  follower_id bigint NOT NULL,
cmd/migrate/migrations/000007_add_followers_table.up.sql:6:  PRIMARY KEY (user_id, follower_id), --- Composite key
cmd/migrate/migrations/000007_add_followers_table.up.sql:8:  FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE
```
Only the SQL migration matched: the frontend never used the field, so renaming it was safe.

**Fixing it**
```
laptop$ sed -i 's/`json:follower_id`/`json:"follower_id"`/' internal/store/followers.go
laptop$ go vet ./...
(no output = no problems)
```

### Code / config change
```diff
-	FollowerID int64  `json:follower_id`
+	FollowerID int64  `json:"follower_id"`
```
Commit `1327981` ("fix: typo").

### Lessons learned
Code can compile, pass tests and still be wrong. Static checks catch a class of bugs that tests never exercise.

### How to approach it next time
- `go vet` output is `file:line:col: message`. Open that line; the message usually names the exact problem.
- Before renaming anything that appears in an API response, `grep` the frontend and other clients for the old name.

### Prevention / follow-up
- `go vet ./...` now runs in CI (job "Vet & Test") and blocks image builds.
- Optional next step: add `staticcheck` (it found another real bug, see INC-021's follow-up list).

### References
- `go vet`: https://pkg.go.dev/cmd/vet
- Struct tag syntax: https://pkg.go.dev/reflect#StructTag
- `encoding/json` field names: https://pkg.go.dev/encoding/json#Marshal

---

## INC-002 – Rate limiter test returns 200 instead of 429

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 13:00 IST) |
| **Where** | `cmd/api/middleware.go` (`RateLimiterMiddleware`), test `cmd/api/api_test.go` |
| **Severity** | Medium – the rate limiter did not limit anyone |
| **Status** | Resolved (commit `237ee02`); follow-up open for traffic behind the ALB |

### Summary
The rate limiter counted requests per `IP:port` instead of per IP. Every new TCP connection has a new source port, so every request got its own fresh counter and nothing was ever limited. Keying on the client IP fixed it.

### Background
- **Rate limiting** caps how many requests one client may send in a time window. GoFeed uses a fixed window: 20 requests per 5 seconds per client; request 21 gets HTTP **429 Too Many Requests**.
- A limiter needs a **key** that identifies "one client". The usual key is the client IP.
- In Go, `r.RemoteAddr` is the address of the TCP peer as `IP:port`, for example `127.0.0.1:54321`. The **port changes for every new connection**.
- The chi router middleware `ClientIPFromRemoteAddr` (already in the router chain) stores the IP **without** the port in the request context; `middleware.GetClientIP(ctx)` reads it back.

### Timeline
1. Same local check run as INC-001: `go test ./cmd/...`.
2. `TestRateLimiterMiddleware` failed twice: requests 21 and 22 got 200.
3. I read the middleware and saw it keyed on `r.RemoteAddr`.
4. I listed the chi helpers available, switched the key to `GetClientIP`, re-ran the tests.

### What happened (symptom)
```
--- FAIL: TestRateLimiterMiddleware (0.02s)
    api_test.go:50: expected status Too Many Requests; got 200 OK
    api_test.go:50: expected status Too Many Requests; got 200 OK
FAIL
FAIL	github.com/ritesh-karankal/go-feed/cmd/api	0.058s
```

### How we got there
The test sends 22 requests in a loop. It closes each response body with `defer` (which only runs when the test function ends), so the HTTP client cannot reuse the connection and opens a **new** one for each request.

### Why (root cause)
Limiter key = `r.RemoteAddr` = `IP:port` → every new connection has a new port → every request has a different key → each key's counter is 1 → nothing ever reaches 20. Confirmed by reading `internal/ratelimiter/fixed-window.go` (one counter per key) and chi's `client_ip.go` source.

### Impact
- In production the limiter limited **per connection**, not per user, so it gave no protection.
- No data affected.

### Resolution (step by step)
1. Read the client IP that chi already extracted:
   ```go
   clientIP := middleware.GetClientIP(r.Context())
   if clientIP == "" {
       clientIP = r.RemoteAddr
   }
   if allow, retryAfter := app.rateLimiter.Allow(clientIP); !allow {
   ```
2. Verify: `go test -race -count=1 ./...` – the rate-limit test passes.

### Terminal commands

**Finding it**
```
laptop$ go test ./cmd/... 2>&1 | grep -v "^20" | head
--- FAIL: TestRateLimiterMiddleware (0.02s)
    api_test.go:50: expected status Too Many Requests; got 200 OK
    api_test.go:50: expected status Too Many Requests; got 200 OK
…
FAIL	github.com/ritesh-karankal/go-feed/cmd/api	0.058s

laptop$ grep -n -A12 "func (app \*application) RateLimiterMiddleware" cmd/api/middleware.go
162:func (app *application) RateLimiterMiddleware(next http.Handler) http.Handler {
163-	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
164-		if app.config.rateLimiter.Enabled {
165-			if allow, retryAfter := app.rateLimiter.Allow(r.RemoteAddr); !allow {
…

laptop$ sed -n 87,95p cmd/api/api.go
	r.Use(middleware.RequestID)
	r.Use(middleware.ClientIPFromRemoteAddr)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(app.RateLimiterMiddleware)

laptop$ grep -n "^func " $(go list -m -f '{{.Dir}}' github.com/go-chi/chi/v5)/middleware/client_ip.go
41:func ClientIPFromHeader(trustedHeader string) func(http.Handler) http.Handler {
85:func ClientIPFromXFF(trustedIPPrefixes ...string) func(http.Handler) http.Handler {
138:func ClientIPFromXFFTrustedProxies(numTrustedProxies int) func(http.Handler) http.Handler {
176:func ClientIPFromRemoteAddr(h http.Handler) http.Handler {
192:func GetClientIP(ctx context.Context) string {
```

**Fixing it**
```
laptop$ go vet ./... && go test -race -count=1 ./... 2>&1 | grep -E "^(ok|FAIL)"
ok  	github.com/ritesh-karankal/go-feed/cmd/api	1.208s
```

### Code / config change
```diff
-			if allow, retryAfter := app.rateLimiter.Allow(r.RemoteAddr); !allow {
+			// Key on the client IP (set by the ClientIP middleware), not
+			// r.RemoteAddr, which includes the per-connection source port.
+			clientIP := middleware.GetClientIP(r.Context())
+			if clientIP == "" {
+				clientIP = r.RemoteAddr
+			}
+			if allow, retryAfter := app.rateLimiter.Allow(clientIP); !allow {
```
Commit `237ee02`.

### Lessons learned
A failing test that "looks wrong" is often right. The test exposed a real production bug.

### How to approach it next time
- When a counter or cache "never fills", print the **key** it uses. A key that changes every time is the classic cause.
- `RemoteAddr` is `IP:port`; never use it as a client identity.

### Prevention / follow-up
- **Open:** behind the ALB, every request arrives from the ALB's own IPs, so all users would share one limit (20 requests/5 s per ALB node). The fix is `middleware.ClientIPFromXFFTrustedProxies(1)`, which reads the real client from the `X-Forwarded-For` header the ALB adds. `# suggested, not run`
- The race-enabled test suite runs in CI.

### References
- chi middleware (client IP helpers): https://pkg.go.dev/github.com/go-chi/chi/v5/middleware
- `http.Request.RemoteAddr`: https://pkg.go.dev/net/http#Request
- ALB `X-Forwarded-For`: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html

---

## INC-003 – CI fails at "Check formatting" and no image is built

| | |
|---|---|
| **Date** | 2026-10-01 (13:15 IST, commit `1398d87`; again 21:57 IST, commit `abc67ae`) |
| **Where** | GitHub Actions `.github/workflows/ci.yaml`, job "Vet & Test" › step "Check formatting" |
| **Severity** | Medium – blocks every deployment until fixed |
| **Status** | Resolved (commits `484b67c` and `9a741a7`) |

### Summary
The new CI format check rejected two test files that were missing a final newline, and later two files with unsorted imports. Because the image build depends on the test job, no new image was pushed and nothing deployed. Running `gofmt -w` on the files fixed it.

### Background
- **`gofmt`** is Go's official formatter. `gofmt -l <dirs>` **lists** files that are not formatted (it does not fail by itself), and `gofmt -w <file>` rewrites a file in the standard format. Two things it enforces that are easy to miss: a newline at the end of the file, and sorted import groups.
- My CI step turns the list into a failure:
  ```bash
  unformatted=$(gofmt -l cmd internal scripts)
  if [ -n "$unformatted" ]; then echo "$unformatted"; exit 1; fi
  ```
- The build job has `needs: test`. In GitHub Actions, a job with `needs` only runs if the job it needs succeeded. So a formatting failure means **no image build, no push, no deploy**, silently.

### Timeline
1. I pushed the new CI workflow (commit `1398d87`).
2. No new image appeared in GHCR, and Image Updater kept the old tag.
3. I listed the workflow runs and steps through the GitHub API: "Check formatting" had failed.
4. The check passed on my laptop, so I ran it against exactly what was committed: two test files failed.
5. `gofmt -d` showed only a missing final newline. I had fixed this earlier, but the change was lost before the commit. I ran `gofmt -w` and pushed (commit `484b67c`); CI passed.
6. Later the same step failed at commit `abc67ae` (expvar metrics) because of unsorted imports; fixed in the next commit (`9a741a7`).

### What happened (symptom)
In the GitHub Actions tab: a red ❌ on "CI - Build, Scan & Push", job "Vet & Test" failed at "Check formatting", job "Build, Scan & Push" skipped.

### How we got there
Pushing commits that had not been run through `gofmt`. Locally the files had been formatted at one point, but the working tree and the commit differed.

### Why (root cause)
Files not in `gofmt` format → `gofmt -l` lists them → the CI step exits 1 → job `test` fails → job `build-scan-push` (`needs: test`) is skipped → no image → nothing to deploy.

### Impact
- About 30 minutes of "why is my change not deployed" the first time.
- No runtime impact; the previous image kept running.

### Resolution (step by step)
1. See what changes `gofmt` wants: `gofmt -d <file>` prints a diff.
2. Apply it: `gofmt -w <file>`.
3. Check nothing else is unformatted: `gofmt -l cmd internal scripts` must print nothing.
4. Commit and push; verify the workflow run turns green.

### Terminal commands

**Finding it** (the `gh` CLI was not installed, so I used the public GitHub API)
```
laptop$ gh run list --limit 8
/bin/bash: line 1: gh: command not found

laptop$ curl -s "https://api.github.com/repos/<owner>/go-feed/actions/runs?per_page=8" | python3 -c '…print created_at, name, sha, event, conclusion…'
2026-10-01T07:45 CI - Build, Scan & Push 1398d87 push completed failure
2026-10-01T05:51 Frontend CI - Build, Scan & Push 3038323 push completed success
2026-10-01T05:37 CI - Build, Scan & Push 1a11eb1 push completed success
…

laptop$ curl -s "https://api.github.com/repos/<owner>/go-feed/actions/runs/<run-id>/jobs" | python3 -c '…print job and step conclusions…'
JOB Vet & Test failure
    Set up job success
    Checkout code success
    Set up Go success
    Check formatting failure
    Go vet skipped
    Go test skipped
    Post Set up Go skipped
    Post Checkout code success
    Complete job success
JOB Build, Scan & Push skipped

laptop$ mkdir -p <scratch>/head && git archive HEAD cmd internal scripts | tar -x -C <scratch>/head && (cd <scratch>/head && gofmt -l cmd internal scripts)
cmd/api/api_test.go
cmd/api/users_test.go

laptop$ gofmt -d cmd/api/api_test.go cmd/api/users_test.go | head -30
diff cmd/api/api_test.go.orig cmd/api/api_test.go
--- cmd/api/api_test.go.orig
+++ cmd/api/api_test.go
@@ -51,4 +51,4 @@
 			}
 		}
 	}
-}
\ No newline at end of file
+}
diff cmd/api/users_test.go.orig cmd/api/users_test.go
…
-}
\ No newline at end of file
+}
```

**Fixing it**
```
laptop$ gofmt -w cmd/api/api_test.go cmd/api/users_test.go && gofmt -l cmd internal scripts
(no output = all files formatted)

laptop$ git add cmd/api/api_test.go cmd/api/users_test.go
laptop$ git commit -m "style: gofmt test files"
laptop$ git push
```
expected output (not captured): the next run of "CI - Build, Scan & Push" for `484b67c` shows `success`, and GHCR gets `go-feed:sha-484b67c…`.

**Second occurrence (commit `abc67ae`)**
```
laptop$ curl -s "https://api.github.com/repos/<owner>/go-feed/actions/runs?per_page=3" | python3 -c '…'
2026-10-01T16:27 CI - Build, Scan & Push abc67ae failure
2026-10-01T09:12 CI - Build, Scan & Push c9e9ce6 success
2026-10-01T08:13 CI - Build, Scan & Push 484b67c success

laptop$ gofmt -d cmd/api/api.go cmd/api/main.go | head -40
diff cmd/api/api.go.orig cmd/api/api.go
@@ -3,6 +3,7 @@
 import (
 	"context"
 	"errors"
+	"expvar"
 	"fmt"
…
-	"expvar"
diff cmd/api/main.go.orig cmd/api/main.go
@@ -1,9 +1,9 @@
 import (
-	"time"
 	"expvar"
 	"runtime"
+	"time"

laptop$ gofmt -w cmd/api/api.go cmd/api/main.go && gofmt -l cmd internal scripts
(no output)
```

### Code / config change
Whitespace and import order only. Commits `484b67c` ("style: gofmt test files") and `9a741a7` (included the import fix).

### Lessons learned
- A failing early CI job silently stops everything after it. "My change isn't deployed" can be a CI problem, not a cluster problem.
- Check the **committed** state (`git archive HEAD`), not the working tree, when CI and your laptop disagree.

### How to approach it next time
1. Open the Actions tab (or the API) and find the first failed step.
2. Reproduce that step locally with the exact same command.
3. If it passes locally, test against `HEAD`, not your working copy.

### Prevention / follow-up
- Run `gofmt -l cmd internal scripts` before every push, or enable format-on-save in the editor (VS Code Go extension does this by default).
- Optional: a git pre-commit hook that runs `gofmt -l`. `# suggested, not run`

### References
- gofmt: https://pkg.go.dev/cmd/gofmt
- GitHub Actions `needs`: https://docs.github.com/en/actions/using-jobs/using-jobs-in-a-workflow
- GitHub REST API, workflow runs: https://docs.github.com/en/rest/actions/workflow-runs

---

## INC-004 – Argo CD UI not reachable (Load Balancer Controller down)

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 12:30 – 13:31 IST) |
| **Where** | AWS Load Balancer Controller (LBC) in `kube-system`, installed by hand with Helm; Gateway `go-feed-gateway` |
| **Severity** | High – no new routing could reach the ALB; the ALB had no listener at all |
| **Status** | Resolved (Helm values on the cluster; no repo commit) |

### Summary
The Argo CD UI (and anything else new) was unreachable because the AWS Load Balancer Controller was not running. Three separate problems were stacked: its ServiceAccount did not exist (no pods could be created), then it crashed because it could not discover its VPC, and a leftover duplicate configuration object was also present. All three came from installing and re-installing the controller by hand.

### Background
- **What the LBC does:** it watches Kubernetes Gateway API objects (`Gateway`, `HTTPRoute`) and AWS-specific ones (`LoadBalancerConfiguration`, `TargetGroupConfiguration`), and creates/updates a real AWS ALB to match: listeners, path rules, target groups. If the controller is down, the existing ALB is left exactly as it is and nothing new is configured.
- **ServiceAccounts and pods:** every pod runs as a ServiceAccount. If the named ServiceAccount does not exist, the ReplicaSet cannot create the pod at all. The error is not in any pod log (there is no pod); it is in the **ReplicaSet's events**.
- **EKS Pod Identity:** my Terraform creates an IAM role for the controller and links it to the ServiceAccount `kube-system/aws-load-balancer-controller` (`aws_eks_pod_identity_association`). The link matches on namespace + name; Terraform does **not** create the ServiceAccount itself. The Helm chart does, when `serviceAccount.create=true`.
- **IMDS and the hop limit:** an EC2 instance can ask `169.254.169.254` about itself. With IMDSv2, `http_put_response_hop_limit = 1` (set in `terraform/modules/eks/main.tf`) means the answer can only travel one network hop. A pod is one hop further than the node, so pods cannot reach IMDS. This is a deliberate security setting: it stops any pod from reading the node's IAM credentials.
- **Helm `--reuse-values`:** keeps the values of the previous release and only changes what you `--set`. If an earlier install had a wrong value, `--reuse-values` keeps the wrong value.
- **Finalizers:** a `TargetGroupConfiguration` carries the finalizer `gateway.k8s.aws/targetgroupconfigurations`. Only the controller removes it, so while the controller is down, deleting the object just leaves it in `Terminating`.

### Timeline
1. Argo CD pods were Running, its Service and HTTPRoute existed, and the Gateway had an ALB hostname. The browser said "not reachable".
2. Route status: `Accepted=True`, but the Gateway listener showed `attachedRoutes=0`.
3. Two `TargetGroupConfiguration`s pointed at the same Service (`app-tg-config`, a leftover, and `frontend-tg-config`). I deleted the leftover.
4. `kubectl logs deploy/aws-load-balancer-controller` timed out: the Deployment was `0/2` with **0** pods.
5. On AWS, the ALB had **no listener** (`'None' is not a valid listener ARN`).
6. ReplicaSet events: `serviceaccount "aws-load-balancer-controller" not found` (21 failures over 63 minutes). Helm release was on revision 6.
7. `helm upgrade … --set serviceAccount.create=true`. My first check showed nothing changed; `helm history` showed the upgrade did land in revisions 7/8 and the ServiceAccount was 79 s old.
8. `kubectl rollout restart` to skip the ReplicaSet's retry backoff. The new pod went into `CrashLoopBackOff`.
9. Pod logs: `failed to get VPC ID … ec2imds … context deadline exceeded`.
10. `helm upgrade … --set vpcId=… --set region=… --set clusterName=…`. Rollout succeeded.
11. Checked whether Gateway API support needed a feature gate: the controller had already built and deployed the Gateway model. `attachedRoutes=3`. The leftover `app-tg-config` finished deleting.
12. Argo CD UI loaded.

### What happened (symptom)
- Browser: `http://<alb-hostname>/argocd` → "This site can't be reached" (no response on port 80).
- AWS: `ValidationError … 'None' is not a valid listener ARN` (the ALB had no listener).
- Kubernetes: `deployment.apps/aws-load-balancer-controller   0/2     0            0           62m`.

### How we got there
The controller had been installed and upgraded by hand several times (Helm revision 6). One of those installs used `serviceAccount.create=false` (or the hand-made ServiceAccount was deleted), and no install ever set `vpcId`/`region`. Previous controller pods had created the ALB earlier; when they were replaced, the new ones could not start.

### Why (root cause)
Three chains:
1. Chart installed with `serviceAccount.create=false` → no ServiceAccount → ReplicaSet `FailedCreate` → 0 controller pods → nothing reconciles the Gateway → ALB never gets a listener → port 80 closed → "not reachable".
2. No `vpcId` value → controller asks IMDS for the VPC → hop limit 1 blocks pods → `context deadline exceeded` → controller exits → `CrashLoopBackOff`.
3. A hand-applied `app-tg-config` duplicated `frontend-tg-config` for the same Service → ambiguous configuration (and it could not finish deleting while the controller was down).

Checked against the LBC installation docs (required `clusterName`, `region`, `vpcId` when IMDS is unreachable; ServiceAccount requirements) and the ReplicaSet event text.

### Impact
- Argo CD UI, and any routing change, unavailable for about an hour.
- The API at `/v1` kept working where existing ALB configuration allowed; no data affected.

### Resolution (step by step)
1. Read the ReplicaSet events to see why pods were not being created (`kubectl describe rs …`). Expect a `FailedCreate` event with the reason.
2. Recreate the ServiceAccount through Helm, pinned to the same chart version so nothing else changes:
   `helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system --version 3.5.0 --reuse-values --set serviceAccount.create=true --set serviceAccount.name=aws-load-balancer-controller`.
3. Confirm it landed: `helm history …` shows a new revision; `kubectl get sa aws-load-balancer-controller -n kube-system` shows the account.
4. `kubectl rollout restart deploy/aws-load-balancer-controller -n kube-system` – makes the ReplicaSet retry now instead of after its backoff.
5. When the pod crashed, read its logs; then set the VPC explicitly:
   `helm upgrade … --reuse-values --set vpcId=<vpc-id> --set region=us-east-1 --set clusterName=go-feed-dev-eks`. The VPC ID comes from `terraform output -raw vpc_id`.
6. Verify: rollout `successfully rolled out`; controller log `successfully deployed model`; Gateway `attachedRoutes` > 0; `/argocd` loads.

### Terminal commands

**Finding it**
```
bastion$ kubectl get pods -n argocd
NAME                                                        READY   STATUS    RESTARTS   AGE
argo-cd-argocd-application-controller-0                     1/1     Running   0          99m
argo-cd-argocd-repo-server-f79f8d7bd-xdqwj                  1/1     Running   0          99m
argo-cd-argocd-server-7bdd9bf9b6-zl2xj                      1/1     Running   0          99m
argocd-image-updater-controller-57544db967-thtxt            1/1     Running   0          112m
…
bastion$ kubectl get svc -n argocd | grep server
argo-cd-argocd-server                      ClusterIP   <cluster-ip>     <none>        80/TCP,443/TCP      45h
bastion$ kubectl get httproute -n argocd
NAME                    HOSTNAMES   AGE
argo-cd-argocd-server               45h
bastion$ kubectl get gateway go-feed-gateway -n default -o jsonpath='{.status.addresses[0].value}{"\n"}'
<alb-hostname>

bastion$ kubectl get httproute argo-cd-argocd-server -n argocd -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status} {.reason}: {.message}{"\n"}{end}'
ResolvedRefs=True ResolvedRefs:
Accepted=True Accepted:
bastion$ kubectl get gateway go-feed-gateway -n default -o jsonpath='{range .status.listeners[*]}{.name} attachedRoutes={.attachedRoutes}{"\n"}{end}'
http attachedRoutes=0
bastion$ kubectl get targetgroupconfiguration -A
NAMESPACE   NAME                 SERVICE-NAME            AGE
argocd      argo-tg-config       argo-cd-argocd-server   101m
default     app-tg-config        go-feed-frontend        115m
default     backend-tg-config    go-feed                 93m
default     frontend-tg-config   go-feed-frontend        93m
bastion$ kubectl logs -n kube-system deploy/aws-load-balancer-controller --since=2h | grep -iE "error|argocd" | tail -15
error: timed out waiting for the condition

bastion$ kubectl get targetgroupconfiguration app-tg-config -n default -o yaml
apiVersion: gateway.k8s.aws/v1
kind: TargetGroupConfiguration
metadata:
  annotations:
    argocd.argoproj.io/tracking-id: go-feed:gateway.k8s.aws/TargetGroupConfiguration:default/app-tg-config
  finalizers:
  - gateway.k8s.aws/targetgroupconfigurations
  name: app-tg-config
  namespace: default
spec:
  defaultConfiguration:
    targetType: ip
  targetReference:
    name: go-feed-frontend
…
bastion$ kubectl delete targetgroupconfiguration app-tg-config -n default
targetgroupconfiguration.gateway.k8s.aws "app-tg-config" deleted from default namespace

bastion$ kubectl get deploy,pods -n kube-system | grep -i load
deployment.apps/aws-load-balancer-controller   0/2     0            0           62m

laptop$ ALB=<alb-hostname>
laptop$ LB_ARN=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='$ALB'].LoadBalancerArn" --output text)
laptop$ L_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $LB_ARN --query 'Listeners[0].ListenerArn' --output text)
laptop$ aws elbv2 describe-rules --listener-arn $L_ARN --query 'Rules[].{prio:Priority,path:Conditions[0].Values}' --output table
aws: [ERROR]: An error occurred (ValidationError) when calling the DescribeRules operation: 'None' is not a valid listener ARN

bastion$ kubectl get rs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
NAME                                      DESIRED   CURRENT   READY   AGE
aws-load-balancer-controller-8557455bcb   2         0         0       63m
bastion$ kubectl describe rs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller | tail -15
…
    SecretName:         aws-load-balancer-tls
  Priority Class Name:  system-cluster-critical
Conditions:
  Type             Status  Reason
  ----             ------  ------
  ReplicaFailure   True    FailedCreate
Events:
  Type     Reason        Age                   From                   Message
  ----     ------        ----                  ----                   -------
  Warning  FailedCreate  8m24s (x21 over 63m)  replicaset-controller  Error creating: pods "aws-load-balancer-controller-8557455bcb-" is forbidden: error looking up service account kube-system/aws-load-balancer-controller: serviceaccount "aws-load-balancer-controller" not found
bastion$ kubectl get sa aws-load-balancer-controller -n kube-system
Error from server (NotFound): serviceaccounts "aws-load-balancer-controller" not found
bastion$ helm list -n kube-system
NAME                        	NAMESPACE  	REVISION	UPDATED                                	STATUS  	CHART                             	APP VERSION
aws-load-balancer-controller	kube-system	6       	2026-10-01 06:49:44.875323301 +0000 UTC	deployed	aws-load-balancer-controller-3.5.0	v3.5.0
```

**Fixing it – step 1: the ServiceAccount**
```
bastion$ helm get values aws-load-balancer-controller -n kube-system
(output not captured)
bastion$ helm repo add eks https://aws.github.io/eks-charts 2>/dev/null; helm repo update eks
bastion$ helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system --version 3.5.0 --reuse-values \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller
(output not captured)

bastion$ kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
No resources found in kube-system namespace.
bastion$ kubectl get gateway go-feed-gateway -n default -o jsonpath='{range .status.listeners[*]}{.name} attachedRoutes={.attachedRoutes}{"\n"}{end}'
http attachedRoutes=0
bastion$ kubectl get targetgroupconfiguration -A
NAMESPACE   NAME                 SERVICE-NAME            AGE
argocd      argo-tg-config       argo-cd-argocd-server   105m
default     app-tg-config        go-feed-frontend        119m      <- still Terminating: its finalizer needs the controller
default     backend-tg-config    go-feed                 97m
default     frontend-tg-config   go-feed-frontend        97m

bastion$ helm history aws-load-balancer-controller -n kube-system | tail -3
6       	Thu Oct  1 06:49:44 2026	superseded	aws-load-balancer-controller-3.5.0	v3.5.0     	Upgrade complete
7       	Thu Oct  1 07:53:44 2026	superseded	aws-load-balancer-controller-3.5.0	v3.5.0     	Upgrade complete
8       	Thu Oct  1 07:54:18 2026	deployed  	aws-load-balancer-controller-3.5.0	v3.5.0     	Upgrade complete
bastion$ kubectl get sa aws-load-balancer-controller -n kube-system
NAME                           SECRETS   AGE
aws-load-balancer-controller   0         79s
bastion$ kubectl describe rs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller | grep -A3 Events | tail -3
  Type     Reason        Age                 From                   Message
  ----     ------        ----                ----                   -------
  Warning  FailedCreate  10m (x21 over 65m)  replicaset-controller  Error creating: … serviceaccount "aws-load-balancer-controller" not found

bastion$ kubectl rollout restart deploy/aws-load-balancer-controller -n kube-system
deployment.apps/aws-load-balancer-controller restarted
bastion$ kubectl rollout status deploy/aws-load-balancer-controller -n kube-system --timeout=120s
Waiting for deployment "aws-load-balancer-controller" rollout to finish: 0 out of 2 new replicas have been updated...
Waiting for deployment "aws-load-balancer-controller" rollout to finish: 1 out of 2 new replicas have been updated...
error: timed out waiting for the condition
```
The last `FailedCreate` event was 10 minutes old, from before the ServiceAccount existed. After 21 failures the ReplicaSet waits longer between retries; `rollout restart` made it try immediately.

**Fixing it – step 2: the VPC ID**
```
bastion$ kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller -o wide
NAME                                           READY   STATUS             RESTARTS      AGE     IP           NODE
aws-load-balancer-controller-df6cc8585-jcdj6   0/1     CrashLoopBackOff   4 (27s ago)   2m34s   <pod-ip>     <node-1>
bastion$ POD=$(kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --sort-by=.metadata.creationTimestamp -o name | tail -1)
bastion$ kubectl describe -n kube-system $POD | sed -n '/^Events:/,$p'
Events:
  Normal   Scheduled  2m36s                default-scheduler  Successfully assigned kube-system/aws-load-balancer-controller-df6cc8585-jcdj6 to <node-1>
  Normal   Pulled     34s (x5 over 2m35s)  kubelet            Container image "public.ecr.aws/eks/aws-load-balancer-controller:v3.5.0" already present on machine
  Normal   Started    34s (x5 over 2m35s)  kubelet            Started container aws-load-balancer-controller
  Warning  BackOff    1s (x13 over 2m23s)  kubelet            Back-off restarting failed container aws-load-balancer-controller …
bastion$ kubectl logs -n kube-system $POD --tail=30
{"level":"info","ts":"2026-10-01T07:58:18Z","msg":"version","GitVersion":"v3.5.0","GitCommit":"11eb202c…","BuildDate":"2026-08-03T22:03:44+0000"}
{"level":"error","ts":"2026-10-01T07:58:23Z","logger":"setup","msg":"unable to initialize AWS cloud","error":"failed to get VPC ID: failed to fetch VPC ID from instance metadata: error in fetching vpc id through ec2 metadata: get mac metadata: operation error ec2imds: GetMetadata, canceled, context deadline exceeded"}

laptop$ terraform -chdir=terraform/environments/dev output -raw vpc_id
<vpc-id>

bastion$ helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system --version 3.5.0 --reuse-values \
  --set vpcId=<vpc-id> \
  --set region=us-east-1 \
  --set clusterName=go-feed-dev-eks
bastion$ kubectl rollout status deploy/aws-load-balancer-controller -n kube-system --timeout=180s
deployment "aws-load-balancer-controller" successfully rolled out
bastion$ helm get values aws-load-balancer-controller -n kube-system
USER-SUPPLIED VALUES:
clusterName: go-feed-dev-eks
featureGates:
  GatewayAPI: true
region: us-east-1
serviceAccount:
  create: true
  name: aws-load-balancer-controller
vpcId: <vpc-id>
```

**Verifying (and ruling out a feature-gate problem)**

`featureGates.GatewayAPI` is not a real gate name (the controller's gates are `ALBGatewayAPI` / `NLBGatewayAPI`), so I checked what the controller actually ran with:
```
bastion$ kubectl get deploy aws-load-balancer-controller -n kube-system -o jsonpath='{.spec.template.spec.containers[0].args}' | tr ',' '\n'
["--cluster-name=go-feed-dev-eks"
"--ingress-class=alb"
"--aws-region=us-east-1"
bastion$ kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --since=10m | grep -iE "gateway|error|AccessDenied" | tail -20
{"level":"info","ts":"2026-10-01T08:01:11Z","logger":"controllers.gateway.k8s.aws/alb","msg":"Auto Create SG",…}
{"level":"info","ts":"2026-10-01T08:01:11Z","logger":"controllers.gateway.k8s.aws/alb","msg":"successfully built model","model":"{…\"80:1\" /argocd … \"80:2\" /v1 … \"80:3\" /* … \"80:4\" /* …}"}
{"level":"info","ts":"2026-10-01T08:01:11Z","logger":"controllers.gateway.k8s.aws/alb","msg":"successfully deployed model","gateway":{"name":"go-feed-gateway","namespace":"default"}}
bastion$ kubectl get gateway go-feed-gateway -n default -o jsonpath='{range .status.listeners[*]}{.name} attachedRoutes={.attachedRoutes}{"\n"}{end}'
http attachedRoutes=3
bastion$ kubectl get targetgroupconfiguration -A
NAMESPACE   NAME                 SERVICE-NAME            AGE
argocd      argo-tg-config       argo-cd-argocd-server   113m
default     backend-tg-config    go-feed                 106m
default     frontend-tg-config   go-feed-frontend        106m
```
No `--feature-gates` flag was passed and the Gateway controller still ran: in v3.5.0 Gateway API support is on by default. `app-tg-config` was finally gone. (The model's rule `80:3` turned out to be a stale route; that became INC-010.)
```
laptop$ curl -s -o /dev/null -w "/argocd/ -> %{http_code}\n" http://<alb-hostname>/argocd/
/argocd/ -> 200
```

### Code / config change
None in the repo: the fix was Helm values on the cluster. The SETUP_GUIDE now documents the four required values (`clusterName`, `region`, `vpcId`, `serviceAccount.create`).

### Lessons learned
- When a Deployment has **0** pods (not crashing pods, none), the reason is in the **ReplicaSet events**.
- `helm upgrade --reuse-values` carries forward old mistakes. Hand-managed releases drift.
- A security setting (IMDS hop limit) can look like a bug. The right fix is to give the program what it needs (the VPC ID), not to weaken the setting.
- Finalizers explain "deleted but still there".

### How to approach it next time
1. Route `Accepted` but `attachedRoutes=0` → the controller is not reconciling. Check the controller first.
2. `kubectl get deploy,pods -n kube-system | grep load` → are there pods at all?
3. 0 pods → `kubectl describe rs …` events. Pods crashing → `kubectl logs <pod>` (and `--previous`).
4. After fixing what blocked pod creation, `kubectl rollout restart` to skip backoff.
5. Confirm with the controller's own log line `successfully deployed model` and the Gateway's `attachedRoutes`.

### Prevention / follow-up
- **Open:** manage the controller from Git (an Argo CD Application with pinned chart version and values, or a Terraform `helm_release` fed by `module.network.vpc_id`), so `vpcId`, `region` and the ServiceAccount can never be lost again.
- Never `kubectl apply` routing objects by hand; they belong in `deploy/app/gateway/`.

### References
- LBC installation (Helm values, `vpcId`, `region`): https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/deploy/installation/
- LBC Gateway API guide: https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/gateway/gateway/
- IMDS hop limit: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-existing-instances.html
- EKS Pod Identity: https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html
- Finalizers: https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/
- `kubectl rollout`: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/
- Helm upgrade flags: https://helm.sh/docs/helm/helm_upgrade/

---

## INC-005 – Argo CD sync fails: `spec.selector … field is immutable`

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 13:35 IST) |
| **Where** | Argo CD Application `go-feed`; Deployments `go-feed` and `go-feed-frontend` in `default` |
| **Severity** | High – no app change could be deployed |
| **Status** | Resolved (one-time delete; no commit) |

### Summary
After I restructured the repo, Argo CD could not update the API and frontend Deployments: they had been created from old hand-written manifests with different labels than the Helm chart, and a Deployment's selector cannot change. Deleting both Deployments once and letting Argo CD recreate them fixed it.

### Background
- A **Deployment** finds "its" pods with a **label selector**, e.g. `matchLabels: {app: go-feed}`. In `apps/v1` the selector is **immutable**: Kubernetes rejects any change to it, because a changed selector could orphan the old pods or adopt someone else's.
- **Argo CD** applies the rendered manifests with `kubectl apply`-like patches. If a patch is rejected, the sync fails and the Application shows `SyncError`.
- **Auto-sync after a failure:** Argo CD does not retry the same commit automatically after a failed sync; it waits for a new commit or a manual sync.

### Timeline
1. I moved all deployable files into `deploy/app` (synced) and `deploy/bootstrap` (applied by hand), pushed (`a0a722b`, `1398d87`), and re-applied the Application with the new path.
2. Argo CD UI: `Degraded`, `OutOfSync`, `Sync failed`, `1 Error`.
3. I confirmed the new files were on GitHub (Argo CD only sees pushed commits).
4. The Application's status message showed the immutable-selector error for both Deployments.
5. The running Deployments were 45 hours old: created from the old `k8s/app/*.yaml` (label `app: go-feed`). The chart uses `app.kubernetes.io/name: go-feed`.
6. I deleted both Deployments; nothing came back (auto-sync does not retry a failed commit), so I started a sync manually; Argo CD recreated them.

### What happened (symptom)
Argo CD UI:
```
APP HEALTH     Degraded
SYNC STATUS    OutOfSync from HEAD (1398d87)
LAST SYNC      Sync failed to 1398d87
APP CONDITIONS 1 Error
```
Application condition:
```
Failed last sync attempt to [1398d87…]: one or more objects failed to apply, reason: error when patching "/dev/shm/309725455": Deployment.apps "go-feed" is invalid: spec.selector: Invalid value: v1.LabelSelector{MatchLabels:…}: field is immutable,error when patching "/dev/shm/1673830511": Deployment.apps "go-feed-frontend" is invalid: spec.selector: … field is immutable (retried 5 times).
```

### How we got there
The repo had **two** definitions of the same app: plain manifests in `k8s/app/` (used two days earlier) and the Helm chart. The cleanup deleted `k8s/app/`, so Argo CD now applied only the chart, whose labels differ.

### Why (root cause)
Deployments created from `k8s/app` with selector `app: go-feed` → chart renders selector `app.kubernetes.io/name: go-feed` → Argo CD patches the live Deployment → the API server rejects the selector change (immutable) → sync fails, retried 5 times, gives up. Confirmed in the Kubernetes Deployment docs (label selector updates).

### Impact
- No deployments possible for about 15 minutes.
- Deleting the Deployments briefly removed the frontend pods (seconds); the API was already crash-looping (INC-007).

### Resolution (step by step)
1. Read the exact failure from the Application status (`operationState.message`).
2. Delete the two Deployments once: `kubectl delete deployment go-feed go-feed-frontend -n default`. This also deletes their old ReplicaSets and pods.
3. Start a sync manually (auto-sync will not retry the failed commit):
   `kubectl patch application go-feed -n argocd --type merge -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'`
   (or click **Sync → Synchronize** in the UI).
4. Verify: `kubectl get deploy,pods -n default` shows new Deployments; the Application no longer shows the selector error.

### Terminal commands

**Finding it**
```
bastion$ kubectl apply -f deploy/bootstrap/application.yaml
application.argoproj.io/go-feed configured

laptop$ git fetch -q origin; git log --oneline -6 origin/main
1398d87 fix: update CI workflow to specify paths and add formatting check
a0a722b feat: restructure project
1327981 fix: typo
…
laptop$ git ls-tree -r --name-only 1398d87 | grep -E "^deploy"
deploy/app/argocd/argo-tg-config.yaml
…
deploy/app/kustomization.yaml
deploy/bootstrap/application.yaml
deploy/bootstrap/argocd-values.yaml

bastion$ kubectl get application go-feed -n argocd -o jsonpath='{.status.conditions[*].message}{"\n\n"}{.status.operationState.message}{"\n"}'
Failed last sync attempt to [1398d87af6b306e40acd7c4c439a99e4d8f396a5]: one or more objects failed to apply, reason: error when patching "/dev/shm/309725455": Deployment.apps "go-feed" is invalid: spec.selector: Invalid value: v1.LabelSelector{MatchLabels:v1.LabelSelectorRequirement(nil)}: field is immutable,error when patching "/dev/shm/1673830511": Deployment.apps "go-feed-frontend" is invalid: spec.selector: … field is immutable (retried 5 times).
bastion$ kubectl get application go-feed -n argocd -o jsonpath='{range .status.operationState.syncResult.resources[?(@.status!="Synced")]}{.kind}/{.name}: {.message}{"\n"}{end}'
Deployment/go-feed: error when patching "/dev/shm/309725455": Deployment.apps "go-feed" is invalid: spec.selector: … field is immutable
Deployment/go-feed-frontend: error when patching "/dev/shm/1673830511": Deployment.apps "go-feed-frontend" is invalid: spec.selector: … field is immutable
bastion$ kubectl get pods,externalsecret,clustersecretstore -n default
NAME                                   READY   STATUS             RESTARTS          AGE
pod/go-feed-57cd48bdfc-m9bs9           0/1     CrashLoopBackOff   291 (3m17s ago)   45h
pod/go-feed-6b86bb86d7-p79cq           0/1     CrashLoopBackOff   31 (4m34s ago)    137m
pod/go-feed-74c84d5bcb-jkfjb           0/1     InvalidImageName   0                 45h
pod/go-feed-frontend-965b46446-2s4mw   1/1     Running            6 (134m ago)      137m
pod/go-feed-frontend-965b46446-b4wbc   1/1     Running            0                 131m
NAME                                                 STORETYPE            STORE           REFRESH INTERVAL   STATUS         READY
externalsecret.external-secrets.io/go-feed-secrets   ClusterSecretStore   vault-backend   1h                 SecretSynced   True
NAME                                                         AGE   STATUS                  CAPABILITIES   READY
clustersecretstore.external-secrets.io/aws-secrets-manager   45h   InvalidProviderConfig                  False
clustersecretstore.external-secrets.io/vault-backend         46h   Valid                   ReadWrite      True
```

**Fixing it**
```
bastion$ kubectl delete deployment go-feed go-feed-frontend -n default
deployment.apps "go-feed" deleted from default namespace
deployment.apps "go-feed-frontend" deleted from default namespace
bastion$ kubectl get pods -n default
No resources found in default namespace.
bastion$ kubectl logs -n default deploy/go-feed --tail=30
error: error from server (NotFound): deployments.apps "go-feed" not found in namespace "default"

bastion$ kubectl patch application go-feed -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
application.argoproj.io/go-feed patched
bastion$ kubectl get pods -n default
NAME                                READY   STATUS             RESTARTS        AGE
go-feed-59fb48888-5wbm7             0/1     CrashLoopBackOff   6 (2m28s ago)   8m2s
go-feed-59fb48888-g6bdr             0/1     CrashLoopBackOff   6 (100s ago)    7m32s
go-feed-frontend-6d569c5d8d-6w8wx   1/1     Running            0               8m2s
go-feed-frontend-6d569c5d8d-vzcvj   1/1     Running            0               7m32s
```
The Deployments came back with the chart's labels. The frontend was healthy; the API still crashed, for a different reason (INC-007).

### Code / config change
The cause was introduced by the repo restructure (`a0a722b`), which correctly removed the duplicate `k8s/app/` manifests. The fix itself was a one-time cluster operation; no commit.

### Lessons learned
- Two definitions of one workload will drift apart. Keep one source of truth.
- Changing a Deployment's labels/selector requires delete + recreate.
- A failed sync is not retried for the same commit.

### How to approach it next time
1. Argo CD `SyncError` → read `status.operationState.message`; it names the object and the API error.
2. `field is immutable` → compare live vs rendered (`kubectl get deploy X -o yaml` vs `kubectl kustomize --enable-helm deploy/app`). If an immutable field differs, delete and let Argo CD recreate.
3. After fixing, trigger a sync manually.

### Prevention / follow-up
- Only `deploy/app` holds workloads now.
- Before changing chart labels on a live system, plan the delete/recreate (or use the Argo CD sync option `Replace=true` for that resource). `# suggested, not run`

### References
- Deployment label selector updates: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#label-selector-updates
- Argo CD automated sync (no retry of failed commit): https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/
- Argo CD sync options: https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/

---

## INC-006 – Argo CD sync stuck at "waiting for healthy state"

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 13:45 IST) |
| **Where** | Argo CD Application `go-feed` (`syncPolicy.syncOptions: PruneLast=true`) |
| **Severity** | Low – a symptom of INC-007, not a fault in Argo CD |
| **Status** | Explained |

### Summary
After INC-005 the sync never finished: Argo CD was waiting for the API Deployment to become healthy before its final prune step, and the API was crash-looping. Fixing the crash and restarting the sync resolved it.

### Background
- **Sync phases:** Argo CD applies resources, then (with `prune: true`) deletes resources that were removed from Git.
- **`PruneLast=true`** moves pruning to the very end and makes Argo CD wait until **all other resources are Healthy** first. That is safe (nothing is deleted while the new version is still coming up), but an unhealthy resource holds the whole sync in `Running`.
- An in-progress sync is stored in the Application's `operation` field; removing that field cancels it.

### Timeline
1. After the manual sync in INC-005, the UI kept saying "syncing".
2. I read the operation phase/message and the pod list.
3. The message named the API Deployment; its pods were in `CrashLoopBackOff`.
4. After fixing INC-007, I cancelled the operation and started a new sync.

### What happened (symptom)
```
Running: waiting for healthy state of apps/Deployment/go-feed
```

### How we got there
A sync started while the API could not start (no database, INC-007).

### Why (root cause)
API pods crash → Deployment never Healthy → `PruneLast` waits for health before pruning → sync stays `Running` until its timeout. Confirmed in the Argo CD sync-options docs.

### Impact
None by itself; it hid nothing that INC-007 did not already explain.

### Resolution (step by step)
1. Fix the unhealthy resource (INC-007).
2. Cancel the stuck operation: `kubectl patch application go-feed -n argocd --type json -p '[{"op":"remove","path":"/operation"}]'`.
3. Start a new sync: the `kubectl patch … operation …` command from INC-005.
4. Verify: phase becomes `Succeeded`; app `Synced` (and `Healthy` once everything runs).

### Terminal commands

**Finding it**
```
bastion$ kubectl get application go-feed -n argocd -o jsonpath='{.status.operationState.phase}: {.status.operationState.message}{"\n"}'
Running: waiting for healthy state of apps/Deployment/go-feed
bastion$ kubectl get pods -n default
NAME                                READY   STATUS             RESTARTS        AGE
go-feed-59fb48888-5wbm7             0/1     CrashLoopBackOff   6 (2m28s ago)   8m2s
go-feed-59fb48888-g6bdr             0/1     CrashLoopBackOff   6 (100s ago)    7m32s
go-feed-frontend-6d569c5d8d-6w8wx   1/1     Running            0               8m2s
go-feed-frontend-6d569c5d8d-vzcvj   1/1     Running            0               7m32s
```

**Fixing it** (after INC-007 was pushed)
```
bastion$ kubectl patch application go-feed -n argocd --type json -p '[{"op":"remove","path":"/operation"}]' 2>/dev/null
bastion$ kubectl patch application go-feed -n argocd --type merge \
  -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'
application.argoproj.io/go-feed patched
application.argoproj.io/go-feed patched
```

### Code / config change
None.

### Lessons learned
A sync stuck in `Running` almost always points at an unhealthy resource, not at Argo CD.

### How to approach it next time
Read `operationState.message`; it names the resource Argo CD is waiting for. Debug that resource (pods, events, logs), then cancel and re-sync.

### Prevention / follow-up
None needed; `PruneLast` behaved as designed.

### References
- Argo CD sync options (`PruneLast`): https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/
- Argo CD resource health: https://argo-cd.readthedocs.io/en/stable/operator-manual/health/

---

## INC-007 – API crash-loops with `dial tcp [::1]:5432: connection refused`

| | |
|---|---|
| **Date** | 2026-10-01 (found ≈ 13:45 IST; fixed ≈ 14:45 IST) – the pods had been crashing for ~45 h (291 restarts) |
| **Where** | API pods in `default`; config from Vault via the Secret `go-feed-secrets`; Helm chart `deploy/app/helm/go-feed` |
| **Severity** | High – the API never started |
| **Status** | Resolved (commit `c9e9ce6`) |

### Summary
The API exited immediately at startup because it could not reach Postgres at `localhost`. The `DB_ADDR` value in Vault had been copied from my laptop, and there was no database in the cluster at all. I added Postgres to the Helm chart, made the chart build `DB_ADDR` itself, and added a migrations init container.

### Background
- **CrashLoopBackOff:** the container keeps exiting; Kubernetes restarts it with growing delays (10 s, 20 s, … up to 5 min).
- **`localhost` inside a pod** means the pod itself. `[::1]` is the IPv6 form of localhost. Port 5432 is Postgres.
- **Secrets path:** Vault (`secret/go-feed/production`) → External Secrets Operator → Kubernetes Secret `go-feed-secrets` → the API reads all keys as environment variables with `envFrom`.
- **Env precedence:** an explicit `env:` entry overrides a variable with the same name from `envFrom`, and `$(VAR)` inside a value is expanded from variables defined before it. That lets the chart build a URL from a secret password.
- **StatefulSet:** like a Deployment, but each pod gets a stable name and its **own persistent disk** (`volumeClaimTemplates`). Right for databases.

### Timeline
1. After INC-005, the new API pods crash-looped immediately.
2. Pod logs: `dial tcp [::1]:5432: connect: connection refused` at `main.go:93`.
3. Listed the Secret's **key names** (not values): `DB_ADDR` was there, so its value pointed at localhost.
4. Realised there was no Postgres in the cluster at all.
5. Chose Postgres inside the cluster (cheaper and faster than RDS for dev).
6. Added a Postgres StatefulSet, an `ebs-gp3` StorageClass, a chart-built `DB_ADDR`, and a migrations init container (built in INC-008). Tested locally, pushed.
7. Migrations ran, pods became Ready, `/v1/health` returned OK through the ALB.

### What happened (symptom)
```
{"level":"fatal","ts":1790842542.6532767,"caller":"api/main.go:93","msg":"dial tcp [::1]:5432: connect: connection refused","stacktrace":"main.main\n\tgithub.com/ritesh-karankal/go-feed/cmd/api/main.go:93\nruntime.main\n\truntime/proc.go:290"}
```
Pods: `CrashLoopBackOff`, 291 restarts on the oldest one.

### How we got there
Vault's `secret/go-feed/production` was filled from my local `.env`, where `DB_ADDR=postgres://…@localhost:5432/…` is correct for development. The cluster had no database deployed.

### Why (root cause)
`DB_ADDR` = localhost → in a pod, localhost has no Postgres → `connect: connection refused` → `logger.Fatal` exits → CrashLoopBackOff. And even with a correct host, no database existed.

### Impact
- API down since the first deploy (~45 h of restarts).
- Frontend loaded but every API call failed.

### Resolution (step by step)
1. Read logs of the current and previous container: `kubectl logs deploy/go-feed` (`--previous` for the crashed one).
2. List the secret's key names safely (no values) to see which settings exist.
3. Add to the chart:
   - `templates/postgres-statefulset.yaml` and `postgres-service.yaml`: `postgres:16.15-alpine`, 10Gi `ebs-gp3` volume, `PGDATA=/var/lib/postgresql/data/pgdata` (a subfolder, because a new EBS volume contains `lost+found` and `initdb` refuses a non-empty directory), `pg_isready` probes, password from `POSTGRES_PASSWORD`.
   - `deploy/app/storage/storageclass-gp3.yaml`: encrypted gp3, `WaitForFirstConsumer`, `Retain`.
   - A helper that sets `DB_ADDR` in `env:` (overrides Vault):
     `postgres://admin:$(POSTGRES_PASSWORD)@go-feed-postgres:5432/socialnetwork?sslmode=disable`.
   - An init container `migrate` that applies the SQL migrations before the API starts.
4. Render locally (`kubectl kustomize --enable-helm deploy/app`), push, and re-sync (INC-006 commands).
5. Verify: `kubectl logs deploy/go-feed -c migrate` → `migrations applied: version=13`; pods `1/1 Running`; PVC `Bound`; `curl /v1/health` → `status: ok`.

### Terminal commands

**Finding it**
```
bastion$ kubectl logs -n default deploy/go-feed --tail=40
Found 2 pods, using pod/go-feed-59fb48888-5wbm7
{"level":"fatal","ts":1790842542.6532767,"caller":"api/main.go:93","msg":"dial tcp [::1]:5432: connect: connection refused","stacktrace":"main.main\n\tgithub.com/ritesh-karankal/go-feed/cmd/api/main.go:93\nruntime.main\n\truntime/proc.go:290"}
bastion$ kubectl logs -n default deploy/go-feed --previous --tail=40
Found 2 pods, using pod/go-feed-59fb48888-5wbm7
{"level":"fatal",…,"msg":"dial tcp [::1]:5432: connect: connection refused",…}
bastion$ kubectl get secret go-feed-secrets -n default -o jsonpath='{.data}' | python3 -c 'import sys,json;print(sorted(json.load(sys.stdin)))'
['ADDR', 'AUTH_BASIC_PASS', 'AUTH_BASIC_USER', 'AUTH_TOKEN_SECRET', 'DB_ADDR', 'DB_MAX_IDLE_CONNS', 'DB_MAX_IDLE_TIME', 'DB_MAX_OPEN_CONNS', 'ENV', 'FROM_EMAIL', 'POSTGRES_PASSWORD', 'REDIS_ADDR', 'REDIS_DB', 'REDIS_ENABLED', 'REDIS_PW', 'SENDGRID_API_KEY']

laptop$ sed -n 85,95p cmd/api/main.go
	db, err := db.New(
		cfg.db.addr,
		…
	)
	if err != nil {
		logger.Fatal(err)
	}
```

**Fixing it** (render check before pushing)
```
laptop$ kubectl kustomize --enable-helm deploy/app | python3 -c '…print initContainer, StatefulSet, StorageClass…'
StorageClass ebs-gp3
initContainer: migrate ghcr.io/<owner>/go-feed-migrate:latest False
StatefulSet go-feed-postgres
```
(Pushed in `c9e9ce6`, then the sync from INC-006.)

**Verifying**
```
bastion$ kubectl logs -n default deploy/go-feed -c migrate
Found 2 pods, using pod/go-feed-65db88bb69-fbvtn
2026/10/01 09:15:09 migrations applied: version=13 dirty=false
bastion$ kubectl get pods,pvc,statefulset -n default
NAME                                    READY   STATUS    RESTARTS   AGE
pod/go-feed-65db88bb69-fbvtn            1/1     Running   0          3m46s
pod/go-feed-65db88bb69-ng7ck            1/1     Running   0          90s
pod/go-feed-frontend-6d569c5d8d-6w8wx   1/1     Running   0          67m
pod/go-feed-frontend-6d569c5d8d-vzcvj   1/1     Running   0          66m
pod/go-feed-postgres-0                  1/1     Running   0          3m46s
NAME                                            STATUS   VOLUME        CAPACITY   ACCESS MODES   STORAGECLASS
persistentvolumeclaim/data-go-feed-postgres-0   Bound    pvc-<id>      10Gi       RWO            ebs-gp3
NAME                                READY   AGE
statefulset.apps/go-feed-postgres   1/1     4m16s
laptop$ curl -s http://<alb-hostname>/v1/health; echo
{"data":{"env":"production","status":"ok","version":"0.0.1"}}
```

### Code / config change
Commit `c9e9ce6` ("feat: enhance CI workflow and add database migration support"):
- `deploy/app/helm/go-feed/templates/postgres-statefulset.yaml`, `postgres-service.yaml` (new)
- `deploy/app/storage/storageclass-gp3.yaml` (new)
- `templates/_helpers.tpl`: `gopher-feed.dbAddrEnv`
- `templates/api-deployment.yaml`: `initContainers: migrate`, `env: DB_ADDR`
```yaml
envFrom:
  - secretRef: { name: go-feed-secrets }     # provides POSTGRES_PASSWORD
env:
  - name: DB_ADDR
    value: "postgres://admin:$(POSTGRES_PASSWORD)@go-feed-postgres:5432/socialnetwork?sslmode=disable"
```

### Lessons learned
- `connection refused` to `localhost` in a pod = configuration written for a laptop.
- Values describing the cluster (hosts, ports, URLs) belong in the chart; only real secrets belong in Vault.
- The password is inserted into a URL, so it must be URL-safe (no `@ : / ? # %`).

### How to approach it next time
1. `CrashLoopBackOff` → `kubectl logs <deploy> --previous` (the log of the container that died).
2. Network error → check the target: is it localhost? does the Service exist (`kubectl get svc`)? is the pod behind it Ready?
3. Inspect config by key name (`-o jsonpath='{.data}'` + key list) without printing secret values.

### Prevention / follow-up
- Same pattern later caught Redis (INC-018).
- Side observations from this incident: the `InvalidImageName` pod disappeared with the old Deployments; the unused `aws-secrets-manager` store (`InvalidProviderConfig`) used `auth.jwt` (IRSA style) while the cluster uses Pod Identity, where `auth` must be omitted – it is unused and can be deleted.
- **Open:** backups for the in-cluster Postgres (CronJob `pg_dump` to S3, or RDS).

### References
- Interdependent environment variables: https://kubernetes.io/docs/tasks/inject-data-application/define-interdependent-environment-variables/
- Postgres image `PGDATA`: https://hub.docker.com/_/postgres
- StatefulSets: https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
- External Secrets `dataFrom.extract`: https://external-secrets.io/latest/guides/all-keys-one-secret/
- Debugging pods: https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/

---

## INC-008 – Trivy blocks the migrations image (5 HIGH CVEs)

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 14:00 IST, before pushing INC-007's fix) |
| **Where** | Migrations image (first version `FROM migrate/migrate:v4.20.1`); CI step "Run Trivy security scan" |
| **Severity** | Medium – would have failed every CI build |
| **Status** | Resolved (commit `c9e9ce6`) |

### Summary
My first migrations image used the official `migrate/migrate` image, whose binary was compiled with old libraries that have 5 known HIGH vulnerabilities. Trivy would fail the build. Instead of lowering the threshold, I wrote a small migration program built from my own up-to-date dependencies; it scans clean.

### Background
- **Trivy** scans an image for known vulnerabilities (CVEs) in OS packages and in compiled libraries. My CI runs it with `--severity HIGH,CRITICAL --ignore-unfixed --exit-code 1`: fail on any HIGH/CRITICAL that **has a fix available**.
- **Go binaries embed their dependencies.** A Go program's vulnerabilities come from the module versions it was built with, so an old upstream binary carries old library bugs.
- **golang-migrate** can be used as a CLI (the upstream image) or as a **Go library** inside my own program.
- **`//go:embed`** compiles files (here the `.sql` migrations) into the binary, so the image needs nothing else.

### Timeline
1. Built the migrations image from `migrate/migrate:v4.20.1` + SQL files; tested migrations locally (they worked).
2. Ran the same Trivy scan CI runs: 5 HIGH, exit code 1.
3. All 5 had fixed versions available, so `--ignore-unfixed` could not skip them.
4. Wrote `cmd/migrate/main.go` (library + embed + connection retry), switched the Dockerfile to build either program via `--build-arg CMD=…`, updated CI to a matrix.
5. Tested: retries until Postgres is up, applies 13 migrations, is idempotent; Trivy clean for both images.

### What happened (symptom)
```
usr/local/bin/migrate (gobinary)
================================
Total: 5 (HIGH: 5, CRITICAL: 0)
│ golang.org/x/crypto    │ CVE-2026-56854      │ HIGH │ fixed │ v0.53.0 │ 0.55.0              │ golang.org/x/crypto/ssh: Authentication bypass …
│ golang.org/x/text      │ CVE-2026-56852      │      │       │ v0.38.0 │ 0.39.0              │ Denial of Service via invalid UTF-8 input
│ google.golang.org/grpc │ CVE-2026-84304      │      │       │ v1.82.0 │ 1.83.1              │ gRPC-Go …
│                        │ CVE-2026-84445      │      │       │         │ 1.82.2, 1.83.2, …   │ Denial of Service via malformed RPC requests
│                        │ GHSA-hrxh-6v49-42gf │      │       │         │ 1.82.1              │ xDS RBAC and HTTP/2 Vulnerabilities
exit=1
```

### How we got there
Choosing a convenient third-party image without scanning it first.

### Why (root cause)
Upstream `migrate` binary built with `x/crypto v0.53.0`, `x/text v0.38.0`, `grpc v1.82.0` → all have published fixes → Trivy reports them as fixable HIGH → `--exit-code 1` fails the job.

### Impact
Caught before pushing, so no failed pipeline; about 30 minutes of rework.

### Resolution (step by step)
1. Do **not** lower the scan threshold.
2. Write `cmd/migrate/main.go`: `iofs.New(migrations, "migrations")` over `//go:embed migrations/*.sql`, `migrate.NewWithSourceInstance(...)` with 30 retries × 2 s, `m.Up()` treating `ErrNoChange` as success.
3. `go get github.com/golang-migrate/migrate/v4@latest && go mod tidy` – pulls patched libraries into my `go.mod`.
4. Dockerfile: `ARG CMD=api`, builds `./cmd/${CMD}`; CI matrix builds `api` and `migrate`.
5. Verify: run before Postgres starts (retries), run twice (idempotent), Trivy both images.

### Terminal commands

**Finding it**
```
laptop$ docker build -q -t go-feed-migrate:test cmd/migrate
sha256:4cb0ca7f…
laptop$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --quiet \
  --severity HIGH,CRITICAL --vuln-type os,library --ignore-unfixed --exit-code 1 go-feed-migrate:test
- '0': Clean (no security findings detected)
usr/local/bin/migrate (gobinary)
Total: 5 (HIGH: 5, CRITICAL: 0)
… (table above) …
exit=1
```
(The base image's OS layer was clean; all findings were in the `migrate` Go binary.)

**Fixing it**
```
laptop$ go get github.com/golang-migrate/migrate/v4@latest 2>&1 | tail -5 && go mod tidy
go: added github.com/golang-migrate/migrate/v4 v4.20.1
…
laptop$ grep -n "golang-migrate\|x/crypto\|x/text\|grpc" go.mod
10:	github.com/golang-migrate/migrate/v4 v4.20.1
18:	golang.org/x/crypto v0.55.0
43:	golang.org/x/text v0.41.0 // indirect
laptop$ go build -o /dev/null ./cmd/migrate && go vet ./cmd/migrate && echo BUILD_OK
BUILD_OK
```

**Verifying** (local Postgres in Docker; migrations container started 3 s before Postgres)
```
laptop$ docker build -q --build-arg CMD=migrate -t go-feed-migrate:test . && docker build -q -t go-feed-api:test .
laptop$ docker network create gf-mig-test
laptop$ docker run -d --name gf-mig-run --network gf-mig-test -e DB_ADDR="$DB" go-feed-migrate:test
laptop$ sleep 3; docker run -d --rm --name gf-pg-test --network gf-mig-test -e POSTGRES_DB=socialnetwork -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=testpw postgres:16.15-alpine
== first run (started before Postgres), exit=0
2026/10/01 08:31:40 database not ready (attempt 2/30)
2026/10/01 08:31:43 database not ready (attempt 3/30)
2026/10/01 08:31:45 database not ready (attempt 4/30)
2026/10/01 08:31:47 migrations applied: version=13 dirty=false
== second run
2026/10/01 08:31:48 migrations applied: version=13 dirty=false
exit=0
laptop$ docker exec gf-pg-test psql -U admin -d socialnetwork -tAc "select version, dirty from schema_migrations; select count(*) from pg_tables where schemaname='public';"
13|f
7
== trivy go-feed-migrate:test
- '0': Clean (no security findings detected)
trivy exit=0
== trivy go-feed-api:test
- '0': Clean (no security findings detected)
trivy exit=0
```

### Code / config change
Commit `c9e9ce6`:
- `cmd/migrate/main.go` (new): embedded SQL, connection retries, `migrate.Up()`.
- `Dockerfile`: `ARG CMD=api`, `go build … ./cmd/${CMD}`, binary at `/app`.
- `.github/workflows/ci.yaml`: matrix `go-feed` (`CMD=api`) / `go-feed-migrate` (`CMD=migrate`), per-image GHA cache scope, `cmd/migrate/**` path trigger.
- `go.mod` / `go.sum`: golang-migrate and patched indirect dependencies.

### Lessons learned
- Scan third-party images with the same flags as CI before adopting them.
- Building the tool from your own dependencies gives you control over its CVEs.

### How to approach it next time
1. Trivy fails → look at the `Library` and `Fixed Version` columns.
2. `fixed` available → upgrade (your code) or rebuild (third-party binary); `affected` with no fix → evaluate, and use `.trivyignore` with a comment only if justified.

### Prevention / follow-up
- Dependabot for Go modules and base images would raise these automatically. `# suggested, not run`

### References
- Trivy: https://trivy.dev/latest/docs/
- golang-migrate (library usage, iofs source): https://github.com/golang-migrate/migrate
- Go `embed`: https://pkg.go.dev/embed
- trivy-action: https://github.com/aquasecurity/trivy-action

---

## INC-009 – ALB health checks return 404

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 14:47 – 15:05 IST) |
| **Where** | ALB target groups for the API and Argo CD; `deploy/app/gateway/target-group-configs.yaml`, `deploy/app/argocd/argo-tg-config.yaml` |
| **Severity** | Medium – targets marked unhealthy; traffic only flowed because the ALB "fails open" |
| **Status** | Resolved (commits `5164fba`, `758b8dd`) |

### Summary
The ALB checked the health of every pod at `/`. The API only serves `/v1/*` and Argo CD runs under `/argocd`, so both answered 404 and were marked unhealthy. Setting a correct health check path per service fixed it.

### Background
- Every ALB **target group** sends each target (pod IP) a request every 15 s. If the response code does not match (default `200-399`), the target is **unhealthy**.
- **Fail open:** if *all* targets in a group are unhealthy, the ALB sends traffic to all of them anyway. Things appear to work, but there is no protection when one pod really fails.
- With the Load Balancer Controller, health checks are configured per Service in a **`TargetGroupConfiguration`** (`spec.defaultConfiguration.healthCheckConfig`).
- Apps served under a **sub-path** (Argo CD at `/argocd`) move their health endpoint too (`/argocd/healthz`).

### Timeline
1. While checking the API after INC-007, its log was full of `GET /` → 404 from three IPs in my public subnets: the ALB's health checks.
2. The controller's model (INC-004 output) showed `"healthCheckConfig":{"path":"/"}` for every target group.
3. AWS target health: Argo CD unhealthy at `/`; API group partly draining.
4. Tested `/argocd/healthz` through the ALB: 200.
5. Looked up the exact CRD field names for controller v3.5.0.
6. Committed health check paths for the API (`/v1/health`) and Argo CD (`/argocd/healthz`); verified after Argo CD synced.

### What happened (symptom)
```
2026/10/01 09:17:23 [go-feed-…/…-000071] "GET http://<pod-ip>:8080/ HTTP/1.1" from <public-subnet-ip-a> - 404 19B in 47.832µs
2026/10/01 09:17:23 [go-feed-…/…-000072] "GET http://<pod-ip>:8080/ HTTP/1.1" from <public-subnet-ip-b> - 404 19B in 46.408µs
```
AWS console / CLI: Argo CD target group `unhealthy`.

### How we got there
TargetGroupConfigurations only set `targetType: ip`; no health check path, so the AWS default `/` applied.

### Why (root cause)
Default health check path `/` → API has no route at `/` (Go returns 404) and Argo CD serves under `/argocd` → 404 is outside `200-399` → unhealthy. Confirmed in the AWS target group health-check docs and in the controller's rendered model.

### Impact
- No user-visible outage (fail open), but no real health protection.
- Noise in API logs (3 requests every 15 s per pod).

### Resolution (step by step)
1. Find a path that returns 200 for each service and **test it through the ALB** with `curl`.
2. Confirm field names against the CRD for the installed controller version.
3. Add `healthCheckConfig` to each `TargetGroupConfiguration`, render locally, commit, push.
4. Verify target health in AWS.

### Terminal commands

**Finding it**
```
bastion$ kubectl logs -n default deploy/go-feed --tail=5
Found 2 pods, using pod/go-feed-65db88bb69-fbvtn
Defaulted container "go-feed" out of: go-feed, migrate (init)
2026/10/01 09:17:23 […-000071] "GET http://<pod-ip>:8080/ HTTP/1.1" from <public-subnet-ip-a> - 404 19B in 47.832µs
2026/10/01 09:17:23 […-000072] "GET http://<pod-ip>:8080/ HTTP/1.1" from <public-subnet-ip-b> - 404 19B in 46.408µs
2026/10/01 09:17:23 […-000075] "GET http://<pod-ip>:8080/ HTTP/1.1" from <public-subnet-ip-c> - 404 19B in 57.182µs

laptop$ for tg in $(aws elbv2 describe-target-groups --load-balancer-arn "$LB" --query 'TargetGroups[].TargetGroupArn' --output text); do
  echo "$(basename $(dirname $tg)): $(aws elbv2 describe-target-health --target-group-arn $tg --query 'TargetHealthDescriptions[].TargetHealth.State' --output text) | hc=$(aws elbv2 describe-target-groups --target-group-arns $tg --query 'TargetGroups[0].HealthCheckPath' --output text)"
done
k8s-argocd-argocdar-a4943941fa: unhealthy | hc=/
k8s-default-gofeed-48fb56a942: unhealthy	draining	draining	unhealthy | hc=/
k8s-default-httpappr-07dfa13343: healthy	healthy | hc=/
k8s-default-httpappr-c59118a121: healthy	draining	draining	healthy | hc=/v1/health

laptop$ for p in /argocd/healthz /argocd/healthz?full=true; do curl -s -m 10 -w "  <- $p %{http_code}\n" "http://<alb-hostname>$p"; done
ok
  <- /argocd/healthz 200
ok
  <- /argocd/healthz?full=true 200

laptop$ curl -sf https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.5.0/config/crd/gateway/gateway-crds.yaml -o gw-crds.yaml
laptop$ python3 - <<'EOF'   # print TargetGroupConfiguration .spec.defaultConfiguration.healthCheckConfig properties
…
EOF
v1 True {'healthCheckInterval': ('integer', None), 'healthCheckPath': ('string', None), 'healthCheckPort': ('string', None), 'healthCheckProtocol': ('string', ['HTTP', 'HTTPS', 'TCP']), 'healthCheckTimeout': ('integer', None), 'healthyThresholdCount': ('integer', None), 'matcher': ('object', ['grpcCode', 'httpCode']), 'unhealthyThresholdCount': ('integer', None)}
```
(The `/v1/health` value on `httpappr-c59118a121` was from my API fix being applied as I looked; the `k8s-default-gofeed-…` group belonged to a stale route, see INC-010.)

**Fixing it**
```
laptop$ kubectl kustomize --enable-helm deploy/app | grep -B2 -A6 "healthCheckConfig"
spec:
  defaultConfiguration:
    healthCheckConfig:
      healthCheckPath: /v1/health
      healthCheckProtocol: HTTP
      matcher:
        httpCode: "200"
    targetType: ip
laptop$ git commit … && git push         # 5164fba (API), 758b8dd (Argo CD)
```

**Verifying** (polled until Argo CD synced, then listed health)
```
laptop$ git log --oneline -1 origin/main
758b8dd feat: add health check configuration for Argo CD target group
argocd TG health check path: /argocd/healthz
k8s-argocd-argocdar-a4943941fa: healthy
k8s-default-gofeed-48fb56a942: unhealthy	unhealthy
k8s-default-httpappr-07dfa13343: healthy	healthy
k8s-default-httpappr-c59118a121: healthy	healthy
```

### Code / config change
```yaml
# deploy/app/gateway/target-group-configs.yaml (backend-tg-config)
  defaultConfiguration:
    targetType: ip
    healthCheckConfig:
      healthCheckPath: /v1/health
      healthCheckProtocol: HTTP
      matcher:
        httpCode: "200"
# deploy/app/argocd/argo-tg-config.yaml: same, with healthCheckPath: /argocd/healthz
```
Commits `5164fba`, `758b8dd`. Later the same pattern for Grafana (`/grafana/api/health`) and Kibana (`/kibana/login`).

### Lessons learned
- Every service behind an ALB needs a health path that returns 200.
- Unexpected periodic requests in your logs are often a load balancer's health checks.

### How to approach it next time
1. `aws elbv2 describe-target-health` for each target group; read `State` and `Reason`.
2. `curl` the candidate health path through the ALB.
3. Set it in the `TargetGroupConfiguration`, never by hand in the console (the controller would overwrite it).

### Prevention / follow-up
Any new service exposed on the ALB gets a `TargetGroupConfiguration` with `healthCheckConfig` in the same commit.

### References
- ALB target group health checks: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
- LBC Gateway customization (TargetGroupConfiguration): https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/gateway/customization/

---

## INC-010 – Site root returns the API's 404 (stale ALB rule)

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 14:50 – 15:25 IST) |
| **Where** | ALB listener rules; Load Balancer Controller IAM policy `terraform/modules/eks/files/lbc_iam_policy.json` |
| **Severity** | High – the website (`/`) was unusable |
| **Status** | Resolved (commit `85dcd17` + targeted `terraform apply`) |

### Summary
Requests to `/` reached the API instead of the frontend because the ALB kept an old rule from a deleted HTTPRoute. The controller knew the right configuration but was not allowed to apply it: its IAM policy, older than controller v3.5.0, lacked `elasticloadbalancing:SetRulePriorities`. Updating the policy to the official v3.5.0 version fixed it.

### Background
- **ALB listener rules** are evaluated in **priority order** (lowest number first); the first match wins. Two rules can match `/*`; only the higher-priority one is ever used.
- The Load Balancer Controller turns each `HTTPRoute` rule into an ALB listener rule. To **remove** a rule in the middle, it first **renumbers** the remaining rules with the AWS API call `SetRulePriorities`.
- The controller calls AWS with an **IAM role** (through EKS Pod Identity). Each controller release publishes the **exact IAM policy** it needs (`docs/install/iam_policy.json` at the release tag). New versions may need new permissions.
- **Who answered?** Go's `net/http` returns a plain-text `404 page not found` (19 bytes); my nginx frontend returns HTML with an `X-Frame-Options` header.

### Timeline
1. After INC-004/009 the API (`/v1/health`) and Argo CD worked, but `/` returned 404.
2. The response body/headers showed the 404 came from the Go API.
3. The controller's model (INC-004) had a rule `80:3 /*` → API, from an `HTTPRoute default/go-feed` (my old `k8s/gateway/httproute.yaml`), ahead of the frontend's `80:4 /*`.
4. `kubectl delete httproute go-feed` → `NotFound`: the route was already gone.
5. AWS still had rule 3. I restarted the controller to force a full rebuild; polled AWS for 4 minutes: rule 3 still there.
6. Read the controller's own errors: `AccessDenied … elasticloadbalancing:SetRulePriorities`. The model listed only the correct routes.
7. Diffed my policy with the official v3.5.0 policy: 2 actions missing (`SetRulePriorities`, `ModifyIpPools`).
8. Replaced the policy file, targeted `terraform plan` (1 change), applied, confirmed policy version `v2` contains the action.
9. Rule still there after 3 minutes (retry backoff) → restarted the controller → `successfully deployed model` → 3 correct rules, `/` served the React app.

### What happened (symptom)
```
/ -> 404
/argocd -> 301
/v1/posts/1 -> 401

HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8
Content-Length: 19
X-Content-Type-Options: nosniff

404 page not found
```

### How we got there
The old `HTTPRoute default/go-feed` (all paths → API) had existed in the cluster. It was deleted (with the repo cleanup) while the controller was down (INC-004). When the controller came back, removing its rule required re-prioritising the others, which needed a permission my policy did not have.

### Why (root cause)
IAM policy written for an older controller version → no `elasticloadbalancing:SetRulePriorities` → controller's update fails with `AccessDenied` on every reconcile → stale rule 3 (`/*` → API) stays ahead of the frontend's rule 4 → `/` hits the API → Go 404. Confirmed by diffing against `docs/install/iam_policy.json` at tag `v3.5.0` and by the controller's error log.

### Impact
- Website unusable for ~35 minutes. API and Argo CD unaffected.
- No data affected.

### Resolution (step by step)
1. Identify the responder (body, size, headers) → Go API, not nginx.
2. List AWS rules (`aws elbv2 describe-rules`) → find the stale rule and its target group.
3. Rule out the route (already deleted) and a stale controller cache (restart did not help).
4. Read controller errors: `kubectl logs … | grep -o '"error":"[^"]*"' | sort | uniq -c`.
5. Download the official policy for the running version and diff Allow actions.
6. Replace `lbc_iam_policy.json`, then apply only that resource:
   `terraform plan -target=module.platform.module.eks.aws_iam_policy.lbc` → expect `0 to add, 1 to change, 0 to destroy`; then `terraform apply -target=…`.
7. Confirm the new policy version contains the action (`aws iam get-policy-version …`).
8. `kubectl rollout restart` the controller to skip its retry backoff.
9. Verify: controller log `successfully deployed model`; AWS shows 3 rules; `/` → 200 HTML with `<title>GoFeed</title>`; all target groups healthy.

### Terminal commands

**Finding it**
```
laptop$ ALB=<alb-hostname>; for p in / /argocd /v1/posts/1; do curl -s -m 10 -o /dev/null -w "$p -> %{http_code} %{redirect_url}\n" http://$ALB$p; done
/ -> 404
/argocd -> 301 http://<alb-hostname>/argocd/
/v1/posts/1 -> 401
laptop$ curl -s -m 10 -i http://$ALB/ | head -12
HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8
Content-Length: 19
Connection: keep-alive
X-Content-Type-Options: nosniff

404 page not found
laptop$ curl -s -m 10 -o /dev/null -w "/login -> %{http_code}\n" http://$ALB/login
/login -> 404

bastion$ kubectl get httproute -A
NAMESPACE   NAME                    HOSTNAMES   AGE
argocd      argo-cd-argocd-server               47h
default     http-app-route                      3h37m
bastion$ kubectl delete httproute go-feed -n default
Error from server (NotFound): httproutes.gateway.networking.k8s.io "go-feed" not found

laptop$ LB=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='$ALB'].LoadBalancerArn" --output text)
laptop$ L=$(aws elbv2 describe-listeners --load-balancer-arn "$LB" --query 'Listeners[0].ListenerArn' --output text)
laptop$ aws elbv2 describe-rules --listener-arn "$L" --query 'Rules[].[Priority, join(`,`, Conditions[0].PathPatternConfig.Values || `[]`), Actions[0].ForwardConfig.TargetGroups[0].TargetGroupArn]' --output text
1	/argocd,/argocd/*	k8s-argocd-argocdar-a4943941fa/<tg-id>
2	/v1,/v1/*	k8s-default-httpappr-c59118a121/<tg-id>
3	/*	k8s-default-gofeed-48fb56a942/<tg-id>        <- stale: points at the API
4	/*	k8s-default-httpappr-07dfa13343/<tg-id>      <- frontend, never reached
default		None

bastion$ kubectl rollout restart deploy/aws-load-balancer-controller -n kube-system
bastion$ kubectl rollout status deploy/aws-load-balancer-controller -n kube-system --timeout=120s
deployment "aws-load-balancer-controller" successfully rolled out

laptop$ for i in $(seq 1 16); do n=$(aws elbv2 describe-rules --listener-arn "$L" --query 'length(Rules[?contains(to_string(Actions), `k8s-default-gofeed-48fb56a942`)])' --output text); [ "$n" = "0" ] && break; sleep 15; done; echo "final count=$n"
final count=1
/ -> 404 text/plain; charset=utf-8

bastion$ LBC='-n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --since=15m --tail=-1'
bastion$ kubectl logs $LBC | grep -o '"error":"[^"]*"' | sort | uniq -c
      2 "error":"operation error Elastic Load Balancing v2: SetRulePriorities, https response error StatusCode: 403, RequestID: <request-id>, api error AccessDenied: User: arn:aws:sts::<account-id>:assumed-role/go-feed-dev-eks-aws-load-balancer-controller/eks-go-feed-de-aws-load-b-<session> is not authorized to perform: elasticloadbalancing:SetRulePriorities on resource: arn:aws:elasticloadbalancing:us-east-1:<account-id>:listener-rule/app/k8s-default-gofeedga-c4ee543c1c/<id> because no identity-based policy allows the elasticloadbalancing:SetRulePriorities action"
      … (the same error ~20 times)
bastion$ kubectl logs $LBC | grep '"successfully built model"' | tail -1 | grep -oE 'go-feed-gateway:[a-z0-9-]+:[A-Za-z]+-[a-z0-9-]+' | sort -u
go-feed-gateway:argocd-argo-cd-argocd-server:HTTPRoute-argocd-argo-cd-argocd-server
go-feed-gateway:default-http-app-route:HTTPRoute-default-go-feed
go-feed-gateway:default-http-app-route:HTTPRoute-default-go-feed-frontend
bastion$ kubectl get grpcroute,tlsroute,tcproute,udproute -A 2>&1 | head
error: the server doesn't have a resource type "tlsroute"
bastion$ kubectl get deploy -A | grep -i load-balancer
kube-system        aws-load-balancer-controller               2/2     2            2           168m
bastion$ helm list -A | grep -i load-balancer
aws-load-balancer-controller	kube-system     	9       	2026-10-01 08:00:17 +0000 UTC	deployed	aws-load-balancer-controller-3.5.0	v3.5.0

laptop$ curl -sf https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.5.0/docs/install/iam_policy.json -o iam_policy_v3.5.0.json && echo downloaded
downloaded
laptop$ python3 - <<'EOF'   # set difference of (Effect, Action) pairs
…
EOF
missing in ours: [('Allow', 'elasticloadbalancing:ModifyIpPools'), ('Allow', 'elasticloadbalancing:SetRulePriorities')]
only in ours: []
statements ours/official: 16 16
```
The model was correct (no `default-go-feed` route) and only one controller existed. The cause was the permission.

**Fixing it**
```
laptop$ cp iam_policy_v3.5.0.json terraform/modules/eks/files/lbc_iam_policy.json
laptop$ git diff -U1 terraform/modules/eks/files/lbc_iam_policy.json | grep "^[+-] "
-                "elasticloadbalancing:ModifyCapacityReservation"
+                "elasticloadbalancing:ModifyCapacityReservation",
+                "elasticloadbalancing:ModifyIpPools"
-                "elasticloadbalancing:ModifyRule"
+                "elasticloadbalancing:ModifyRule",
+                "elasticloadbalancing:SetRulePriorities"

laptop$ cd terraform/environments/dev
laptop$ terraform plan -input=false -target=module.platform.module.eks.aws_iam_policy.lbc
  # module.platform.module.eks.aws_iam_policy.lbc will be updated in-place
  …
Plan: 0 to add, 1 to change, 0 to destroy.
Warning: Resource targeting is in effect
laptop$ terraform apply -target=module.platform.module.eks.aws_iam_policy.lbc
(output not captured)
expected output: Apply complete! Resources: 0 added, 1 changed, 0 destroyed.

laptop$ aws iam list-policies --scope Local --query "Policies[?PolicyName=='go-feed-dev-eks-aws-load-balancer-controller'].[Arn,DefaultVersionId]" --output text
arn:aws:iam::<account-id>:policy/go-feed-dev-eks-aws-load-balancer-controller	v2
laptop$ aws iam get-policy-version --policy-arn <policy-arn> --version-id v2 --query 'PolicyVersion.Document' --output json | grep -c "SetRulePriorities"
1

laptop$ (poll rules for 3 minutes)
1	/argocd,/argocd/*	…
2	/v1,/v1/*	…
3	/*	k8s-default-gofeed-48fb56a942/<tg-id>        <- still there (controller retry backoff)
4	/*	k8s-default-httpappr-07dfa13343/<tg-id>

bastion$ kubectl rollout restart deploy/aws-load-balancer-controller -n kube-system
deployment.apps/aws-load-balancer-controller restarted
bastion$ kubectl rollout status deploy/aws-load-balancer-controller -n kube-system --timeout=120s
deployment "aws-load-balancer-controller" successfully rolled out
bastion$ sleep 60; kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --since=3m --tail=-1 | grep -iE '"level":"error"|successfully deployed model' | cut -c1-300 | tail -5
{"level":"info","ts":"2026-10-01T09:54:50Z","logger":"controllers.gateway.k8s.aws/alb","msg":"successfully deployed model","gateway":{"name":"go-feed-gateway","namespace":"default"}}
```

**Verifying**
```
laptop$ aws elbv2 describe-rules --listener-arn "$L" … --output text
1	/argocd,/argocd/*	k8s-argocd-argocdar-a4943941fa/<tg-id>
2	/v1,/v1/*	k8s-default-httpappr-c59118a121/<tg-id>
3	/*	k8s-default-httpappr-07dfa13343/<tg-id>
default		None
laptop$ for p in / /login /v1/health /v1/posts/1 /argocd/; do curl -s -m 10 -o /dev/null -w "$p -> %{http_code} %{content_type}\n" http://$ALB$p; done
/ -> 200 text/html
/login -> 200 text/html
/v1/health -> 200 application/json
/v1/posts/1 -> 401 application/json
/argocd/ -> 200 text/html; charset=utf-8
laptop$ curl -s -m 10 http://$ALB/ | grep -o "<title>[^<]*</title>"
<title>GoFeed</title>
== target groups
k8s-argocd-argocdar-a4943941fa: healthy
k8s-default-httpappr-07dfa13343: healthy	healthy
k8s-default-httpappr-c59118a121: healthy	healthy
```

### Code / config change
Commit `85dcd17` ("feat: add ModifyIpPools and SetRulePriorities actions to IAM policy"): `terraform/modules/eks/files/lbc_iam_policy.json` replaced with the official v3.5.0 policy (two actions added). Applied with a targeted `terraform apply`.

### Lessons learned
- A controller's IAM policy is part of its version. Upgrade them together.
- Restarting a controller only helps when the cause is temporary; its logs say why it cannot converge.
- The body and headers of an error identify which program produced it.

### How to approach it next time
1. Wrong backend answering → identify the responder (body/headers).
2. `aws elbv2 describe-rules` → is there a rule you don't expect? Which target group?
3. Check the Kubernetes source (`kubectl get httproute -A`); if gone, the controller failed to clean up.
4. Controller logs → errors → `AccessDenied` = IAM policy; diff it against the official one for that release.
5. `terraform plan -target=<resource>` to change only the policy.

### Prevention / follow-up
- When upgrading the controller, update `lbc_iam_policy.json` from the same release tag in the same change.
- Optional: a CI check that compares the policy file with the official one for the pinned controller version. `# suggested, not run`

### References
- LBC IAM policy for v3.5.0: https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/v3.5.0/docs/install/iam_policy.json
- ALB listener rules and priorities: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-rules.html
- `SetRulePriorities` API: https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_SetRulePriorities.html
- Terraform resource targeting: https://developer.hashicorp.com/terraform/cli/commands/plan#resource-targeting

---

## INC-011 – Domain not delegated, ACM certificate stuck pending

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 15:30 IST) |
| **Where** | DNS (eu.org registry, Route 53 hosted zone) and AWS Certificate Manager |
| **Severity** | Low – blocks HTTPS only; site works on HTTP |
| **Status** | Workaround (stay on HTTP); zone deleted at teardown |

### Summary
I wanted HTTPS on a free `eu.org` domain. The domain did not resolve and the ACM certificate stayed `PENDING_VALIDATION`, because eu.org had never delegated the name to my Route 53 nameservers: the registration was not active on my account. I decided to run on HTTP for now.

### Background
- **DNS delegation:** a parent zone (`eu.org`) must contain NS records pointing a child name (`<my-domain>.eu.org`) to the child's nameservers (my Route 53 hosted zone). Without that, the internet never asks Route 53.
- **ACM DNS validation:** ACM gives you a CNAME record to create. It issues the certificate only after it can resolve that CNAME publicly. Unvalidated requests time out after **72 hours**.
- **eu.org** is a free registry with manual approval; requests can take weeks.
- `dig +norecurse NS name @<parent-nameserver>` asks the parent directly whether it delegates the name.

### Timeline
1. Gateway HTTPS listener and an ACM certificate ARN were prepared (commented out) for `<my-domain>.eu.org`.
2. Checked public DNS: no NS, no A, no SOA for the name.
3. Asked eu.org's own nameserver: it answered with eu.org's SOA in the authority section (= "no such delegation").
4. AWS side was fine: hosted zone existed, ACM validation CNAME present, two certificates (requested twice) `PENDING_VALIDATION`.
5. My eu.org account page showed an empty domain list.
6. Decided to run on HTTP and revisit with a domain bought in Route 53.

### What happened (symptom)
- `dig` returns nothing for the domain.
- ACM: `PENDING_VALIDATION` for both certificates.

### How we got there
The eu.org request was either still pending, rejected, or never fully submitted; the account had no domains.

### Why (root cause)
No registration → no NS delegation at `eu.org` → resolvers never reach Route 53 → ACM cannot find its validation CNAME → certificate stays pending.

### Impact
- No HTTPS: logins and admin passwords travel unencrypted over HTTP.
- The public URL is the ALB's generated hostname, which changes if the ALB is recreated (this is why INC-012's fix uses that hostname).
- Cost: Route 53 zone $0.50/month until deleted.

### Resolution (step by step)
1. Check delegation top-down with `dig` (public resolver, then the parent's nameserver directly).
2. Check the AWS side (hosted zone nameservers, validation record, ACM status).
3. Check the registrar account.
4. Decision: HTTP for now; at teardown, delete the hosted zone (INC-021).

### Terminal commands

**Finding it**
```
laptop$ D=<my-domain>.eu.org
laptop$ dig +short NS $D @1.1.1.1; dig +short $D @1.1.1.1; dig +short CNAME $D @1.1.1.1; dig +short SOA $D @1.1.1.1
(empty: no records)
laptop$ dig +norecurse NS $D @$(dig +short NS eu.org @1.1.1.1 | head -1) | grep -A5 "AUTHORITY SECTION"
;; AUTHORITY SECTION:
eu.org.			7200	IN	SOA	ns.eu.org. hostmaster.eu.org. 2026100107 3600 900 1814400 7200
laptop$ aws route53 list-hosted-zones --query 'HostedZones[].[Name,Id,Config.PrivateZone]' --output text
<my-domain>.eu.org.	/hostedzone/<zone-id>	False
laptop$ aws acm list-certificates --certificate-statuses PENDING_VALIDATION ISSUED FAILED EXPIRED INACTIVE VALIDATION_TIMED_OUT --query 'CertificateSummaryList[].[DomainName,Status,CertificateArn]' --output text
<my-domain>.eu.org	PENDING_VALIDATION	arn:aws:acm:us-east-1:<account-id>:certificate/<cert-id-1>
<my-domain>.eu.org	PENDING_VALIDATION	arn:aws:acm:us-east-1:<account-id>:certificate/<cert-id-2>

laptop$ aws route53 get-hosted-zone --id <zone-id> --query 'DelegationSet.NameServers' --output text
ns-xxxx.awsdns-xx.co.uk	ns-xx.awsdns-xx.com	ns-xxx.awsdns-xx.net	ns-xxxx.awsdns-xx.org
laptop$ aws route53 list-resource-record-sets --hosted-zone-id <zone-id> --query 'ResourceRecordSets[].[Type,Name]' --output text
NS	<my-domain>.eu.org.
SOA	<my-domain>.eu.org.
CNAME	_<acm-token>.<my-domain>.eu.org.
laptop$ aws acm describe-certificate --certificate-arn <cert-arn-1> --query 'Certificate.[CreatedAt,DomainValidationOptions[].ValidationStatus]' --output text
2026-09-30T19:43:27+05:30
PENDING_VALIDATION
```
eu.org account page (browser): "Domains RK2091-FREE … Domain | Created | Updated | DNSSEC | Flags" with no rows.

**Fixing it**
None for the domain (decision: HTTP). At teardown:
```
laptop$ aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch file://r53.json   # deletes the ACM CNAME
PENDING
laptop$ aws route53 delete-hosted-zone --id <zone-id>
PENDING
zone deleted
```
How to check once a domain is delegated (`# suggested, not run`):
```
laptop$ dig +short NS <my-domain>.eu.org          # should list the 4 Route 53 nameservers
laptop$ aws acm describe-certificate --certificate-arn <arn> --query 'Certificate.Status'   # ISSUED within ~30 min
```

### Code / config change
None. The HTTPS listener and certificate stay commented out in `deploy/app/gateway/gateway.yaml` and `lbconfig.yaml`.

### Lessons learned
- Debug DNS top-down: ask the parent whether it delegates the name.
- A free registry with manual approval is not a good dependency for a time-boxed project.

### How to approach it next time
1. `dig +short NS name` empty → check the parent's nameserver with `+norecurse`.
2. Parent returns its own SOA → not delegated → fix at the registrar.
3. Delegated but ACM still pending → check the validation CNAME exists in the zone.

### Prevention / follow-up
- Use a cheap Route 53-registered domain (hosted zone created automatically), then ExternalDNS + the HTTPS listener. Open.

### References
- ACM DNS validation: https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html
- Route 53 name servers / delegation: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-name-servers-glue-records.html
- eu.org: https://nic.eu.org/

---

## INC-012 – Confirmation email links point to `localhost:4000`

| | |
|---|---|
| **Date** | 2026-10-01 (found ≈ 15:30 IST; confirmed fixed ≈ 23:50 IST) |
| **Where** | API config `FRONTEND_URL` (`cmd/api/main.go`, `cmd/api/auth.go`); Helm values `deploy/app/values-dev.yaml` |
| **Severity** | High – no new user could activate their account |
| **Status** | Resolved (commit `b931f75`); security follow-up open |

### Summary
The activation link in registration emails was `http://localhost:4000/confirm/<token>`, because `FRONTEND_URL` was never set in the cluster and the code defaults to localhost. I set `FRONTEND_URL` (and `EXTERNAL_URL`) per environment in the Helm values. Testing the full flow also revealed that the register API leaks the activation token.

### Background
- **Registration flow:** `POST /v1/authentication/user` creates an inactive user and an invitation (a random UUID, stored as a SHA-256 hash). SendGrid emails the plain UUID inside a link `FRONTEND_URL + /confirm/<token>`. The React page at `/confirm/:token` calls `PUT /v1/users/activate/<token>`, which activates the user and deletes the invitation. A token works **once** and expires after **3 days**.
- **`localhost` in an email** means "the computer of whoever clicks it", so it never works for a real user.
- **Config vs secrets:** URLs are not secret; they belong in Git (Helm values), not Vault.
- The API's Swagger document publishes `EXTERNAL_URL` as its `host`, which gives an outside view of the running config.

### Timeline
1. Registered on the live site; the email link pointed at `localhost:4000`.
2. Found how the link is built and that `FRONTEND_URL` defaults to `http://localhost:4000`; it was not among the Secret's keys (INC-007 output).
3. Added an `api.env` map to the chart, then moved the environment-specific URLs into `deploy/app/values-dev.yaml` (`b931f75`).
4. Later the user reported "the link is not working": I tested the whole flow end to end through the ALB with a throwaway user – it worked.
5. The link the user was clicking was `http://localhost:4000/confirm/…`: an email sent **before** the fix.
6. Proved the running pods had the new values via the Swagger `host`. Opening the same token on the ALB hostname activated the account.

### What happened (symptom)
```
http://localhost:4000/confirm/<activation-token>
```
Browser: "This site can't be reached" (nothing listens on the clicker's localhost:4000).

### How we got there
The code has a developer default; nothing in the cluster overrode it.

### Why (root cause)
`FRONTEND_URL` unset → `env.GetString("FRONTEND_URL", "http://localhost:4000")` returns the default → `activationURL := fmt.Sprintf("%s/confirm/%s", frontendURL, token)` → the email contains a localhost link. Confirmed in `cmd/api/main.go:41` and `cmd/api/auth.go:98`.

### Impact
- New users could not activate accounts through the email link.
- No data loss; tokens remained valid for 3 days and could be used on the right host.

### Resolution (step by step)
1. Find where the link is built (`grep -rn "frontendURL\|activationURL"`).
2. Add a generic `api.env` map to the chart (`templates/api-deployment.yaml`: each key becomes an env var on the API; explicit `env` overrides `envFrom`).
3. Keep chart defaults generic (`env: {}`) and set environment values in `deploy/app/values-dev.yaml`, loaded through `additionalValuesFiles` in `deploy/app/kustomization.yaml`.
4. Render locally and push; Argo CD restarts the API pods.
5. Verify from outside with the Swagger `host`; test the full activation flow with a throwaway user.

### Terminal commands

**Finding it**
```
laptop$ grep -rn "frontendURL\|activationURL\|confirm" cmd/api/*.go | grep -v _test | head
cmd/api/api.go:42:	frontendURL string
cmd/api/auth.go:98:	activationURL := fmt.Sprintf("%s/confirm/%s", app.config.frontendURL, plainToken)
cmd/api/auth.go:106:		ActivationURL: activationURL,
cmd/api/main.go:41:		frontendURL: env.GetString("FRONTEND_URL", "http://localhost:4000"),
laptop$ grep -n "path=\|confirm" frontend/src/App.jsx | head -3
41:            <Route path="/confirm/:token" element={<ConfirmAccount />} />
```

**Fixing it**
```
laptop$ kubectl kustomize --enable-helm deploy/app | python3 -c '…print the API env list…'
[('DB_ADDR', 'postgres://admin:$(POSTGRES_PASSWORD)@go-feed'), ('EXTERNAL_URL', '<alb-hostname>'), ('FRONTEND_URL', 'http://<alb-hostname>')]
laptop$ git add deploy/app/values-dev.yaml deploy/app/kustomization.yaml deploy/app/helm/go-feed/values.yaml deploy/app/helm/go-feed/templates/api-deployment.yaml
laptop$ git commit -m "feat: per-environment API settings (FRONTEND_URL, EXTERNAL_URL) in values-dev.yaml"
laptop$ git push
```

**Verifying – end-to-end activation through the ALB** (throwaway user on the reserved `example.com` domain, so no real email is delivered)
```
laptop$ curl -s -X POST http://<alb-hostname>/v1/authentication/user -H 'Content-Type: application/json' \
  -d '{"username":"e2e…","email":"gofeed-e2e…@example.com","password":"Test-pass-123"}' -w "\n[%{http_code}]\n"
{"data":{"id":3,"username":"e2e1790878841","email":"gofeed-e2e1790878841@example.com","created_at":"2026-10-01T18:20:42Z","is_active":false,"role_id":0,"role":{"id":0,"name":"user",…},"token":"<activation-token>"}}
[201]
laptop$ curl -s -o /dev/null -w "[%{http_code}] %{content_type}\n" http://<alb-hostname>/confirm/<activation-token>
[200] text/html
laptop$ curl -s -X PUT -D - http://<alb-hostname>/v1/users/activate/<activation-token> | head -5
HTTP/1.1 204 No Content
Content-Type: application/json
laptop$ curl -s -X PUT -w " [%{http_code}]\n" http://<alb-hostname>/v1/users/activate/<activation-token>
{"error":"not found"} [404]                      <- a token works only once
laptop$ curl -s -X POST http://<alb-hostname>/v1/authentication/token -H 'Content-Type: application/json' -d '{"email":"…","password":"Test-pass-123"}' -w " [%{http_code}]\n"
{"data":"<jwt>"} [201]
```

**Verifying – the running pods have the new URL**
```
laptop$ curl -s -m 10 http://<alb-hostname>/v1/swagger/doc.json | python3 -c 'import sys,json; d=json.load(sys.stdin); print("swagger host =", d.get("host"))'
swagger host = <alb-hostname>
laptop$ git show origin/main:deploy/app/values-dev.yaml | grep -E "URL"
    FRONTEND_URL: http://<alb-hostname>
    EXTERNAL_URL: <alb-hostname>
laptop$ git log origin/main --format="%h %ad %s" --date=format:%H:%M -- deploy/app/values-dev.yaml | head -1
b931f75 15:40 feat: add environment-specific settings and dev overrides for go-feed chart
```
Then in the browser: `http://<alb-hostname>/confirm/<my-old-token>` → "You're activated!".

### Code / config change
Commit `b931f75`:
```yaml
# deploy/app/helm/go-feed/values.yaml
api:
  env: {}            # set per environment

# deploy/app/values-dev.yaml
api:
  env:
    FRONTEND_URL: http://<alb-hostname>
    EXTERNAL_URL: <alb-hostname>

# deploy/app/kustomization.yaml
    additionalValuesFiles:
      - values-dev.yaml
```

### Lessons learned
- Defaults like `localhost` are fine in development but must fail loudly in production.
- When you cannot inspect a pod, find a public output that reflects the same config.
- Emails sent before a fix keep the old link.

### How to approach it next time
1. Read the link's host: localhost → missing config; wrong host → wrong value.
2. `grep` for where the URL is built and which env var feeds it.
3. Check the running value (env, or a public reflection like the Swagger host).
4. Test the flow with `curl`, not the old email.

### Prevention / follow-up
- **Open (security):** the register response returns the activation token (`"token": "<…>"`), so anyone can register with someone else's email and activate it without the inbox. Return the token only outside production.
- A startup check that refuses `localhost` URLs when `ENV=production`. `# suggested, not run`
- A real domain (INC-011), so the URL does not change when the ALB is recreated.

### References
- Helm values files: https://helm.sh/docs/chart_template_guide/values_files/
- Kustomize `helmCharts` (`additionalValuesFiles`): https://kubectl.docs.kubernetes.io/references/kustomize/builtins/#_helmchartinflationgenerator_
- Kubernetes env vs envFrom precedence: https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/#environment-variables

---

## INC-013 – Slack alert `TargetDown` for Grafana

| | |
|---|---|
| **Date** | 2026-10-01 (alert ≈ 16:15 IST; fix pushed 22:35 IST) |
| **Where** | kube-prometheus-stack in `monitoring`; `deploy/monitoring/kube-prometheus-stack-values.yaml` |
| **Severity** | Low – only Grafana's own metrics were missing |
| **Status** | Resolved (commit `e22dbdf`) |

### Summary
Prometheus could not scrape Grafana's metrics because serving Grafana under `/grafana` moved its metrics endpoint to `/grafana/metrics`, while the chart's ServiceMonitor still scraped `/metrics`. Setting the ServiceMonitor path fixed it.

### Background
- **ServiceMonitor:** tells Prometheus which Service, port and path to scrape. If a scrape fails, the `up` metric becomes 0 and the built-in alert **`TargetDown`** fires.
- **Sub-path serving:** I put Grafana on the shared ALB at `/grafana` with `grafana.ini` → `server.root_url: "%(protocol)s://%(domain)s:%(http_port)s/grafana/"` and `serve_from_sub_path: true`. With that, Grafana serves **every** URL under `/grafana/…`, including `/grafana/metrics`.
- **Alertmanager → Slack:** alerts are grouped and posted to Slack; `send_resolved: true` also posts when they clear.

### Timeline
1. Sent a test alert; Slack showed FIRING, then RESOLVED. Slack integration worked.
2. A real `TargetDown` alert for `kube-prometheus-stack-grafana` arrived.
3. Suspected the sub-path; `curl /grafana/metrics` through the ALB returned Prometheus metrics (200).
4. Found `grafana.serviceMonitor.path` in the chart's values, whose own comment mentions `root_url`.
5. Set it, rendered the chart to confirm, pushed; the alert resolved.

### What happened (symptom)
Slack `#alertmanager`:
```
[FIRING:1] TestAlert default (warning)
[RESOLVED] TestAlert default (warning)
[FIRING:1] TargetDown monitoring (kube-prometheus-stack-grafana monitoring/kube-prometheus-stack-prometheus kube-prometheus-stack-grafana warning)
```

### How we got there
Enabling sub-path serving for Grafana without changing its scrape path.

### Why (root cause)
`serve_from_sub_path: true` → metrics at `/grafana/metrics` → ServiceMonitor scrapes `/metrics` → 404 → `up{job="kube-prometheus-stack-grafana"} == 0` → `TargetDown` after its `for:` duration. Confirmed in the chart's `values.yaml` comment and by `curl`.

### Impact
No Grafana self-metrics; the Grafana UI itself worked.

### Resolution (step by step)
1. Find where the metrics really are: `curl http://<alb>/grafana/metrics` (the ALB forwards the full path).
2. Find the chart value: `grafana.serviceMonitor.path`.
3. Set it to `/grafana/metrics`, render with `helm template` to confirm, push.
4. Verify: Slack shows `[RESOLVED] TargetDown …`; in Grafana Explore, `up{job="kube-prometheus-stack-grafana"}` = 1.

### Terminal commands

**Finding it**
```
bastion$ kubectl exec -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -c alertmanager -- \
  amtool alert add TestAlert severity=warning namespace=default \
  --annotation=summary="Test alert from amtool" --alertmanager.url=http://localhost:9093
(no output; Slack received FIRING, then RESOLVED ~5 min later)

laptop$ curl -s -m 10 -o gm -w "/grafana/metrics -> %{http_code} %{content_type}\n" http://<alb-hostname>/grafana/metrics; head -c 150 gm
/grafana/metrics -> 200 text/plain; version=0.0.4; charset=utf-8; escaping=underscores
# HELP deprecated_flags_inuse_total The number of deprecated flags currently set.
# TYPE deprecated_flags_inuse_total counter

laptop$ helm pull prometheus-community/kube-prometheus-stack --version 91.8.2 --untar --untardir kps
laptop$ grep -n "^grafana:" -A400 kps/kube-prometheus-stack/values.yaml | grep -n "serviceMonitor:" -A8 | head -10
303:1696-  serviceMonitor:
304-1697-    # If true, a ServiceMonitor CRD is created for a prometheus operator
306-1699-    #
307-1700-    enabled: true
309-1702-    # Path to use for scraping metrics. Might be different if server.root_url is set
310-1703-    # in grafana.ini
311-1704-    # path: /metrics
```

**Fixing it**
```
laptop$ helm template kube-prometheus-stack kps/kube-prometheus-stack -n monitoring -f deploy/monitoring/kube-prometheus-stack-values.yaml | python3 -c '…print grafana ServiceMonitor endpoints…'
kube-prometheus-stack-grafana [{'port': 'http-web', 'honorLabels': True, 'path': '/grafana/metrics', 'scheme': 'http'}]
laptop$ git commit -am "feat: add serviceMonitor path for Grafana metrics" && git push     # e22dbdf
```
expected output (not captured): Slack `[RESOLVED] TargetDown monitoring (kube-prometheus-stack-grafana …)` within 5–10 minutes of the sync.

### Code / config change
```yaml
grafana:
  grafana.ini:
    server:
      root_url: "%(protocol)s://%(domain)s:%(http_port)s/grafana/"
      serve_from_sub_path: true
  serviceMonitor:
    path: /grafana/metrics      # added
```
Commit `e22dbdf`.

### Lessons learned
Changing where an app is served moves every endpoint, including the ones machines use (metrics, health).

### How to approach it next time
1. `TargetDown` → which job? In Grafana Explore: `up == 0`.
2. Check the target's path from the outside (`curl`) and compare with the ServiceMonitor (`kubectl get servicemonitor -n monitoring <name> -o yaml`).

### Prevention / follow-up
When adding sub-path serving, update health check paths (INC-009) and scrape paths in the same change.

### References
- Grafana `serve_from_sub_path`: https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/#serve_from_sub_path
- kube-prometheus-stack chart: https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack
- Prometheus Operator ServiceMonitor: https://prometheus-operator.dev/docs/developer/getting-started/#using-servicemonitors

---

## INC-014 – `kubectl` on the bastion: executable aws not found

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 22:43 IST) |
| **Where** | SSM session shell on the bastion |
| **Severity** | Low – local tooling only |
| **Status** | Resolved |

### Summary
In a new SSM session, every `kubectl` command failed because kubectl could not run the `aws` CLI it uses to get a login token. The CLI was installed but not on the `PATH` of that shell. Starting a login shell fixed it.

### Background
- `aws eks update-kubeconfig` writes a kubeconfig whose user section contains an **exec credential plugin**: before every request, kubectl runs `aws eks get-token …` to get a short-lived token.
- If kubectl cannot find the `aws` program on the `PATH`, every command fails before reaching the cluster.
- SSM Session Manager starts a plain `sh` with a minimal `PATH`. A **login shell** (`bash -l`) loads the normal profile and `PATH`.

### Timeline
1. Opened a new SSM session to check node capacity before installing logging.
2. `kubectl describe nodes` failed with `exec: executable aws not found`.
3. The error came from the local credential plugin, not from the cluster.
4. Started `bash -l`; `kubectl` worked.

### What happened (symptom)
```
E1001 17:13:03.733127   24806 memcache.go:381] "Couldn't get current server API group list" err=<
	Get "https://<eks-endpoint>/api?timeout=32s": getting credentials: exec: executable aws not found

	It looks like you are trying to use a client-go credential plugin that is not installed.

	To learn more about this feature, consult the documentation available at:
	      https://kubernetes.io/docs/reference/access-authn-authz/authentication/#client-go-credential-plugins
 >
… (repeated 5 times)
Unable to connect to the server: getting credentials: exec: executable aws not found
```

### How we got there
A fresh SSM session (plain `sh`), not the `bash` login shell used before.

### Why (root cause)
Plain `sh` → minimal `PATH` without `/usr/local/bin` (where AWS CLI v2 installs) → kubectl's exec plugin cannot start `aws` → no token → every request fails.

### Impact
A few minutes; nothing in the cluster affected.

### Resolution (step by step)
1. Check where `aws` is: `ls -l /usr/local/bin/aws /snap/bin/aws; command -v aws`.
2. Start a login shell: `bash -l`.
3. If still not found: `export PATH="$PATH:/usr/local/bin:/snap/bin"`.
4. Verify: `aws --version && kubectl get nodes`.

### Terminal commands

**Finding it**
```
bastion$ kubectl describe nodes | grep -A7 "Allocated resources" | grep -E "Allocated|cpu|memory"
E1001 17:13:03.733127   24806 memcache.go:381] "Couldn't get current server API group list" err=< … getting credentials: exec: executable aws not found … >
Unable to connect to the server: getting credentials: exec: executable aws not found
```

**Fixing it**
```
bastion$ ls -l /usr/local/bin/aws /snap/bin/aws 2>/dev/null; command -v aws
(output not captured)
bastion$ bash -l
bastion$ aws --version && kubectl get nodes
(output not captured)
expected output: aws-cli/2.x … and two nodes in STATUS Ready
bastion$ kubectl describe nodes | grep -A7 "Allocated resources" | grep -E "Allocated|cpu|memory"
Allocated resources:
  cpu                540m (27%)   750m (38%)
  memory             726Mi (10%)  2698Mi (38%)
Allocated resources:
  cpu                810m (41%)    1250m (64%)
  memory             1942Mi (27%)  4874Mi (68%)
```
(Those numbers showed Elasticsearch + Kibana would fit on the two nodes.)

### Code / config change
None. `docs/SETUP_GUIDE.md` now tells readers to run `bash -l` after connecting.

### Lessons learned
Read where an error comes from. "getting credentials: exec …" is local, not the cluster.

### How to approach it next time
`executable X not found` from kubectl → the kubeconfig's exec plugin; check `kubectl config view --minify` for the command it runs, then `command -v <that command>`.

### Prevention / follow-up
Start sessions with a login shell: `aws ssm start-session --target <instance-id> --document-name AWS-StartInteractiveCommand --parameters command="bash -l"`.

### References
- client-go credential plugins: https://kubernetes.io/docs/reference/access-authn-authz/authentication/#client-go-credential-plugins
- `aws eks update-kubeconfig`: https://docs.aws.amazon.com/cli/latest/reference/eks/update-kubeconfig.html
- Session Manager: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html

---

## INC-015 – Kibana shows `red`, pod `0/1`

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 22:50 IST) |
| **Where** | `logging` namespace, ECK `Kibana` resource |
| **Severity** | Low |
| **Status** | Explained (no fault) |

### Summary
Two minutes after installing the logging stack, Kibana showed `red` with its pod not Ready. It was still initialising; it turned green on its own a minute later.

### Background
- ECK reports each resource's health: `green` when all pods are Ready.
- On first start, Kibana creates its system indices in Elasticsearch and runs migrations; this takes 2–4 minutes, during which its readiness probe fails.
- I serve Kibana under `/kibana` (`server.basePath`, `server.rewriteBasePath: true`) and set its readiness probe to `/kibana/login`.

### Timeline
1. Applied `eck-operator` then `logging` Applications.
2. Elasticsearch `green`, Filebeat `green 2/2`, Kibana `red`, pod `0/1 Running`.
3. Checked from outside: `/kibana/login` returned 200 and the ALB target was healthy.
4. Kibana turned green.

### What happened (symptom)
```
kibana.kibana.k8s.elastic.co/kibana   red              9.5.0     3m1s
pod/kibana-kb-77fd8b7996-7mrjq        0/1     Running   0          119s
```

### How we got there
Checking 2 minutes after creation.

### Why (root cause)
First-start initialisation; the pod is not Ready yet, so ECK reports `red`. Not a fault.

### Impact
None.

### Resolution (step by step)
1. Check the layer below before changing anything: the endpoint (`curl /kibana/login`) and the ALB target health.
2. Wait 2–3 minutes; re-check `kubectl get kibana -n logging`.

### Terminal commands

**Finding it**
```
bastion$ kubectl get elasticsearch,kibana,beat,pods,pvc -n logging
NAME                                                       HEALTH   NODES   VERSION   PHASE   AGE
elasticsearch.elasticsearch.k8s.elastic.co/elasticsearch   green    1       9.5.0     Ready   3m1s
NAME                                  HEALTH   NODES   VERSION   AGE
kibana.kibana.k8s.elastic.co/kibana   red              9.5.0     3m1s
NAME                                HEALTH   AVAILABLE   EXPECTED   TYPE       VERSION   AGE
beat.beat.k8s.elastic.co/filebeat   green    2           2          filebeat   9.5.0     3m1s
NAME                               READY   STATUS    RESTARTS   AGE
pod/elastic-operator-0             1/1     Running   0          4m19s
pod/elasticsearch-es-default-0     1/1     Running   0          119s
pod/filebeat-beat-filebeat-<a>     1/1     Running   0          89s
pod/filebeat-beat-filebeat-<b>     1/1     Running   0          119s
pod/kibana-kb-77fd8b7996-7mrjq     0/1     Running   0          119s
NAME                                                                  STATUS   VOLUME     CAPACITY   ACCESS MODES   STORAGECLASS
persistentvolumeclaim/elasticsearch-data-elasticsearch-es-default-0   Bound    pvc-<id>   20Gi       RWO            ebs-gp3
```

**Verifying**
```
laptop$ for p in /kibana/login /kibana; do curl -s -m 15 -o /dev/null -w "$p -> %{http_code} %{redirect_url}\n" http://<alb-hostname>$p; done
/kibana/login -> 200
/kibana -> 302 http://<alb-hostname>/kibana/login?next=%2Fkibana%2F
laptop$ (target health of the Kibana target group)
<pod-ip>	healthy	None
bastion$ kubectl get kibana -n logging
(output not captured)
expected output: kibana   green   1   9.5.0
```

### Code / config change
None. (The basePath, readiness probe and TLS settings were part of the logging commit `defafe7`.)

### Lessons learned
Stateful apps need minutes on first start. Check the endpoint before "fixing" a status.

### How to approach it next time
`red` for more than ~5 minutes → `kubectl describe pod kibana-kb-…` (probe failures) and `kubectl logs` for the real error.

### Prevention / follow-up
None.

### References
- ECK (Elastic Cloud on Kubernetes): https://www.elastic.co/docs/deploy-manage/deploy/cloud-on-k8s
- Kibana base path settings: https://www.elastic.co/guide/en/kibana/current/settings.html

---

## INC-016 – `error: Metrics API not available`

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 23:00 IST) |
| **Where** | metrics-server in `kube-system` (Argo CD Application `metrics-server`) |
| **Severity** | Low |
| **Status** | Explained |

### Summary
`kubectl top` failed because I ran it in the same second I created the metrics-server Application; the pod was not running yet. A minute later it worked.

### Background
- **metrics-server** collects CPU/memory usage from each node's kubelet and serves it through the **Metrics API** (`metrics.k8s.io`), registered as an `APIService`. `kubectl top` and the HPA use it.
- Argo CD needs a few seconds to fetch the chart and create the resources; metrics-server then needs one scrape (~15 s) before the API reports `Available`.

### Timeline
1. `kubectl apply -f deploy/bootstrap/metrics-server.yaml`.
2. Immediately ran `kubectl get pods | grep metrics-server` (nothing) and `kubectl top nodes` (error).
3. Waited ~1 minute; `kubectl top nodes` worked.

### What happened (symptom)
```
error: Metrics API not available
```

### How we got there
Running the check before the component existed.

### Why (root cause)
No metrics-server pod yet → the `v1beta1.metrics.k8s.io` APIService is unavailable → `kubectl top` errors.

### Impact
None.

### Resolution (step by step)
1. Wait for the pod: `kubectl get pods -n kube-system -l app.kubernetes.io/name=metrics-server`.
2. Check the API: `kubectl get apiservice v1beta1.metrics.k8s.io` → `AVAILABLE True`.
3. `kubectl top nodes`.

### Terminal commands

**Finding it**
```
bastion$ kubectl apply -f deploy/bootstrap/metrics-server.yaml
application.argoproj.io/metrics-server created
bastion$ kubectl get pods -n kube-system | grep metrics-server
(no output)
bastion$ kubectl top nodes && kubectl top pods -n default
error: Metrics API not available
```

**Verifying (≈ 1 minute later)**
```
bastion$ kubectl get apiservice v1beta1.metrics.k8s.io
(output not captured)
expected output: v1beta1.metrics.k8s.io   kube-system/metrics-server   True   1m
bastion$ kubectl top nodes
NAME        CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)
<node-1>    165m         8%       4765Mi          67%
<node-2>    343m         17%      4271Mi          60%
```

### Code / config change
`deploy/bootstrap/metrics-server.yaml` (chart 3.14.0), part of commit `23ce7c1`.

### Lessons learned
Asynchronous systems need a moment; check that a component exists before testing what it provides.

### How to approach it next time
If it persists after 2 minutes: `kubectl describe apiservice v1beta1.metrics.k8s.io` (a `FailedDiscoveryCheck` usually means the control plane cannot reach the pod on port 10250).

### Prevention / follow-up
None.

### References
- metrics-server: https://github.com/kubernetes-sigs/metrics-server
- Resource metrics pipeline: https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/

---

## INC-017 – No HPA, then `cpu: <unknown>` and 1 replica

| | |
|---|---|
| **Date** | 2026-10-01 (≈ 23:10 IST) |
| **Where** | HorizontalPodAutoscalers and PodDisruptionBudgets in `default`; chart templates `hpa.yaml`, `pdb.yaml` |
| **Severity** | Low |
| **Status** | Explained |

### Summary
Right after pushing the autoscaling change, there was no HPA; then the HPAs showed `<unknown>` CPU and only 1 replica. All three were expected transitions: Argo CD had not synced yet, metrics take a minute, and removing `replicas` from a Deployment resets it to 1 until the HPA raises it.

### Background
- A **HorizontalPodAutoscaler (HPA)** adds/removes pods to keep average CPU near a target (here 70% of each container's CPU *request*), between `minReplicas` (2) and `maxReplicas` (5).
- When an HPA owns a Deployment, the Deployment manifest must **not** set `replicas`; otherwise every Argo CD sync resets the count and fights the HPA. My chart omits it when `autoscaling.enabled: true`.
- Removing `replicas` from a Deployment that had it makes Kubernetes fall back to the default **1**.
- A **PodDisruptionBudget** (`minAvailable: 1`) limits voluntary evictions; `ALLOWED DISRUPTIONS` is 0 while only one pod is Ready.
- Argo CD polls Git about every 3 minutes.

### Timeline
1. Pushed `23ce7c1` (HPA + PDB). `kubectl get hpa,pdb` → nothing.
2. Checked the Application revision and forced a refresh.
3. HPAs appeared with `cpu: <unknown>/70%`, `REPLICAS 1`; PDBs with `ALLOWED DISRUPTIONS 0`.
4. 48 seconds later: `cpu: 1%/70%` and `2%/70%`, `REPLICAS 2`.
5. Later a k6 load test scaled the frontend 2 → 5 with 0 failed requests.

### What happened (symptom)
```
No resources found in default namespace.
…
horizontalpodautoscaler.autoscaling/go-feed            Deployment/go-feed            cpu: <unknown>/70%   2   5   1   16s
horizontalpodautoscaler.autoscaling/go-feed-frontend   Deployment/go-feed-frontend   cpu: <unknown>/70%   2   5   1   16s
poddisruptionbudget.policy/go-feed            1   N/A   0   19s
poddisruptionbudget.policy/go-feed-frontend   1   N/A   0   19s
```

### How we got there
Checking immediately after pushing.

### Why (root cause)
1. No HPA: Argo CD had not polled the new commit yet.
2. `REPLICAS 1`: the field removal reset the Deployment to the default 1 (one-time).
3. `<unknown>`: the new HPA had no metrics sample yet.

### Impact
For a few seconds each Deployment ran 1 pod instead of 2 (one pod kept serving).

### Resolution (step by step)
1. `kubectl annotate application go-feed -n argocd argocd.argoproj.io/refresh=normal --overwrite` – re-read Git now.
2. Wait ~1 minute; re-check `kubectl get hpa,pdb -n default`.

### Terminal commands

**Finding it**
```
bastion$ kubectl get hpa,pdb -n default
No resources found in default namespace.
bastion$ kubectl get application go-feed -n argocd -o jsonpath='revision={.status.sync.revision}{"\n"}sync={.status.sync.status} health={.status.health.status}{"\n"}op={.status.operationState.phase}: {.status.operationState.message}{"\n"}'
(output not captured)
bastion$ kubectl annotate application go-feed -n argocd argocd.argoproj.io/refresh=normal --overwrite
(output not captured)
expected output: application.argoproj.io/go-feed annotated
bastion$ kubectl get hpa,pdb -n default
NAME                                                   REFERENCE                     TARGETS              MINPODS   MAXPODS   REPLICAS   AGE
horizontalpodautoscaler.autoscaling/go-feed            Deployment/go-feed            cpu: <unknown>/70%   2         5         1          16s
horizontalpodautoscaler.autoscaling/go-feed-frontend   Deployment/go-feed-frontend   cpu: <unknown>/70%   2         5         1          16s
NAME                                          MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
poddisruptionbudget.policy/go-feed            1               N/A               0                     19s
poddisruptionbudget.policy/go-feed-frontend   1               N/A               0                     19s
```

**Verifying**
```
bastion$ kubectl get hpa,pdb -n default
NAME                                                   REFERENCE                     TARGETS       MINPODS   MAXPODS   REPLICAS   AGE
horizontalpodautoscaler.autoscaling/go-feed            Deployment/go-feed            cpu: 1%/70%   2         5         2          48s
horizontalpodautoscaler.autoscaling/go-feed-frontend   Deployment/go-feed-frontend   cpu: 2%/70%   2         5         2          48s
NAME                                          MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
poddisruptionbudget.policy/go-feed            1               N/A               0                     51s
poddisruptionbudget.policy/go-feed-frontend   1               N/A               0                     51s
```
(`ALLOWED DISRUPTIONS` became 1 once the second pods were Ready.) Load test, 300 virtual users for 5 minutes:
```
laptop$ docker run --rm -i -v $PWD/load.js:/load.js:ro grafana/k6:latest run --quiet /load.js
    checks_succeeded...: 100.00% 346018 out of 346018
    http_req_duration..............: avg=233.71ms p(50)=225.17ms p(95)=286.78ms max=2.01s
    http_req_failed................: 0.00%  0 out of 346018
    http_reqs......................: 346018 1152.558808/s
laptop$ (frontend target group, every 30 s)
23:19:25 frontend targets: healthy healthy
23:21:03 frontend targets: healthy healthy healthy
23:21:37 frontend targets: healthy healthy healthy healthy
23:22:10 frontend targets: healthy healthy healthy healthy healthy
```

### Code / config change
Commit `23ce7c1`: `templates/hpa.yaml`, `templates/pdb.yaml`, `replicas` wrapped in `{{- if not .Values.<component>.autoscaling.enabled }}`, `autoscaling` and `podDisruptionBudget` values.

### Lessons learned
- Removing `replicas` when handing a Deployment to an HPA causes a brief drop to 1; plan for it.
- Many "errors" right after a push are just timing.

### How to approach it next time
`<unknown>` for more than 2 minutes → `kubectl describe hpa <name>`; the usual causes are no CPU requests or no metrics-server.

### Prevention / follow-up
Set `minReplicas` ≥ 2 and a PDB, so the one-time reset never takes a service to zero.

### References
- HPA, migrating Deployments to autoscaling: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#migrating-deployments-and-statefulsets-to-horizontal-autoscaling
- PodDisruptionBudgets: https://kubernetes.io/docs/tasks/run-application/configure-pdb/
- Argo CD refresh: https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/

---

## INC-018 – Login spins forever, every request returns 401 (Redis)

| | |
|---|---|
| **Date** | 2026-10-01 23:50 IST – 2026-10-02 00:08 IST |
| **Where** | `AuthTokenMiddleware` (`cmd/api/middleware.go`), `getUser` (`cmd/api/users.go`), Redis settings from Vault; fixed in the Helm chart |
| **Severity** | High – nobody could use the app after logging in |
| **Status** | Resolved (commit `a681d99`); code follow-ups open |

### Summary
Login succeeded, but every authenticated request then returned 401 and the UI spun forever. The cause was not authentication: `REDIS_ENABLED=true` (copied from my laptop into Vault) made the API look users up in a Redis that did not exist, and the auth middleware reports **any** error as 401. I added Redis to the Helm chart and pointed the API at it.

### Background
- **JWT login:** `POST /v1/authentication/token` checks the password and returns a signed JWT whose `sub` claim is the user ID.
- **After login, the frontend** decodes `sub` and calls `GET /v1/users/{id}`. If that call fails, it throws the login away (`clearAuth()`), so the user stays on the spinner.
- **`AuthTokenMiddleware`** (on every authenticated route): validate the JWT, then `getUser(ctx, id)`. **Any** error in either step → `401 unauthorized`.
- **`getUser`** reads from Redis first when `REDIS_ENABLED=true` (key `user-<id>`, 1-minute TTL), otherwise from Postgres.
- **HTTP status meaning:** 401 = "you are not authenticated"; 500 = "the server failed". Returning 401 for an infrastructure failure points the investigation in the wrong direction.

### Timeline
1. Activated my account (INC-012), logged in: spinner; browser console `401 (Unauthorized)`.
2. Read the frontend: after login it calls `GET /v1/users/{sub}`.
3. Reproduced with `curl`: login → valid JWT (`sub: 3`), but `/v1/users/3` and `/v1/users/feed` → 401.
4. Suspected JWT validation (`jwt.WithAudience()` with no arguments); a local test proved validation works.
5. Ruled out the DB lookup (roles valid, user active). Remaining: `getUser`'s Redis path; Vault's Secret had `REDIS_ENABLED` and `REDIS_ADDR` (from my `.env`) and no Redis ran in the cluster.
6. First fix idea: `REDIS_ENABLED: "false"` in `values-dev.yaml`. I wanted the cache, so instead added Redis to the chart.
7. Tested locally with Docker (Postgres + migrations + Redis + API): 200, cache key present.
8. Pushed; polled the live site: 401 → mixed during rollout → 200.

### What happened (symptom)
Browser console:
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```
UI: login button spinner never ends.

### How we got there
`secret/go-feed/production` in Vault contained `REDIS_ENABLED=true` and `REDIS_ADDR=localhost:6379` from the laptop. No Redis was ever deployed in the cluster.

### Why (root cause)
Login (no cache) works → frontend calls `/v1/users/{id}` → middleware validates the JWT (OK) → `getUser` calls Redis at localhost → connection error → middleware returns **401** → frontend clears the login → spinner. Same root cause family as INC-007 (laptop config in Vault), made harder to see by the wrong status code. Confirmed by reading `middleware.go` and `getUser`, and by a local test that isolates JWT validation.

### Impact
All logged-in functionality broken until 00:07 IST. No data affected.

### Resolution (step by step)
1. Reproduce outside the browser with `curl` (login → token → authenticated call).
2. Isolate suspects: test JWT validation alone (local Go test), check the DB lookup (roles, `is_active`).
3. Read `getUser`; check which Redis keys the Secret has.
4. Add Redis to the chart: Deployment `go-feed-redis` (`redis:8.10.2-alpine`) as a pure cache (`--save "" --appendonly no --maxmemory 100mb --maxmemory-policy allkeys-lru --requirepass $(REDIS_PW)`), Service on 6379, TCP probes; the chart sets the API's `REDIS_ADDR=go-feed-redis:6379` and `REDIS_ENABLED=true` (overrides Vault).
5. Test locally with Docker, push, poll the live site until 200.

### Terminal commands

**Finding it**
```
laptop$ sed -n '/const loadUser/,/^  };/p' frontend/src/contexts/AuthContext.jsx
  const loadUser = useCallback(async (jwtToken) => {
    …
    const userID = Math.round(claims.sub);
    try {
      const res = await getUser(userID);
      …
    } catch {
      clearAuth();
    } finally {
      setLoading(false);
    }
laptop$ grep -n "export const getUser" frontend/src/api.js
55:export const getUser = (userID) => api.get(`/users/${userID}`);

laptop$ JWT=$(curl -s -m 10 -X POST http://<alb-hostname>/v1/authentication/token -H 'Content-Type: application/json' \
  -d '{"email":"<test-user-email>","password":"Test-pass-123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"])')
laptop$ echo "$JWT" | cut -d. -f2 | tr '_-' '/+' | base64 -d; echo
{"aud":"gofeed","exp":1791138339,"iat":1790879139,"iss":"gofeed","nbf":1790879139,"sub":3}
laptop$ for p in /v1/users/3 /v1/users/feed; do curl -s -m 10 -H "Authorization: Bearer $JWT" -w "  <- GET $p [%{http_code}]\n" http://<alb-hostname>$p; done
{"error":"unauthorized"}  <- GET /v1/users/3 [401]
{"error":"unauthorized"}  <- GET /v1/users/feed [401]

laptop$ sed -n '/func (app \*application) AuthTokenMiddleware/,/^}/p' cmd/api/middleware.go
	…
		jwtToken, err := app.authenticator.ValidateToken(token)
		if err != nil {
			app.unauthorizedErrorResponse(w, r, err)
			return
		}
	…
		user, err := app.getUser(ctx, userID)
		if err != nil {
			app.unauthorizedErrorResponse(w, r, err)
			return
		}

laptop$ grep -n "golang-jwt" go.mod
9:	github.com/golang-jwt/jwt/v5 v5.3.1
laptop$ cat > internal/auth/zz_probe_test.go <<'EOF'   # temporary: sign + validate with the real code
…
EOF
laptop$ go test -v -count=1 -run TestZZProbe ./internal/auth
    zz_probe_test.go:22: token validates OK
ok  	github.com/ritesh-karankal/go-feed/internal/auth	0.031s
laptop$ rm internal/auth/zz_probe_test.go

laptop$ sed -n '/func (app \*application) getUser/,/^}/p' cmd/api/users.go
func (app *application) getUser(ctx context.Context, userID int64) (*store.User, error) {
	app.logger.Infow("cache hit", "key", "user", "id", userID)
	if !app.config.redisCfg.enabled {
		return app.store.Users.GetByID(ctx, userID)
	}
	user, err := app.cacheStorage.Users.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	…
laptop$ grep -n "is_active" internal/store/users.go | head -3
96:		WHERE users.id = $1 AND is_active = true
```
Confirming in the cluster (recommended check):
```
bastion$ kubectl logs -n default deploy/go-feed --since=30m | grep -i "unauthorized" | tail -3
(output not captured)
expected output: an "unauthorized error" log entry whose error mentions a refused connection to port 6379
```

**Fixing it** (local Docker test before pushing: Postgres, migrations, Redis exactly as the chart starts it, and my API)
```
laptop$ docker build -q -t gf-api:t . && docker build -q --build-arg CMD=migrate -t gf-mig:t .
laptop$ docker network create gf-e2e
laptop$ docker run -d --rm --name gf-pg --network gf-e2e -e POSTGRES_DB=socialnetwork -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=pgpw postgres:16.15-alpine
laptop$ docker run -d --rm --name go-feed-redis --network gf-e2e redis:8.10.2-alpine --save "" --appendonly no --maxmemory 100mb --maxmemory-policy allkeys-lru --requirepass redispw
laptop$ docker run --rm --network gf-e2e -e DB_ADDR="$DB" gf-mig:t
2026/10/01 18:29:56 migrations applied: version=13 dirty=false
laptop$ (insert an active test user with a bcrypt password)
laptop$ docker run -d --rm --name gf-api --network gf-e2e -p 18080:8080 -e DB_ADDR="$DB" -e REDIS_ENABLED=true -e REDIS_ADDR=go-feed-redis:6379 -e REDIS_PW=redispw -e AUTH_TOKEN_SECRET=s3cret gf-api:t
login ok, sub=1
{"data":{"id":1,"username":"tester","email":"t@example.com","created_at":"2026-10-01T18:29:58Z",…}  [200]
{"data":{"id":1,"username":"tester","email":"t@example.com","created_at":"2026-10-01T18:29:58Z",…}  [200]
laptop$ docker exec go-feed-redis redis-cli -a redispw --no-auth-warning keys '*'
user-1
== empty password variant (as when REDIS_PW is empty in Vault)
laptop$ docker run -d --rm --name gf-redis2 --network gf-e2e redis:8.10.2-alpine --requirepass ""; docker exec gf-redis2 redis-cli ping
PONG
```
(Two 200s: the second served from Redis.) Then commit and push (`a681d99`).

**Verifying (live, every 15 s; times are my IST clock)**
```
laptop$ for i in $(seq 1 24); do JWT=…login…; A=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $JWT" http://<alb-hostname>/v1/users/3); B=…/v1/users/feed…; echo "$(date +%H:%M:%S) users/3=$A feed=$B"; sleep 15; done
00:01:52 users/3=401 feed=401
00:02:10 users/3=401 feed=401
…
00:05:50 users/3=401 feed=401
00:06:06 users/3=200 feed=401
00:06:23 users/3=401 feed=200
00:06:49 users/3=000 feed=200        <- see INC-019
00:07:05 users/3=200 feed=200
00:07:22 users/3=200 feed=200
00:07:38 users/3=200 feed=200
```
In the browser (private window, to drop the cached failed login), login went straight to the feed.

### Code / config change
Commit `a681d99` ("feat: add Redis deployment and service configurations for caching"):
- `templates/redis-deployment.yaml`, `templates/redis-service.yaml` (new)
- `templates/_helpers.tpl`: `gopher-feed.redisEnv` → `REDIS_ADDR=go-feed-redis:6379`, `REDIS_ENABLED=true`
- `templates/api-deployment.yaml`: includes `redisEnv`
- `values.yaml`: `redis:` section (image, `maxMemory: 100mb`, `passwordSecret: go-feed-secrets/REDIS_PW`)

### Lessons learned
- **The status code lied.** Infrastructure failures must be 500, not 401.
- Reproduce a browser bug with `curl`; then prove suspects innocent one at a time.
- Laptop config in Vault caused two outages (INC-007, INC-018). Topology belongs in the chart.

### How to approach it next time
1. Login OK but later calls 401 → take the token and call the same endpoint with `curl`.
2. Validate the token offline (decode the claims; test validation in isolation).
3. If the token is fine, look at what the middleware does **after** validation (user lookup, cache) and at its dependencies (`kubectl get pods`, `kubectl get svc`).
4. Grep the API logs for the error text behind the 401.

### Prevention / follow-up
- **Open:** make the cache optional – fall back to Postgres when Redis errors.
- **Open:** return 500 from `AuthTokenMiddleware` for errors other than an invalid token / unknown user.
- **Open:** log "cache hit" only on a real hit (it is currently logged before anything is checked, which misleads).
- **Open:** set a Redis password in Vault (`vault kv patch secret/go-feed/production REDIS_PW=…`).

### References
- Redis eviction policies: https://redis.io/docs/latest/develop/reference/eviction/
- Redis persistence options: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- HTTP 401: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401
- JWT registered claims (`sub`, `aud`, `iss`): https://datatracker.ietf.org/doc/html/rfc7519#section-4.1

---

## INC-019 – Request dropped during a rolling update

| | |
|---|---|
| **Date** | 2026-10-02 (00:06:49 IST, during INC-018's rollout) |
| **Where** | API pods behind the ALB during a Deployment rolling update |
| **Severity** | Medium – an occasional failed request on every deploy |
| **Status** | Open (fix designed, not applied) |

### Summary
One request got no response at all while API pods were being replaced. Kubernetes stopped the old pod before the ALB had removed it from its target group. A `preStop` delay will close the gap.

### Background
- In `curl -w "%{http_code}"`, **`000`** means no HTTP response at all (connection reset, refused or timed out) – different from a 4xx/5xx, which is an answer.
- When a pod is deleted, two things happen **in parallel**: (1) the container gets SIGTERM and my API's graceful shutdown (`srv.Shutdown`) stops it, and (2) the endpoint is removed, the Load Balancer Controller notices and deregisters the pod IP from the ALB target group. (2) takes a few seconds; (1) can be faster.
- A **`preStop` hook** runs before SIGTERM. A sleep there keeps the pod serving while the ALB deregisters it.
- The API image is `FROM scratch` (no shell, no `sleep` binary), so the hook must use Kubernetes' built-in `sleep` action, not `exec`.

### Timeline
1. During INC-018's rollout, my 15-second poll printed `users/3=000`.
2. It coincided with old API pods terminating.
3. Analysis: shutdown vs. deregistration race.
4. Fix designed (below), not yet applied.

### What happened (symptom)
```
00:06:23 users/3=401 feed=200
00:06:49 users/3=000 feed=200
00:07:05 users/3=200 feed=200
```

### How we got there
A normal rolling update (new image from a push), with traffic flowing through the ALB.

### Why (root cause)
Pod deletion → SIGTERM → API exits within milliseconds–seconds, while the ALB still has the pod IP registered for a few more seconds → a request routed to the gone pod gets no response.

### Impact
With Image Updater deploying every merge, real users would see an occasional failed request on each deploy.

### Resolution (step by step) – planned
1. Add to the API and frontend containers:
   ```yaml
   spec:
     terminationGracePeriodSeconds: 45
     containers:
       - name: go-feed
         lifecycle:
           preStop:
             sleep:
               seconds: 15
   ```
2. Render, push, and verify with a poll loop (or k6) during a rollout: zero `000` lines.

### Terminal commands

**Finding it**
```
laptop$ (poll loop from INC-018)
00:06:49 users/3=000 feed=200
```

**Fixing it**
```
# suggested, not run
laptop$ kubectl kustomize --enable-helm deploy/app | grep -A4 preStop
bastion$ kubectl rollout restart deploy/go-feed -n default
laptop$ (poll loop during the rollout)
expected output: no lines with =000
```

### Code / config change
None yet.

### Lessons learned
A rolling update is not zero-downtime by default behind an external load balancer.

### How to approach it next time
Intermittent `000`/502 during deploys only → suspect termination timing; compare the time of the error with pod termination times (`kubectl get events`).

### Prevention / follow-up
- **Open:** add the `preStop` sleep to both Deployments.
- Optional: the controller's pod readiness gate (namespace label `elbv2.k8s.aws/pod-readiness-gate-inject=enabled`) so new pods only receive traffic after the ALB reports them healthy. `# suggested, not run`

### References
- Pod termination: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination
- Container lifecycle hooks (`sleep` action): https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/
- LBC pod readiness gate: https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/deploy/pod_readiness_gate/

---

## INC-020 – Seed data never appears

| | |
|---|---|
| **Date** | 2026-10-02 (≈ 00:10 – 00:25 IST) |
| **Where** | `internal/db/seed.go`, `cmd/migrate/migrations/seed/main.go` |
| **Severity** | Medium – an empty app for demos; the seeder had never worked |
| **Status** | Resolved (commit `bd579a0`) |

### Summary
The feed was empty because the sample-data seeder had never run in the cluster – and reading it showed it could never have worked anywhere: it never committed its transaction, never set the (required) password, and left users inactive. I fixed all three, made it idempotent, and run it from the migrations image as an Argo CD PostSync Job in dev only.

### Background
- **Seeding** loads sample data (100 users, 200 posts, 500 comments) for development and demos.
- **Transactions:** `db.BeginTx` starts one; changes are invisible to other connections until `tx.Commit()`. Without a commit they are discarded when the connection closes.
- `users.password` is `bytea NOT NULL` (migration 000001); inserting a user with no password fails.
- Almost every query filters `is_active = true`; the column defaults to `false`.
- **Argo CD hooks:** a resource annotated `argocd.argoproj.io/hook: PostSync` runs after each successful sync; `hook-delete-policy: BeforeHookCreation` keeps the last run (for its logs) until the next one.

### Timeline
1. The feed was empty; `make seed` had only ever run against my laptop's database.
2. Read `seed.go`: users inserted in `tx`, posts inserted outside it, **no `Commit`**, errors only logged.
3. Checked the schema (`password NOT NULL`) and queries (`is_active = true`).
4. Fixed the seeder; added `-seed` to `cmd/migrate`; added a `PostSync` Job enabled by `seed.enabled` in `values-dev.yaml`.
5. Tested locally (seed, seed again, login as seeded user, load feed); pushed.

### What happened (symptom)
Empty home feed; no sample users.

### How we got there
The seeder came with the course code and was never tested.

### Why (root cause)
Three independent bugs:
1. No `password` → the first `INSERT INTO users` violates `NOT NULL` → error logged, function returns.
2. Even with a password: users inserted in `tx` → posts inserted on another connection cannot see uncommitted users → foreign-key failure → `tx` never committed → everything discarded.
3. Even if committed: `is_active = false` → seeded users invisible and unable to log in.

### Impact
No sample data in any environment. No production impact.

### Resolution (step by step)
1. In `seed.go`: hash `password` once with bcrypt and share it; `UPDATE users SET is_active = true` in the same transaction; `tx.Commit()` before posts; return errors; skip if user `Liam0` exists.
2. `cmd/migrate`: `-seed` flag → after migrations, run `db.Seed`.
3. Chart: `templates/seed-job.yaml` (PostSync hook, migrations image, `args: ["-seed"]`, same `DB_ADDR`), `seed.enabled: false` by default, `true` in `values-dev.yaml`.
4. Verify locally, push; in the cluster `kubectl logs -n default job/go-feed-seed`.

### Terminal commands

**Finding it**
```
laptop$ grep -n "seed" Makefile
19:.PHONY: seed
20:seed:
21:	@go run cmd/migrate/migrations/seed/main.go
laptop$ sed -n 85,112p internal/db/seed.go
	users := generateUsers(100)
	tx, _ := db.BeginTx(ctx, nil)

	for _, user := range users {
		if err := store.Users.Create(ctx, tx, user); err != nil {
			_ = tx.Rollback()
			log.Println("Error creating user:", err)
			return
		}
	}

	posts := generatePosts(200, users)
	for _, post := range posts {
		if err := store.Posts.Create(ctx, post); err != nil {
			log.Println("Error creating post:", err)
			return
		}
	}
…
laptop$ grep -n "Commit\|Rollback\|IsActive\|Password\|is_active" internal/db/seed.go
90:			_ = tx.Rollback()
laptop$ cat cmd/migrate/migrations/000001_create_users.up.sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE IF NOT EXISTS users(
  id bigserial PRIMARY KEY,
  email citext UNIQUE NOT NULL,
  username varchar(255) UNIQUE NOT NULL,
  password bytea NOT NULL,
  created_at timestamp(0) with time zone NOT NULL DEFAULT NOW()
);
laptop$ grep -n "is_active" internal/store/*.go | head -4
internal/store/followers.go:55:		WHERE f.user_id = $1 AND u.is_active = true
internal/store/users.go:96:		WHERE users.id = $1 AND is_active = true
internal/store/users.go:302:		WHERE email = $1 AND is_active=true
```

**Fixing it** (local test: seed twice, then log in as a seeded user and load the feed)
```
laptop$ go build ./... && go vet ./internal/db ./cmd/migrate/... && echo OK
OK
laptop$ docker build -q --build-arg CMD=migrate -t gf-mig:t . && docker build -q -t gf-api:t .
laptop$ docker run -d --rm --name gf-pg --network gf-seed -e POSTGRES_DB=socialnetwork -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=pgpw postgres:16.15-alpine
== run 1
laptop$ docker run --rm --network gf-seed -e DB_ADDR="$DB" gf-mig:t -seed
2026/10/01 18:49:51 migrations applied: version=13 dirty=false
2026/10/01 18:49:54 Seeding complete: 100 users, 200 posts, 500 comments
== run 2
laptop$ docker run --rm --network gf-seed -e DB_ADDR="$DB" gf-mig:t -seed
2026/10/01 18:49:56 migrations applied: version=13 dirty=false
2026/10/01 18:49:56 Seed data already present, skipping
laptop$ docker exec gf-pg psql -U admin -d socialnetwork -tAc "select (select count(*) from users), (select count(*) from users where is_active), (select count(*) from posts), (select count(*) from comments);"
100|100|200|500
laptop$ (login as Liam0@example.com / password, then GET /v1/users/feed?limit=3)
feed posts returned: 3
```

**Verifying in the cluster**
```
bastion$ kubectl logs -n default job/go-feed-seed
(output not captured)
expected output:
… migrations applied: version=13 dirty=false
… Seeding complete: 100 users, 200 posts, 500 comments
```
(The very first Job run may fail with `flag provided but not defined: -seed` if Argo CD syncs the chart before Image Updater rolls out the new migrations image; the next sync runs it again.)

### Code / config change
Commit `bd579a0`:
- `internal/db/seed.go`: returns `error`; password; `is_active`; `tx.Commit()`; idempotency guard.
- `cmd/migrate/main.go`: `-seed` flag.
- `cmd/migrate/migrations/seed/main.go`: `log.Fatal` on error.
- `deploy/app/helm/go-feed/templates/seed-job.yaml` (new), `values.yaml` (`seed.enabled: false`), `deploy/app/values-dev.yaml` (`seed.enabled: true`).

### Lessons learned
- A function that only logs errors hides its own failure.
- Untested tools can be broken from day one.

### How to approach it next time
"Data missing" → check whether the loader ran at all, then whether it **committed**, then whether queries filter it out.

### Prevention / follow-up
- A test for the seeder against a real Postgres (testcontainers). `# suggested, not run`
- All seeded users share the password `password`: keep `seed.enabled` off outside dev.

### References
- Go `database/sql` transactions: https://pkg.go.dev/database/sql#Tx
- Argo CD resource hooks: https://argo-cd.readthedocs.io/en/stable/user-guide/resource_hooks/
- bcrypt in Go: https://pkg.go.dev/golang.org/x/crypto/bcrypt

---

## INC-021 – Teardown: destroy in the wrong folder, then a VPC that would not delete

| | |
|---|---|
| **Date** | 2026-10-02 (from ≈ 00:20 IST until the final cleanup) |
| **Where** | Terraform (`terraform/environments/dev`); AWS resources created by Kubernetes controllers (ALB, target groups, security groups) and by the EBS CSI driver (volumes) |
| **Severity** | High (cost) – the platform costs ~$8–10/day while it exists |
| **Status** | Resolved – everything deleted except the S3 state bucket (kept on purpose) |

### Summary
My first `terraform destroy` ran in the wrong folder and destroyed nothing. The second, run without the planned cleanup, deleted the cluster but then failed on the VPC: the ALB that the Load Balancer Controller had created (unknown to Terraform) still held network interfaces in the subnets. I deleted the ALB, its target groups and security groups with the AWS CLI, finished the destroy, and deleted the retained data volumes and the Route 53 zone.

### Background
- **Terraform works on the configuration and state of the current folder.** `terraform/` contains only subfolders; the stack lives in `terraform/environments/dev`.
- **Not everything in AWS was created by Terraform.** The Load Balancer Controller created the ALB, 5 target groups and 2 security groups; the EBS CSI driver created the data volumes. Terraform cannot delete what it does not know about.
- **Normal teardown order:** delete Kubernetes things first (Argo CD Applications, which deletes the Gateway, so the controller deletes the ALB; PVCs, so the CSI driver deletes the disks), *then* `terraform destroy`.
- **`reclaimPolicy: Retain`** (my `ebs-gp3` StorageClass) keeps the EBS disk when its claim is deleted.
- **S3 native state locking:** while Terraform runs, a `terraform.tfstate.tflock` object exists next to the state.
- **AWS dependency errors:** a subnet cannot be deleted while a network interface lives in it; an internet gateway cannot be detached while public IPs are mapped in the VPC.

### Timeline
1. Ran `terraform destroy -auto-approve` in `~/go-stuff/gopher-feed/terraform` → "0 destroyed".
2. Checked AWS: cluster, 3 instances, ALB, NAT, volumes, VPC all present; state in `environments/dev` held 94 resources.
3. Ran `terraform destroy` in `environments/dev` without the cleanup steps.
4. Mid-way: `.tflock` present (still running), node group `DELETING`, and the 3 public IPs belonged to the ALB.
5. After ~20 minutes: `DependencyViolation` on the internet gateway and 3 public subnets.
6. Listed what remained in the VPC: the ALB, 5 target groups, 2 `k8s-*` security groups, 3 ALB network interfaces; Terraform state: IGW, 3 subnets, VPC.
7. Deleted the ALB (and waited), target groups (first attempt `ResourceInUse`, retried), security groups.
8. Re-ran `terraform destroy`: 5 destroyed, state empty.
9. Deleted the 3 data volumes and the Route 53 zone (after removing its ACM CNAME).
10. Final sweep: nothing billable left except the state bucket.

### What happened (symptom)
```
Destroy complete! Resources: 0 destroyed.
```
then, later:
```
│ Error: deleting EC2 Internet Gateway (<igw-id>): detaching EC2 Internet Gateway (<igw-id>) from VPC (<vpc-id>): operation error EC2: DetachInternetGateway, https response error StatusCode: 400, RequestID: <request-id>, api error DependencyViolation: Network <vpc-id> has some mapped public address(es). Please unmap those public address(es) before detaching the gateway.
│ Error: deleting EC2 Subnet (<subnet-id-1>): operation error EC2: DeleteSubnet, https response error StatusCode: 400, RequestID: <request-id>, api error DependencyViolation: The subnet '<subnet-id-1>' has dependencies and cannot be deleted.
│ Error: deleting EC2 Subnet (<subnet-id-2>): … DependencyViolation …
│ Error: deleting EC2 Subnet (<subnet-id-3>): … DependencyViolation …
```

### How we got there
1. Running Terraform from the parent folder.
2. Skipping the Kubernetes-side cleanup, so the controller died with the cluster before it could delete the ALB.

### Why (root cause)
- Part 1: no `.tf` files and no state in `terraform/` → nothing to destroy.
- Part 2: cluster destroyed → Load Balancer Controller gone → its ALB (with ENIs and public IPs in the public subnets) never deleted → subnets and IGW blocked → `DependencyViolation`. Retained volumes outlived the cluster by design.

### Impact
- Extra cost while resources lingered (cluster and nodes for the first wrong attempt; ALB and volumes during cleanup).
- All data in Postgres, Prometheus and Elasticsearch deleted at the end (intended; nothing needed for a rebuild).

### Resolution (step by step)
1. Check what Terraform manages: `terraform state list | wc -l` in `environments/dev`.
2. While destroy runs, check the lock (`aws s3 ls …/dev/`) and node group status.
3. List everything left in the VPC (load balancers, target groups, security groups, ENIs).
4. Delete in dependency order: load balancer → (wait) → security groups → target groups (retry until detached).
5. `terraform destroy` again.
6. Delete retained volumes and the Route 53 zone (records first).
7. Final sweep of billable resources.

### Terminal commands

**Finding it – part 1**
```
laptop$ cd ~/go-stuff/gopher-feed/terraform
laptop$ terraform destroy -auto-approve

No changes. No objects need to be destroyed.

Either you have not created any objects yet or the existing objects were already deleted outside of Terraform.

Destroy complete! Resources: 0 destroyed.

laptop$ aws eks list-clusters --output text
CLUSTERS	go-feed-dev-eks
laptop$ aws ec2 describe-instances --filters Name=instance-state-name,Values=running,pending --query 'Reservations[].Instances[].[InstanceId,InstanceType,Tags[?Key==`Name`]|[0].Value]' --output text
<instance-id-1>	t3.large	go-feed-dev-eks-system
<instance-id-2>	t3.micro	go-feed-dev-bastion
<instance-id-3>	t3.large	go-feed-dev-eks-system
laptop$ aws elbv2 describe-load-balancers --query 'LoadBalancers[].[LoadBalancerName,State.Code]' --output text
k8s-default-gofeedga-c4ee543c1c	active
laptop$ aws ec2 describe-nat-gateways --filter Name=state,Values=available,pending --query 'NatGateways[].[NatGatewayId,VpcId]' --output text
<nat-id>	<vpc-id>
laptop$ aws ec2 describe-volumes --query 'Volumes[].[VolumeId,Size,State,Tags[?Key==`kubernetes.io/created-for/pvc/name`]|[0].Value]' --output text
<vol-id-a>	20	in-use	None
<vol-id-es>	20	in-use	elasticsearch-data-elasticsearch-es-default-0
<vol-id-pg>	10	in-use	data-go-feed-postgres-0
<vol-id-b>	20	in-use	None
<vol-id-prom>	20	in-use	prometheus-kube-prometheus-stack-prometheus-db-prometheus-kube-prometheus-stack-prometheus-0
<vol-id-c>	20	in-use	None
laptop$ cd environments/dev && terraform state list 2>/dev/null | wc -l
94
```

**Finding it – part 2 (destroy in progress)**
```
laptop$ terraform state list | wc -l
51
laptop$ aws s3 ls s3://<state-bucket>/dev/
2026-10-02 00:25:17     118302 terraform.tfstate
2026-10-02 00:23:28        237 terraform.tfstate.tflock
laptop$ aws eks describe-nodegroup --cluster-name go-feed-dev-eks --nodegroup-name <nodegroup> --query 'nodegroup.[status,health.issues[0].message]' --output text
DELETING	None
laptop$ aws ec2 describe-addresses --query 'Addresses[].[PublicIp,NetworkInterfaceId]' --output text | while read ip eni; do echo "$ip -> $(aws ec2 describe-network-interfaces --network-interface-ids $eni --query 'NetworkInterfaces[0].[InterfaceType,Description]' --output text)"; done
<public-ip-1> -> interface	ELB app/k8s-default-gofeedga-c4ee543c1c/<id>
<public-ip-2> -> interface	ELB app/k8s-default-gofeedga-c4ee543c1c/<id>
<public-ip-3> -> interface	ELB app/k8s-default-gofeedga-c4ee543c1c/<id>
```
~20 minutes later:
```
module.platform.module.network.module.vpc.aws_subnet.public[1]: Still destroying... [id=<subnet-id-2>, 20m20s elapsed]
│ Error: deleting EC2 Internet Gateway (<igw-id>): … DependencyViolation: Network <vpc-id> has some mapped public address(es). Please unmap those public address(es) before detaching the gateway.
│ Error: deleting EC2 Subnet (<subnet-id-3>): … DependencyViolation: The subnet '<subnet-id-3>' has dependencies and cannot be deleted.
│ Error: deleting EC2 Subnet (<subnet-id-2>): … DependencyViolation …
│ Error: deleting EC2 Subnet (<subnet-id-1>): … DependencyViolation …
Releasing state lock. This may take a few moments...

laptop$ VPC=<vpc-id>
laptop$ aws elbv2 describe-load-balancers --query "LoadBalancers[?VpcId=='$VPC'].[LoadBalancerName,LoadBalancerArn]" --output text
k8s-default-gofeedga-c4ee543c1c	arn:aws:elasticloadbalancing:us-east-1:<account-id>:loadbalancer/app/k8s-default-gofeedga-c4ee543c1c/<id>
laptop$ aws elbv2 describe-target-groups --query "TargetGroups[?VpcId=='$VPC'].[TargetGroupName]" --output text
k8s-argocd-argocdar-a4943941fa
k8s-default-httpappr-07dfa13343
k8s-default-httpappr-c59118a121
k8s-logging-kibana-2d4fc40dfc
k8s-monitori-grafana-97a8d2e37e
laptop$ aws ec2 describe-security-groups --filters Name=vpc-id,Values=$VPC --query 'SecurityGroups[].[GroupId,GroupName]' --output text
<sg-id-default>	default
<sg-id-alb>	k8s-default-gofeedga-1cdf759078
<sg-id-traffic>	k8s-traffic-gofeeddeveks-0bb15f785a
laptop$ aws ec2 describe-network-interfaces --filters Name=vpc-id,Values=$VPC --query 'NetworkInterfaces[].[NetworkInterfaceId,InterfaceType,Status,Description]' --output text
<eni-1>	interface	in-use	ELB app/k8s-default-gofeedga-c4ee543c1c/<id>
<eni-2>	interface	in-use	ELB app/k8s-default-gofeedga-c4ee543c1c/<id>
<eni-3>	interface	in-use	ELB app/k8s-default-gofeedga-c4ee543c1c/<id>
laptop$ aws eks list-clusters --output text
(empty)
laptop$ terraform -chdir=terraform/environments/dev state list | grep -v "\.data\."
module.platform.module.network.module.vpc.aws_internet_gateway.this[0]
module.platform.module.network.module.vpc.aws_subnet.public[0]
module.platform.module.network.module.vpc.aws_subnet.public[1]
module.platform.module.network.module.vpc.aws_subnet.public[2]
module.platform.module.network.module.vpc.aws_vpc.this[0]
```

**Fixing it**
```
laptop$ LB=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?VpcId=='$VPC'].LoadBalancerArn" --output text)
laptop$ aws elbv2 delete-load-balancer --load-balancer-arn "$LB" && echo "ALB delete requested"
ALB delete requested
laptop$ aws elbv2 wait load-balancers-deleted --load-balancer-arns "$LB" && echo "ALB deleted"
ALB deleted
laptop$ for tg in $(aws elbv2 describe-target-groups --query "TargetGroups[?VpcId=='$VPC'].TargetGroupArn" --output text); do aws elbv2 delete-target-group --target-group-arn "$tg"; done
aws: [ERROR]: An error occurred (ResourceInUse) when calling the DeleteTargetGroup operation: Target group 'arn:aws:elasticloadbalancing:us-east-1:<account-id>:targetgroup/k8s-argocd-argocdar-a4943941fa/<id>' is currently in use by a listener or a rule
… (same for the other 4)
laptop$ for i in $(seq 1 30); do n=$(aws ec2 describe-network-interfaces --filters Name=vpc-id,Values=$VPC --query 'length(NetworkInterfaces)' --output text); [ "$n" = "0" ] && { echo "ENIs released"; break; }; sleep 10; done
ENIs released
laptop$ for sg in <sg-id-alb> <sg-id-traffic>; do aws ec2 delete-security-group --group-id $sg && echo "deleted $sg"; done
{ "Return": true, "GroupId": "<sg-id-alb>" }
deleted <sg-id-alb>
{ "Return": true, "GroupId": "<sg-id-traffic>" }
deleted <sg-id-traffic>
laptop$ aws ec2 describe-network-interfaces --filters Name=vpc-id,Values=$VPC --query 'length(NetworkInterfaces)' --output text; aws ec2 describe-security-groups --filters Name=vpc-id,Values=$VPC --query 'SecurityGroups[].GroupName' --output text
0
default

laptop$ for attempt in 1 2 3 4 5 6; do left=$(aws elbv2 describe-target-groups --query "TargetGroups[?VpcId=='$VPC'].TargetGroupArn" --output text); [ -z "$left" ] && { echo "all target groups deleted"; break; }; for tg in $left; do aws elbv2 delete-target-group --target-group-arn "$tg" 2>/dev/null && echo "deleted $(basename $(dirname $tg))"; done; sleep 15; done
deleted k8s-argocd-argocdar-a4943941fa
deleted k8s-default-httpappr-07dfa13343
deleted k8s-default-httpappr-c59118a121
deleted k8s-logging-kibana-2d4fc40dfc
deleted k8s-monitori-grafana-97a8d2e37e
all target groups deleted

laptop$ cd terraform/environments/dev && terraform destroy -auto-approve -no-color 2>&1 | grep -E "Destroying|Destruction complete|Error|Destroy complete|Plan:"
Plan: 0 to add, 0 to change, 5 to destroy.
module.platform.module.network.module.vpc.aws_internet_gateway.this[0]: Destroying... [id=<igw-id>]
module.platform.module.network.module.vpc.aws_subnet.public[1]: Destroying... [id=<subnet-id-2>]
module.platform.module.network.module.vpc.aws_subnet.public[2]: Destroying... [id=<subnet-id-3>]
module.platform.module.network.module.vpc.aws_subnet.public[0]: Destroying... [id=<subnet-id-1>]
module.platform.module.network.module.vpc.aws_subnet.public[0]: Destruction complete after 2s
module.platform.module.network.module.vpc.aws_subnet.public[2]: Destruction complete after 2s
module.platform.module.network.module.vpc.aws_subnet.public[1]: Destruction complete after 2s
module.platform.module.network.module.vpc.aws_internet_gateway.this[0]: Destruction complete after 2s
module.platform.module.network.module.vpc.aws_vpc.this[0]: Destroying... [id=<vpc-id>]
module.platform.module.network.module.vpc.aws_vpc.this[0]: Destruction complete after 1s
Destroy complete! Resources: 5 destroyed.
laptop$ terraform state list 2>/dev/null | grep -vc '\.data\.'
0

laptop$ for v in <vol-id-es> <vol-id-pg> <vol-id-prom>; do aws ec2 delete-volume --volume-id $v && echo "deleted $v"; done
deleted <vol-id-es>
deleted <vol-id-pg>
deleted <vol-id-prom>
laptop$ aws route53 list-resource-record-sets --hosted-zone-id <zone-id> --output json | python3 -c '…build DELETE changes for every record except NS/SOA…' > r53.json
1 record(s) to remove
laptop$ aws route53 change-resource-record-sets --hosted-zone-id <zone-id> --change-batch file://r53.json --query 'ChangeInfo.Status' --output text
PENDING
laptop$ aws route53 delete-hosted-zone --id <zone-id> --query 'ChangeInfo.Status' --output text && echo "zone deleted"
PENDING
zone deleted
```
(`-auto-approve` here was safe only because I had just read the 5-resource plan in the failed run.)

**Verifying**
```
laptop$ echo "EKS: $(aws eks list-clusters --query 'clusters' --output text)"; echo "EC2 running: …"; echo "ALBs: …"; echo "NAT: …"; echo "EIPs: …"; echo "VPCs (non-default): …"
EKS:
EC2 running:
ALBs:
NAT:
EIPs:
VPCs (non-default):
== EBS volumes:
(none)
== KMS keys pending deletion / enabled (customer):
CUSTOMER	PendingDeletion	go-feed-dev-eks cluster encryption key
== CloudWatch log groups:
(none)
== Route53 zones:
(none)
== ACM:
<my-domain>.eu.org	PENDING_VALIDATION        (free; expire on their own)
<my-domain>.eu.org	PENDING_VALIDATION
== S3 state bucket:
2026-09-29 10:19:12 <state-bucket>            (kept on purpose)
```

### Code / config change
None in this incident. The correct teardown order is documented in `docs/SETUP_GUIDE.md` §12 (commit `f472720`).

### Lessons learned
- Run Terraform from the folder that holds the stack; `terraform state list | wc -l` shows what it manages.
- **Destroy in reverse order of creation**: what controllers created must be removed while the controllers still run.
- Retained volumes outlive clusters (and keep billing).
- "Destroy complete" with 0 resources is a warning sign, not a success.

### How to approach it next time
1. Before destroying: `terraform state list | wc -l` in the stack folder.
2. On the bastion: switch PVs to `Delete`, delete the Argo CD Applications (Gateway → ALB goes), delete PVCs, wait for `kubectl get pv` and `kubectl get gateway -A` to be empty.
3. Check AWS for `k8s-*` load balancers, target groups, security groups and `available` volumes.
4. `terraform destroy` (read the plan; no `-auto-approve`).
5. If a VPC delete fails with `DependencyViolation`: list ENIs in the VPC (`describe-network-interfaces`); their `Description` names the owner.

### Prevention / follow-up
- The teardown checklist is in the setup guide.
- Optional: a script `scripts/teardown.sh` that runs the Kubernetes-side cleanup and the AWS checks before Terraform. `# suggested, not run`

### References
- `terraform destroy`: https://developer.hashicorp.com/terraform/cli/commands/destroy
- Terraform S3 backend locking: https://developer.hashicorp.com/terraform/language/backend/s3
- PV reclaim policy: https://kubernetes.io/docs/concepts/storage/persistent-volumes/#reclaiming
- Internet gateways: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
- Deleting a subnet (dependencies): https://docs.aws.amazon.com/vpc/latest/userguide/subnet-deleting.html

---

## Patterns across all incidents

| Pattern | Incidents | What to do instead |
|---|---|---|
| **Laptop config leaked into the cluster** (`localhost` in Vault or as a code default) | INC-007, INC-012, INC-018 | Topology (hosts, ports, URLs) lives in the Helm chart; Vault only holds real secrets; refuse `localhost` in production config |
| **Hand-installed or hand-applied things drifted** | INC-004, INC-005, INC-010, INC-021 | Everything in Git, applied by Argo CD or Terraform; one source per workload |
| **Misleading signals** (wrong status code, "0 destroyed", "not reachable") | INC-010, INC-018, INC-021 | Never trust the summary; check the layer below |
| **Untested code paths** | INC-001, INC-002, INC-020 | `go vet`, race tests and tests for every tool (seeder included) in CI |
| **Timing, not failure** | INC-006, INC-015, INC-016, INC-017 | Know what "still starting" looks like; check the layer below before changing anything |

### Debugging checklist

1. Write down the exact symptom and where it came from (browser, `curl`, Slack, CI).
2. Find out **who answered**: body, size and headers identify nginx vs Go vs the ALB.
3. Reproduce without the UI (`curl` with the same headers and token).
4. Go one layer down at a time:
   - Argo CD Application: `sync.status`, `health.status`, `operationState.message`
   - Deployment → **ReplicaSet events** (0 pods) → pod events → pod logs (`--previous` for crashes)
   - Controller logs (they say why a controller does not converge)
   - AWS: `describe-rules`, `describe-target-health`, IAM policy versions
5. Test one suspect at a time; prove it innocent before moving on.
6. Compare with the source of truth: the official IAM policy for the exact version, the chart's `values.yaml`, the CRD schema.
7. Fix in Git, render locally (`kubectl kustomize --enable-helm deploy/app`, `helm template`), push.
8. Verify from the outside and keep the output.

### Commands used most

```
# Argo CD
bastion$ kubectl get application <app> -n argocd -o jsonpath='{.status.sync.status} / {.status.health.status} / {.status.operationState.phase}: {.status.operationState.message}{"\n"}'
bastion$ kubectl annotate application <app> -n argocd argocd.argoproj.io/refresh=normal --overwrite
bastion$ kubectl patch application <app> -n argocd --type json -p '[{"op":"remove","path":"/operation"}]'
bastion$ kubectl patch application <app> -n argocd --type merge -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{"revision":"HEAD"}}}'

# Workloads
bastion$ kubectl describe rs -n <ns> -l <selector> | tail -15
bastion$ kubectl logs -n <ns> deploy/<name> --tail=40 [--previous] [-c <container>]
bastion$ kubectl rollout restart deploy/<name> -n <ns>

# Gateway and ALB
bastion$ kubectl get gateway <gw> -n default -o jsonpath='{range .status.listeners[*]}{.name} attachedRoutes={.attachedRoutes}{"\n"}{end}'
laptop$  aws elbv2 describe-rules --listener-arn <arn> --output text
laptop$  aws elbv2 describe-target-health --target-group-arn <arn>

# Outside-in
laptop$  curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://<alb-hostname>/<path>
```

### Still open

- [ ] Rate limiter: real client IP from `X-Forwarded-For` behind the ALB (INC-002)
- [ ] Do not return the activation token from `/register` (INC-012)
- [ ] Return 500 (not 401) for infrastructure errors; fall back to Postgres when Redis fails (INC-018)
- [ ] `preStop` sleep for zero-error rollouts (INC-019)
- [ ] Load Balancer Controller and other add-ons managed from Git (INC-004)
- [ ] Real domain + HTTPS (INC-011)
- [ ] Postgres backups (INC-007)
