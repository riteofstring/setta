# Setta v3 Architecture Recommendations, Part 2

Continues [Setta v3 Architecture Recommendations](setta-v3-architecture-recommendations.md).

---

## 14. Scaling and cost model

The business metric should be:

```text
active Cloud Box hours
```

not:

```text
total users
total projects
total Machines ever created
```

### Provisioning model

Do not pre-create a machine for every user/project.

Use:

```text
Hot pool
  a small number of already-running boxes for demos/onboarding

Warm pool
  pre-created apps/machines, usually stopped or recently suspended

Cold state
  no machine allocated; project exists as Git/R2 snapshot only
```

Provision for peak concurrency:

```text
10,000 registered users
2,000 monthly active users
300 peak active Cloud Boxes
50 warm spare boxes
```

This is a 350-Cloud-Box planning problem, not a 10,000-machine planning problem.

### Plan-based limits

```text
Free
  local only or tiny cloud trial

Starter
  1 active Cloud Box
  small resource class
  aggressive autosleep
  limited active hours

Pro
  2 active Cloud Boxes
  more active hours
  medium bursts
  better snapshots/checkpoints

Team
  pooled active boxes and hours
  roles/permissions
  larger quotas

Add-ons
  extra active hours
  large boxes
  GPU
  macOS/iOS builds
  long-running jobs
```

### Resource classes

```text
Small
  2 shared CPU / 4 GB RAM
  light JS/Python/Go projects, previews, prompts

Build
  2 performance CPU / 4 GB RAM
  heavier installs/compiles

Medium
  4 CPU / 8 GB RAM
  larger projects, mobile prototypes, heavier Python

Large
  8 CPU / 16 GB RAM
  paid add-on only

GPU
  paid/metered add-on later

macOS
  paid/metered add-on later for native iOS/Swift/Xcode
```

### Idle policy

```text
Interactive Cloud Box
  sleep/suspend after 10-20 minutes idle

Recent Cloud Box
  stop after 1-2 hours idle

Inactive workspace
  snapshot/archive after 7-30 days

Large/performance boxes
  stop faster; do not suspend indefinitely
```

---

## 15. Security model

### Non-negotiables

```text
No phone-to-laptop control by default.
No public preview URLs by default.
No global unauthenticated WebSockets.
No master provider tokens inside Cloud Boxes.
No shared filesystem across users.
No Docker socket inside untrusted Cloud Boxes.
No unlimited cloud execution.
No destructive admin routes without explicit authorization.
```

### Event security

Every event has:

```text
scope_type
scope_id
sequence
actor_user_id where applicable
authorization check before delivery
```

WebSocket/SSE clients subscribe to explicit channels:

```text
project:<id>
workspace:<id>
agent_session:<id>
workflow_run:<id>
```

### Workspace security

Each Cloud Box should receive only project-scoped credentials:

- Short-lived Setta box token.
- Scoped artifact storage credentials or signed URLs.
- Project-specific Git credentials, if needed.
- Project-specific model/tool tokens, if absolutely needed.

The control plane owns provider credentials.

### AI tool permissions

Agent sessions should have a policy object:

```json
{
  "can_read_files": true,
  "can_write_files": true,
  "can_run_commands": "with_approval",
  "can_install_packages": "with_approval",
  "can_use_network": true,
  "can_access_secrets": false,
  "max_cloud_box_minutes": 60,
  "max_model_spend_cents": 200
}
```

---

## 16. Package layout for a Go implementation

Suggested backend layout:

```text
/cmd/setta
  main.go

/internal/api
  http routes, middleware, request/response DTOs

/internal/auth
  Clerk verifier, auth adapter, policy checks

/internal/projects
  project domain logic

/internal/workspaces
  local/cloud workspace state, lifecycle commands

/internal/cloudbox
  provider-agnostic Cloud Box orchestration

/internal/cloudbox/providers/fly
  Fly Machines implementation

/internal/agents
  agent sessions, model/tool orchestration

/internal/workflows
  durable workflow/job execution

/internal/tools
  tool registry and permissions

/internal/events
  event store, publisher, scoped subscriptions

/internal/realtime
  WebSocket/SSE gateway

/internal/preview
  preview router, port mapping, auth

/internal/artifacts
  R2/S3 artifact store

/internal/usage
  active time, storage, model usage, plan quotas

/internal/billing
  Stripe integration later

/internal/db
  queries, migrations, transaction helpers

/internal/config
  env/config loading

/internal/logging
  structured logging helpers
```

### Interfaces to define early

