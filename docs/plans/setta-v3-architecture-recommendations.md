# Setta v3 Architecture Recommendations

**Date:** 2026-06-29  
**Audience:** Setta founding/engineering team  
**Document type:** Architecture and product-technical recommendation  
**Status:** Working recommendation for next implementation phase

---

## 1. Executive recommendation

Setta v3 should be architected as an **AI orchestration system with workspace execution**, not as a deployment platform, Python-node UI, or cloud-hosting wrapper.

The recommended v3 shape is:

```text
Setta Electron App / Web App / Future Mobile App
        ↓
Setta Control Plane
        ↓
AI Orchestration + Workflow Engine
        ↓
Workspace Layer
   ├─ Local workspace on desktop
   └─ Cloud Box workspace when remote/cloud execution is needed
        ↓
Preview / Terminal / Files / Agent Events / Integrated Browser
```

Deployment should remain a **future adapter**. The architecture should preserve the ability to later deploy to Cloudflare, Fly, Railway, AWS, RunPod, etc., but the v3 MVP should focus on:

- AI orchestration.
- Workflow/session state.
- Local and cloud workspaces.
- Integrated preview browser.
- Project sync/checkpointing.
- Durable agent execution.
- Secure, scoped realtime events.
- Cost-controlled Cloud Boxes.

The strongest practical recommendation is:

```text
Build the v3 backend/control plane in Go.
Use Postgres as the source of truth.
Use Clerk for auth initially.
Use Fly Machines as the first serious Cloud Box backend candidate.
Keep Cloud Box providers behind an adapter interface.
Use R2/S3-compatible object storage for snapshots, artifacts, logs, and backups.
Keep deployment out of the MVP, but model projects/artifacts so deployment can come later.
```

The uploaded Setta SaaS memo should be treated as historical evidence, not a template. Its useful lesson is the **control-plane/workload-plane split**. Its risky lesson is that long-running orchestration, WebSocket broadcasts, log streaming, runtime state, and provider cleanup should not live inside a single web process.

---

## 2. What Setta v3 is and is not

### Setta v3 is

```text
An AI orchestration and development workspace system.
```

It should help users:

- Create or open projects.
- Use AI agents against real files and workflows.
- Run workflows made of model calls, tools, human approvals, local/cloud commands, and UI actions.
- Develop locally when on desktop.
- Start a Cloud Box when they want cloud execution from desktop, browser, or phone.
- See the result through Setta's integrated browser or preview panel.
- Maintain project/session/workflow history.
- Sync/checkpoint work between local and cloud contexts.

### Setta v3 is not

```text
A direct continuation of Setta v1/v2.
```

Setta v2's concept of exposing Python functions as UI nodes was a different product. Some workflow concepts can survive, but the v3 product center is not "Python functions as nodes." It is:

```text
AI sessions + workflows + project workspaces + previewable results.
```

Setta v3 should also not start as:

- A production deployment platform.
- An AWS wrapper.
- A general cloud IDE clone.
- A phone-to-laptop remote-control system.
- A Terraform product.
- A Docker/Fly/Railway UI wrapper.

Those may become adjacent capabilities later, but they should not define v3.

---

## 3. Lessons from the prior SaaS prototype

The prior SaaS prototype had the right top-level split:

```text
Control plane
  manages records, auth, provider APIs, logs, events

Workload plane
  runs user code separately in Fly machines
```

This is still the right category of architecture for v3. User/agent code should run in a workload environment, not inside the Setta API server.

However, the old prototype should not be copied as-is. The major issues to avoid are:

- In-process background tasks as the source of truth.
- Global unauthenticated WebSocket broadcasts.
- In-process `fly logs` subprocesses tied to the API web server.
- One service object owning CRUD, machine state, deployment, logs, storage cleanup, and broadcasts.
- A single `projects.status` field trying to represent project, runtime, deployment, and machine states.
- Provider-specific behavior leaking into the core state model.
- Python-specific runtime assumptions such as `requirements.txt`, `app.py`, `main.py`, and `pip`.
- Manual/ad hoc migrations.
- R2/source sync and dependency installation happening on every runtime startup.

For Setta v3, the corrected version is:

```text
Durable workflows / jobs
Explicit state machines
Scoped event streams
Provider adapters
Workspace-first model
Language-agnostic runtime detection
Cloud Box lifecycle management
Object storage for durable snapshots/artifacts
Volumes/caches for active workspace speed
```

