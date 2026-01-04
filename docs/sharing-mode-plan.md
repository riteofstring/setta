# Sharing Mode Plan (OSS + SaaS)

This document describes the plan for adding "sharing mode" alongside IDE mode.
Sharing mode is a read-only, public-facing view of a Setta project that supports
interactive parameter changes without persisting them back to the developer's
workspace.

## Goals
- Allow a developer to publish a project snapshot and share it via a port or URL.
- Keep share mode fast, safe, and scalable (many viewers, no project writes).
- Support per-viewer state so users do not override each other.
- Provide configurable controls for what can be modified in share mode.
- Keep IDE mode unchanged and continue supporting local + SSH workflows.
- Keep OSS behavior aligned with SaaS so it can be reused in containers.

## Non-goals
- Real-time IDE to share synchronization. Updates require redeploy/publish.
- Collaboration or multi-user editing in IDE mode.
- Automatic detection of listener global state. Isolation must be explicit.

## Decisions (Confirmed)
- Share mode uses a published snapshot and does not track live IDE edits.
- Public sharing is open by default; optional auth is supported.
- Listener execution is per-viewer (isolated state).
- Run snapshots should be configurable (not always-on).
- Terminals/run code are opt-in for share mode.
- Share URLs support `/share/<project_config_name>` and
  `/share/<project_config_name>/vN` (latest resolves to the highest vN).

Note: Share runtime is started via CLI flags (no env vars).

## Architecture Overview

### 1) Two runtimes
- IDE mode: full persistence, LSP, file watchers, autosave/manual save.
- Share mode: read-only by default, no file watchers, no writes to developer state.

Share mode should still support:
- Realtime UI changes (params, variants, layout, view modes, etc.) within a
  per-viewer overlay.
- Optional listener execution per-viewer.
- Optional LLM (disabled by default).

### 2) Share deployment artifact (published snapshot)
Share mode loads a published snapshot instead of the live workspace. This keeps
share runtime stateless and predictable.
Snapshots are organized by project config name and version (vN).
Version numbers increment per publish within each project config.

Example (OSS local folder):
```
setta_files/share_deployments/my_project/v3/
  manifest.json
  project.json
  artifacts/
    ...
  listener/
    app.py
  share_policy.json
```

Example `manifest.json`:
```json
{
  "version": 1,
  "projectConfigName": "my_project",
  "deploymentVersion": "v3",
  "projectConfigId": "abc123",
  "createdAt": "2025-01-10T12:34:56Z",
  "listener": {
    "entrypoint": "listener/app.py",
    "enabled": true
  },
  "sharePolicyPath": "share_policy.json"
}
```

In SaaS, the same folder can be zipped or stored in object storage. The share
runtime should be started via CLI flags (no env vars) and can target a
deployment root or resolve `/share/<project_config_name>` to the latest version
for that project config.

### 3) Per-viewer overlay
All share-mode mutations apply to a per-viewer overlay, never the base snapshot.
Implementation options:
- Copy-on-write ProjectStateSingleConfig per session.
- Overlay patches applied on top of the immutable base.

Key requirement: viewer A never sees viewer B's changes.

### 4) Sharing policy
A share policy defines what can be modified in share mode:
- params, variants, layouts, view modes
- run/terminals
- LLM access
- allowed sections or controls
- Structural changes, LSP, and MCP are disabled in share mode.

Example `share_policy.json`:
```json
{
  "allowParamChanges": true,
  "allowVariantChanges": true,
  "allowLayoutChanges": true,
  "allowRun": false,
  "allowLLM": false,
  "runSnapshotMode": "ephemeral"
}
```

Backend must enforce this policy before applying mutations. Frontend should
disable or hide controls based on the policy.

### 5) Session store abstraction
Share mode requires a per-viewer session store to keep overlays isolated.
- OSS default: in-memory store with TTL cleanup.
- SaaS: add a Redis-backed store for stateless scaling.

Expose a small interface (MemoryStore + RedisStore) so SaaS can swap it later.