```go
type AuthVerifier interface {
    VerifyRequest(ctx context.Context, r *http.Request) (Principal, error)
}

type PolicyChecker interface {
    CanAccessProject(ctx context.Context, principal Principal, projectID string, action Action) error
}

type ArtifactStore interface {
    Put(ctx context.Context, ref ArtifactWriteRef, body io.Reader) (ArtifactRef, error)
    Get(ctx context.Context, ref ArtifactRef) (io.ReadCloser, error)
    SignURL(ctx context.Context, ref ArtifactRef, ttl time.Duration) (string, error)
}

type EventPublisher interface {
    Publish(ctx context.Context, event DomainEvent) error
}

type CloudBoxProvider interface {
    CreateBox(ctx context.Context, input CreateBoxInput) (BoxRef, error)
    StartBox(ctx context.Context, ref BoxRef) error
    StopBox(ctx context.Context, ref BoxRef) error
    State(ctx context.Context, ref BoxRef) (BoxState, error)
}

type JobRunner interface {
    Enqueue(ctx context.Context, job Job) (JobID, error)
}
```

---

## 17. Frontend architecture

### Current Electron app

Keep the Electron app, but separate the frontend into:

```text
ui-core
  shared React components, state machines, API clients, event client

electron-shell
  filesystem/process/local workspace bridge, native menus, desktop browser shell

web-shell
  browser app for account/project/cloud workspace access

mobile-shell
  future phone wrapper or React Native app
```

### Avoid one giant component

The older prototype concentrated dashboard fetching, WebSocket handling, retries, progress state, notifications, sorting, selection, and actions in one component. Avoid repeating that.

Recommended frontend modules:

```text
apiClient
  typed REST/RPC client

eventClient
  scoped WebSocket/SSE client

useProjects
useWorkspaces
useWorkspaceRun
useAgentSession
useWorkflowRun
usePreviewPorts
useCloudBoxActions

CommandPalette
AgentPanel
FilesPanel
TerminalPanel
PreviewBrowser
WorkflowPanel
EventsTimeline
```

### Mobile surface

For the first phone app, do not try to deliver a full IDE.

Phone should support:

- Create project.
- Start/resume Cloud Box.
- Prompt/steer agent.
- Approve/deny actions.
- Watch progress/logs.
- View diffs.
- Open preview browser.
- Stop/sleep Cloud Box.

Phone should not initially support:

- Full file tree editing.
- Complex terminal workflows.
- Native iOS/Android builds.
- Full desktop parity.

---

## 18. Provider strategy

### V1: Fly first, with adapter seam

Use Fly first because:

- You already have prototype experience.
- Machines are API-addressable.
- Machines are isolated microVMs.
- Fly has explicit docs for per-user dev environments.
- Fly routing with `fly-replay` maps well to preview routing.
- Stopped/suspended Machines can reduce runtime cost.

But validate before committing:

- Organization Machine limits.
- App-count limits.
- Creation latency.
- Start/stop/suspend latency.
- Volume behavior.
- Regional capacity.
- API rate limits.
- Cost at target concurrency.
- Support plan requirements.

### Fallback/evaluation providers

| Provider | Why evaluate | Concern |
|---|---|---|
| Railway Sandboxes | Could be faster to integrate for interactive sandbox behavior | Pricing/control/isolation details must be validated. |
| Northflank Sandboxes | Potentially strong cost profile and microVM isolation | May require more Setta-owned devbox UX. |
| Freestyle VMs | Strong "real VM" semantics and fast pause/resume claims | Need pricing and scalability validation. |
| E2B / Daytona | Strong AI-agent sandbox APIs | May be more expensive or less full-devbox-oriented. |
| Cloudflare Sandboxes | Attractive for lightweight code execution | Resource limits may be too small for general dev environments. |

### Do not expose provider choice in the UI early

Users should choose:

```text
Small Cloud Box
Medium Cloud Box
Build Cloud Box
```

not:

```text
Fly vs Railway vs Northflank vs Freestyle
```

Setta should choose the provider behind the scenes.

---

## 19. Deployment future-proofing

Deployment is not v3 MVP, but the model should support it later.

The key is to store these project/workspace facts now:

```text
language / framework detection
install command
build command
dev command
test command
ports
environment variables
secrets schema
resource class
artifact snapshots
workspace snapshots
runtime command
health checks
```

Later, deployment adapters can consume this metadata:

```text
Cloudflare adapter
Fly app deployment adapter
Railway deployment adapter
AWS BYO adapter
RunPod/Vast GPU adapter
```

Do not build deployment now, but do name your abstractions so they are not dead ends:

```text
Project
Workspace
Artifact
RuntimeSpec
EnvironmentSpec
ProviderRef
ResourceClass
```

Avoid v1-only names like:

```text
PythonDeployment
FlyProjectStatus
AppPyRuntime
RequirementsTxtSource
```

---

## 20. MVP scope recommendation

### MVP should include

```text
Electron app with Setta account login
Project list and project creation
Local workspace mode inside Electron
Cloud Box start/stop/sleep through Fly
Setta Box Agent inside Cloud Box
Terminal panel
Agent/chat panel
Event timeline
File/diff view
Integrated preview browser
Port detection
Git/R2 checkpointing
Postgres-backed jobs
Scoped realtime events
Usage tracking for active Cloud Box time
```

### MVP should not include