---

## 4. Product architecture overview

### Recommended high-level system

```mermaid
flowchart LR
    Desktop[Setta Electron App] --> API[Setta API]
    Web[Setta Web App] --> API
    Mobile[Future Phone App] --> API

    Desktop --> Local[Local Workspace Runner]

    API --> DB[(Postgres)]
    API --> Auth[Clerk / Auth Adapter]
    API --> Jobs[Durable Jobs / Workflow Worker]
    API --> RT[Realtime Gateway]

    Jobs --> Orchestrator[AI + Workspace Orchestrator]
    Orchestrator --> Providers[Cloud Box Provider Adapter]
    Providers --> Fly[Fly Machines]
    Providers --> Alt[Railway / Northflank / Freestyle / E2B later]

    Orchestrator --> Store[R2 / S3 Artifact Store]
    RT --> Events[(Event Store)]

    Fly --> Box[Setta Cloud Box]
    Box --> Agent[Setta Box Agent]
    Box --> Preview[Dev Server Ports]

    Preview --> Router[Setta Preview Router]
    Router --> Browser[Integrated Browser]
```

### Core runtime modes

Setta v3 should have two development runtime modes:

```text
Local Mode
  Runs on the user's desktop machine through Electron/local process control.
  No phone-to-laptop control by default.

Cloud Box Mode
  Runs in an isolated cloud workspace.
  Desktop, web, and phone control the Cloud Box through Setta.
```

Local Mode is for low cost and fast desktop use. Cloud Box Mode is for:

- Phone-created projects.
- Laptop unavailable/offline.
- Stronger isolation.
- Cloud execution.
- Multi-device continuation.
- Heavier builds than the user's machine can handle.
- Long-running agent tasks.

---

## 5. Recommended v3 stack

### Client applications

| Surface | Recommendation | Notes |
|---|---|---|
| Desktop | Keep Electron for now | Already exists; gives local filesystem/process access. |
| Web | Keep a web-compatible UI core | Useful for account/project access and future mobile wrapper. |
| Mobile MVP | Start with responsive web/PWA or Capacitor-style wrapper | Fastest path for a two-person team if the phone mainly controls cloud workspaces. |
| Mobile long-term | Consider React Native + Expo | Better native app path if mobile becomes a major product surface. |

Electron is appropriate for the current desktop app because it embeds Chromium and Node.js to build cross-platform desktop apps with JavaScript, HTML, and CSS. Capacitor is the quickest bridge if you want a web UI to become a basic iOS/Android/PWA app. Expo/React Native is stronger if the phone app becomes more native and interaction-heavy.

### Control plane

Use Go for the v3 backend/control plane.

Recommended Go services:

```text
setta-api
  HTTP API, auth, project/session/workspace commands

setta-worker
  durable jobs, workflow steps, Cloud Box lifecycle, snapshots, cleanup

setta-realtime
  WebSocket/SSE event gateway, scoped subscriptions

setta-router
  preview proxy, authenticated dev-server routing
```

For a two-person team, these can initially be one Go binary with multiple run modes:

```bash
setta serve api
setta serve worker
setta serve realtime
setta serve router
```

or one deployable service with internal packages, as long as durable background work is persisted and resumable.

### Data and state

Use:

```text
Postgres
  source of truth for users, projects, sessions, workflow runs, workspaces, events, usage, provider refs

R2 / S3-compatible storage
  snapshots, source bundles, artifacts, logs, file exports, backups

Fly Volumes or provider-local disks
  fast active workspace state only
```

Do not rely on Fly volumes or any provider-local disk as the only durable copy of a project.

### Auth

Keep Clerk for v1 unless you have a strong reason to switch. Use it for:

- User identity.
- Organizations/teams.
- Session tokens.
- Basic account lifecycle.

But Setta should own authorization:

```text
Clerk says who the user is.
Setta DB says which projects, workspaces, runs, events, and Cloud Boxes they can access.
```

---

## 6. Core domain model

The old model used `projects` as the main durable entity. Setta v3 needs a richer model.

### Recommended entities