### 6) Websocket scoping
Websocket connections in share mode must be tagged with a share session id so
broadcasts only target a single viewer.
- Tag connections in `backend/setta/websockets/websocket_manager.py`.
- Filter broadcasts in `backend/setta/websockets/msg_handlers/frontend_sender.py`.
- Add session id in realtime events if listener support is enabled.

### 7) Listener runtime (per_viewer)
Share mode must run listeners to support interactive apps.
- per_viewer: isolates global state, higher cost.

### 8) Run flow
Current behavior writes code to a timestamped folder on every run. This is
useful for reproducibility but not always needed.

Introduce a configurable run snapshot mode:
- `always`: current behavior.
- `ephemeral`: write to a temp folder, run, then delete (or TTL cleanup).
- `never`: run from canonical files (not safe for share overlays).

Suggested defaults:
- IDE mode: `ephemeral` with a UI toggle to "record run".
- Share mode: `ephemeral` only (with opt-in allowRun).

Share mode should redirect run output to a share run root (per project config,
per version, per session, per run) rather than `setta_files/code`.
In share mode, run commands should execute with `python <absolute path>` (or
`bash <absolute path>`) instead of `python -m` module paths to avoid invalid
module names and CWD-dependent layouts.
Run commands should shell-quote the resolved path to handle spaces in share
deployment roots.
When a run request omits `sectionId`, share mode should resolve
`entryCodeBlockId` and enforce `allowedSections` against that entry section.

### 9) LLM in share mode
Default: disabled. Opt-in via share policy.
If enabled, store chat state per viewer (memory or TTL store) and disable config
edits in share mode.

### 10) Persistence guardrails
Share mode must not write to developer state:
- No `project.json` writes.
- No JSON source writes.
- No artifact writes to `setta_files/artifacts`.
- No code file writes to canonical paths.

Artifacts and code can be cached in memory or under a share-specific root.

## OSS vs SaaS Behavior

### OSS (local sharing)
- Share deployments stored under `setta_files/share_deployments/<project_config_name>/vN`.
- Share run output under `share_runtime/<project_config_name>/<version>/share_runs/<session>/<timestamp>`
  (default root: `setta_files/share_runtime/...`).
- In-memory session store with TTL cleanup.
- Open by default; optional share token can be added later.

### SaaS (containerized)
- Deployment artifacts stored in object storage or container volume.
- Run output goes to ephemeral container storage or a temp volume.
- Session store likely Redis for stateless share nodes.
- Optional auth for shared URLs, rate limiting, and quotas.

## Implementation Touchpoints
Backend:
- `backend/setta/server_state.py` to toggle IDE vs share runtime components.
- `backend/setta/project_state/base_project_manager.py` to add run root and
  disable persistence in share manager.
- `backend/setta/project_state/project_manager.py` to prevent save in share mode.
- `backend/setta/project_state/artifacts.py` to avoid disk writes in share mode.
- `backend/setta/websockets/websocket_manager.py` for session tagging.
- `backend/setta/websockets/msg_handlers/frontend_sender.py` for scoped broadcasts.
- `backend/setta/websockets/realtime_event_hub.py` to support session-scoped emits.
- `backend/setta/routers` for policy enforcement and share-specific endpoints.

Frontend:
- `frontend/src/state/actions/websocketReceive.ts` for session handshake.
- UI gating for policy-based controls (params, variants, run, layout).
- Optional "record run" toggle in IDE mode.

## Phased Rollout
Phase 1: Share runtime skeleton
- Share deployment artifact format + loader.
- Share mode CLI flags + startup path.
- Disable persistence and watchers; LSP disabled in share mode.
- In-memory session store + per-viewer overlay.

Phase 2: Policy + listeners
- Share policy enforcement in backend + UI.
- Listener isolation (per_viewer mode).
- Websocket scoping for per-viewer broadcasts.

Phase 3: Run flow + UX
- Run snapshot mode settings.
- Share run root + TTL cleanup.
- Publish/redeploy UX in IDE mode.

Phase 4: SaaS alignment
- Redis store support.
- Optional auth, rate limits, and quotas.
- Deployment artifact in object storage.

## Open Questions
- Exact UX for publish/redeploy (manual CLI vs UI button).
- Default share policy for new deployments.
- Whether to keep terminals completely disabled in share mode by default.