```text
Production deployment
AWS account connection
Native iOS/Swift builds
GPU workloads
BYO cloud
Tailscale/VPN integration
Phone-to-laptop control
Full mobile IDE
Terraform-driven provisioning
Multi-provider automatic scheduling
Unlimited cloud plans
```

---

## 21. First 30-60 day implementation plan

### Week 1-2: Core model and service skeleton

- Define Go module/package layout.
- Add Postgres migrations.
- Add Clerk auth adapter.
- Add project/workspace/workspace_run schema.
- Add scoped event table.
- Add Postgres-backed job table.
- Implement basic API skeleton.

### Week 2-4: Cloud Box prototype on Fly

- Implement `CloudBoxProvider` interface.
- Implement Fly provider adapter.
- Build first Setta Cloud Box image.
- Run Setta Box Agent inside Machine.
- Start/stop a Cloud Box through durable jobs.
- Store provider IDs immediately.
- Add reconciliation job.
- Add workspace status transitions.

### Week 4-6: UI integration

- Connect Electron app to v3 API.
- Add workspace status UI.
- Add terminal panel.
- Add events timeline.
- Add preview browser panel.
- Add start/stop/sleep buttons.
- Add basic agent session record.

### Week 6-8: AI orchestration and checkpoints

- Add model provider abstraction.
- Add agent sessions.
- Add tool registry: file read/write, run command, start dev server, inspect preview.
- Add human approval gate.
- Add workspace checkpoint artifact.
- Add active-time usage records.
- Add autosleep worker.

### After MVP

- Mobile companion app.
- Provider comparison tests.
- Stripe billing/credits.
- Better snapshots and dependency caches.
- Railway/Northflank/Freestyle provider adapter experiment.
- Deployment adapters.

---

## 22. Key decisions to make now

### Product decisions

1. Is phone v1 a full app, PWA, Capacitor wrapper, or React Native app?
2. Is Cloud Box included in every paid plan or sold as credits?
3. How much local development does v3 need on day one?
4. What is the minimum viable agent workflow?
5. What file sync/checkpoint behavior is acceptable for beta?

### Technical decisions

1. Fly app boundary: project workspace vs user/team.
2. R2 vs another object store.
3. Postgres job table vs external workflow system.
4. WebSocket vs SSE vs both.
5. Box Agent protocol: WebSocket, gRPC, or HTTP polling first.
6. Terminal protocol and log retention.
7. How to package local runner + Cloud Box agent code.
8. Which language/frameworks are first-class for early detection.

### Business decisions

1. Active Cloud Box hours per plan.
2. Whether LLM usage is included or separately metered.
3. Whether Cloud Box resource class upgrades are credit-based.
4. Idle timeout strictness.
5. Abuse policy and automatic suspension thresholds.

---

## 23. Recommendation summary

The recommended path is:

```text
1. Keep Electron, but refactor toward a shared UI core.
2. Build a Go control plane with Postgres-backed durable jobs.
3. Make AI orchestration the core domain model.
4. Treat local workspaces and Cloud Boxes as two implementations of the same Workspace interface.
5. Use Fly Machines first for Cloud Boxes because of prior prototype experience.
6. Use one active Machine per active project workspace.
7. Use Git/R2 snapshots as durable project state; use volumes only as active cache.
8. Build Setta Box Agent for terminal/files/ports/events inside Cloud Boxes.
9. Use scoped realtime events from day one.
10. Keep deployment as a future adapter, not an MVP feature.
```

The most important mindset shift:

```text
Setta v3 is not a deployment control panel.
Setta v3 is an AI orchestration environment that can materialize workspaces where agents and users can do real work.
```

---

## 24. References and source notes

### Internal source

- `codex-saas-analysis.md`, uploaded analysis dated 2026-06-29. Used as historical architecture input and lessons-learned source for the old SaaS prototype.

### External references consulted

- Fly.io, "Per-User Dev Environments with Fly Machines": https://fly.io/docs/blueprints/per-user-dev-environments/
- Fly.io, "Connecting to User Machines": https://fly.io/docs/blueprints/connecting-to-user-machines/
- Fly.io, "One App Per Customer - Why?": https://fly.io/docs/machines/guides-examples/one-app-per-user-why/
- Fly.io, "Machine Suspend and Resume": https://fly.io/docs/reference/suspend-resume/
- Fly.io, "Dynamic Request Routing with fly-replay": https://fly.io/docs/networking/dynamic-request-routing/
- Fly.io, "Resource Pricing": https://fly.io/docs/about/pricing/
- Clerk, "Session tokens": https://clerk.com/docs/guides/sessions/session-tokens
- Clerk, "Verify a Clerk session in Go": https://clerk.com/docs/guides/sessions/verifying
- Clerk, "Manual JWT verification": https://clerk.com/docs/guides/sessions/manual-jwt-verification
- Electron documentation: https://electronjs.org/docs/latest/
- Capacitor documentation: https://capacitorjs.com/
- Expo documentation: https://docs.expo.dev/
- React Native documentation: https://reactnative.dev/