```text
User
  external auth identity, e.g. Clerk user ID

Organization
  team/account boundary

Project
  durable user-facing project container

Workspace
  a development context for a project: local or cloud

WorkspaceRun
  one active/resumable execution of a workspace

CloudBoxInstance
  provider-specific cloud runtime record

AgentSession
  one AI conversation/task session against a project/workspace

Workflow
  reusable workflow definition

WorkflowRun
  one execution of a workflow

WorkflowStepRun
  one step execution: model call, command, tool call, approval, file edit, preview check, etc.

ToolInvocation
  typed record of tool usage

Artifact
  source snapshot, workspace snapshot, build artifact, uploaded file bundle, generated output

PreviewPort
  dev server port and access policy

Event
  scoped event stream for UI/realtime

UsageRecord
  active Cloud Box seconds, model usage, storage, workflow steps, build minutes
```

### Minimal schema sketch

```sql
users (
  id,
  clerk_user_id,
  created_at
)

organizations (
  id,
  clerk_org_id,
  name,
  plan,
  created_at
)

projects (
  id,
  org_id,
  owner_user_id,
  name,
  description,
  visibility,
  created_at,
  updated_at,
  archived_at
)

project_members (
  project_id,
  user_id,
  role
)

workspaces (
  id,
  project_id,
  mode, -- local | cloud
  source_ref,
  branch,
  status,
  default_resource_class,
  created_at,
  updated_at
)

workspace_runs (
  id,
  workspace_id,
  status, -- queued | starting | running | sleeping | stopped | failed | archived
  started_by_user_id,
  active_since,
  last_active_at,
  stopped_at,
  error
)

cloud_box_instances (
  id,
  workspace_run_id,
  provider, -- fly | railway | northflank | freestyle | e2b
  provider_app_id,
  provider_machine_id,
  provider_volume_id,
  region,
  resource_class,
  state,
  created_at,
  updated_at
)

agent_sessions (
  id,
  project_id,
  workspace_id,
  created_by_user_id,
  status,
  title,
  model_policy,
  created_at,
  updated_at
)

workflow_runs (
  id,
  project_id,
  agent_session_id,
  status,
  started_by_user_id,
  started_at,
  finished_at,
  error
)

workflow_step_runs (
  id,
  workflow_run_id,
  step_type,
  status,
  input_json,
  output_json,
  started_at,
  finished_at,
  error
)

artifacts (
  id,
  project_id,
  workspace_id,
  kind, -- source_snapshot | workspace_snapshot | generated_file | build_artifact | log_export
  storage_uri,
  checksum,
  metadata_json,
  created_at
)

preview_ports (
  id,
  workspace_run_id,
  port,
  protocol,
  label,
  access_policy,
  last_seen_at
)

events (
  id,
  scope_type, -- project | workspace | agent_session | workflow_run
  scope_id,
  sequence,
  type,
  payload_json,
  created_at
)

usage_records (
  id,
  org_id,
  user_id,
  project_id,
  resource_type,
  quantity,
  unit,
  period_start,
  period_end
)
```

---

## 7. AI orchestration model

Setta v3's core should be AI orchestration. Treat the AI layer as first-class rather than bolting it onto a devbox product.

### AI orchestration primitives

```text
AgentSession
  conversational/task context

Run
  durable execution of an agent action or workflow

Step
  a model call, tool call, command, file edit, test run, preview check, or approval

Tool
  typed capability exposed to agents

Policy
  permissions and limits for what a session/run can do

Event
  observable state transition for UI

Artifact
  durable output from a run or step
```

### Core tools in v3

Setta should expose a small set of tools to AI sessions:

```text
read_file
write_file
list_files
search_files
run_command
start_dev_server
stop_process
list_processes
open_preview
inspect_preview
create_checkpoint
restore_checkpoint
ask_user_approval
invoke_workflow
```

Later tools can include:

```text
deploy_preview
connect_database
run_browser_automation
create_mobile_build
open_pull_request
connect_github_issue
```

### Human approval boundaries

Require approval for:

- Installing large dependencies.
- Running destructive commands.
- Touching secrets.
- Spending significant Cloud Box time.
- Scaling to larger resource classes.
- Making network calls to sensitive destinations.
- Deleting files or resetting branches.
- Publishing/deploying anything publicly.

---

## 8. Workflow system recommendation

Do not overbuild the workflow engine in the first version. But do make runs durable.

### v1 workflow engine

Use:

```text
Postgres-backed jobs
+ worker leases
+ retry/backoff
+ step records
+ idempotency keys
+ event emission
```

This is enough for:

- Start Cloud Box.
- Stop/sleep Cloud Box.
- Snapshot workspace.
- Restore workspace.
- Run agent step.
- Run command step.
- Stream logs/events.
- Reconcile provider state.
- Cleanup orphaned resources.

### Do not start with

```text
Temporal / Cadence / Airflow / custom DAG engine
```

unless you already know the workflow complexity demands it. Temporal can be added later if workflows become long-lived, highly concurrent, and hard to recover with a Postgres job table.

### Workflow/job table sketch

```sql
jobs (
  id,
  type,
  status,
  priority,
  idempotency_key,
  input_json,
  output_json,
  error,
  run_after,
  attempts,
  max_attempts,
  locked_by,
  locked_until,
  created_at,
  updated_at
)
```

Each job should emit events:

```text
workspace.start.queued
workspace.start.provisioning
workspace.start.hydrating
workspace.start.ready
workspace.start.failed
```

---

## 9. Cloud Box architecture

A **Cloud Box** is a development workspace runtime. It is not a production deployment.

Definition:

```text
A Cloud Box is a temporary, isolated cloud computer that Setta can start, stop, sleep, snapshot, resize, and expose through the Setta UI.
```

A Cloud Box should contain:

- Project files.
- Git.
- Language runtimes/toolchains.
- Terminal/process execution.
- Setta Box Agent.
- File watcher.
- Port detector.
- Dev server processes.
- Preview routing.
- Workspace cache/volume.

### Recommended v1 provider: Fly Machines

Because you already prototyped with Fly Machines, Fly should be the first serious Cloud Box backend candidate. The v3 architecture should not depend on Fly permanently, but Fly is credible for v1 if you build the scheduler/control plane correctly.

Recommended mapping:

```text
Setta Project / Workspace
  → Fly App boundary where possible
      → one active Fly Machine while the Cloud Box is running
      → optional Fly Volume mounted at /workspace
```

Default rule:

```text
One active project workspace = one active Fly Machine.
```

Do not create one permanent Machine per user or per project. Create/keep Machines only for active or recently active Cloud Boxes.

### Fly app boundary

Preferred:

```text
one Fly App per project cloud workspace
```

Acceptable early compromise:

```text
one Fly App per user/team, one Machine per active project
```

Avoid:

```text
one Fly App for all users/projects
```

Reasons:

- Better secrets isolation.
- Cleaner logs.
- Cleaner private networking boundaries.
- Cleaner app-level settings.
- Easier cleanup/reconciliation.
- Reduced blast radius.

### Cloud Box lifecycle

```text
none
  no cloud runtime exists

queued
  user requested Cloud Box

provisioning
  provider app/machine/volume being created or assigned

hydrating
  workspace restored from Git/object storage/snapshot

running
  user/agent is active

sleeping/suspended
  fast resume path for recent inactivity

stopped
  no CPU/RAM billing, slower resume

archived
  durable state in Git/object storage only; provider resources released

failed
  requires user or worker action
```

### Cloud Box provider interface

```go
type CloudBoxProvider interface {
    CreateBox(ctx context.Context, input CreateBoxInput) (BoxRef, error)
    AssignPooledBox(ctx context.Context, input AssignBoxInput) (BoxRef, error)
    StartBox(ctx context.Context, ref BoxRef) error
    SuspendBox(ctx context.Context, ref BoxRef) error
    StopBox(ctx context.Context, ref BoxRef) error
    DestroyBox(ctx context.Context, ref BoxRef) error
    ResizeBox(ctx context.Context, ref BoxRef, class ResourceClass) (BoxRef, error)
    SnapshotBox(ctx context.Context, ref BoxRef) (ArtifactRef, error)
    State(ctx context.Context, ref BoxRef) (BoxState, error)
    Exec(ctx context.Context, ref BoxRef, command ExecCommand) (<-chan ExecEvent, error)
    Ports(ctx context.Context, ref BoxRef) ([]PreviewPort, error)
}
```

Initial implementation:

```text
FlyCloudBoxProvider
```

Future implementations:

```text
RailwaySandboxProvider
NorthflankSandboxProvider
FreestyleVMProvider
E2BProvider
DaytonaProvider
AWSProvider
```

---

## 10. Setta Box Agent

Every Cloud Box should run a small Setta-controlled agent process.

### Responsibilities

```text
Authenticate to Setta with a short-lived box token.
Open outbound control connection to Setta.
Expose terminal sessions.
Run commands with scoped permissions.
Watch files.
Detect dev servers and ports.
Report process/log events.
Create snapshots/checkpoints.
Receive agent tool calls.
Enforce local policy inside the box where possible.
```

The Box Agent should not contain privileged Setta secrets.

### Box Agent communication

Preferred:

```text
Cloud Box Agent → outbound WebSocket/gRPC/HTTP stream → Setta Control Plane
```

Avoid:

```text
Setta directly SSHs into boxes for normal operation
```

SSH can exist later as an escape hatch, but the product should not depend on users understanding SSH.

### Token model

The Box Agent receives:

```text
project-scoped box token
short TTL
specific workspace_run_id
allowed event channels
allowed artifact prefixes
allowed preview ports
```

It must not receive:

```text
Setta master Fly token
Stripe key
Clerk admin key
LLM provider master key
cross-user storage credentials
```

---

## 11. Preview and integrated browser

The integrated browser is central to the "feels local" experience.

### Preview flow

```text
Dev server starts in Cloud Box on port 3000/5173/8000/etc.
      ↓
Setta Box Agent detects listening port
      ↓
Setta records PreviewPort
      ↓
Setta Preview Router exposes authenticated URL
      ↓
Integrated browser opens the URL
```

Example URLs:

```text
https://<workspace-id>-3000.preview.setta.dev
https://<workspace-id>-5173.preview.setta.dev
```

### Requirements

The preview router must support:

- HTTP.
- HTTPS.
- WebSockets.
- Server-sent events.
- Hot module reload.
- Authenticated access by default.
- Temporary public share links.
- Mobile viewport preview.
- Desktop viewport preview.
- QR handoff to phone.

### Fly routing option

For Fly-backed Cloud Boxes, use:

```text
Setta preview router app
  → authenticate Setta session
  → map preview URL to target Fly app/machine/port
  → use fly-replay to route request
```

Fly's per-user development environment guidance and dynamic request routing docs are directly relevant to this.

---

## 12. Local mode

Setta should still support local development, but without phone control of the laptop by default.

### Local mode goals

```text
Open local project folder.
Let AI work with local files through the Electron app.
Run commands locally with user approval.
Preview local dev server in Setta's integrated browser.
Checkpoint/sync project state to Setta when requested.
Start a Cloud Box from a local snapshot when the user wants remote/mobile continuation.
```

### Security boundary

Default:

```text
Desktop app controls local project.
Phone does not control laptop.
Cloud Box can be controlled from phone/desktop/web.
```

This avoids the security complexity of remote-controlling personal machines.

### Local runner

Setta Electron can run a local runner process that provides:

- File operations.
- Terminal execution.
- Process management.
- Port detection.
- Local preview routing.
- Git checkpointing.
- Optional Podman/devcontainer support later.

This local runner should expose a similar interface to the Cloud Box Agent so the UI and AI orchestration layer do not care whether the workspace is local or cloud.

---

## 13. Sync and checkpoints

Do not start with Dropbox-style realtime file sync. Agentic coding generates too many conflicts, artifacts, lockfiles, dependency directories, and branch/worktree changes.

Use this model:

```text
Git for source history
R2/S3 for snapshots and artifacts
Workspace volume for active cloud cache
Checkpoints for handoff between local and cloud
```

### Recommended flows

Desktop to cloud:

```text
User opens local project
Setta creates checkpoint commit or source snapshot
User starts Cloud Box
Cloud Box hydrates from checkpoint
Agent continues in Cloud Box
```

Phone-created project:

```text
User creates project on phone
Setta starts Cloud Box
Agent creates files
Setta checkpoints to Git/R2
User later opens desktop
Desktop pulls/hydrates project locally
```

Cloud to local:

```text
Cloud Box creates checkpoint
Desktop pulls branch/snapshot
Cloud Box can sleep/archive
```

### Snapshot policy

```text
After first dependency install
After first successful dev server start
Before scale-up/down
Before sleep/stop/archive
Before destructive AI action
At user-requested checkpoints
```

---

Continued in [Setta v3 Architecture Recommendations, Part 2](setta-v3-architecture-recommendations-part-2.md).
