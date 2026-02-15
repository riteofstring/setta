# Plugin Project State + Listener Access Plan (Backend + Frontend + Subscriptions + Realtime)

## Context (As Of 2026-02-15)

Setta plugins can currently:

- register frontend UI contributions (`registerSectionKind`, `registerPane`, `registerCommand`, `registerTopNavBarItem`)
- call plugin-scoped backend routes from frontend via `host.apiFetch(...)`
- read/update a single plugin section via `readSection` / `updateSection`
- register backend routers/tools/adapters/codegen targets via worker-host RPC
- keep plugin-local state via `host.createStore(...)` (vanilla zustand store)

Current gaps for project-state-aware plugins:

- Frontend plugins do not have a first-class API to read arbitrary project state.
- Frontend plugins do not have a first-class subscription API for project state slices.
- Backend plugins do not have a first-class host API to read project state from worker code.
- Frontend plugins do not have a host API to emit listener dependency events with capability checks.
- Listener dependency updates do not support `SectionType.Plugin` section updates.
- Listener endpoint routing is limited to core router modules; plugin routes are not listener-callable.
- Dependency graph export currently skips `SectionType.Plugin`, so plugin sections are not first-class listener dependency nodes.
- Some fixture/test flows still rely on `window` globals for observability because plugin outputs are not exposed through a stable host API.

This plan introduces explicit, capability-gated read APIs for backend and frontend plugins, selector-based frontend subscriptions, and listener/realtime integration for interactive plugin sections.

## Goals

- Allow frontend plugins to read project state safely and efficiently.
- Allow frontend plugins to subscribe to project state changes with selector scoping.
- Allow backend plugin worker code to read project state snapshots through host RPC.
- Allow plugin sections to participate in listener flows (emit realtime dependency events and receive listener-driven updates).
- Keep APIs read-only and JSON-serializable.
- Preserve performance on large project states and large plugin section counts.
- Keep behavior deterministic across `ide`, `share`, and `app` modes.

## Non-Goals

- Backend plugin write access to core project state.
- Exposing raw core zustand store instances (`useProjectState`) directly to plugin code.
- Full real-time backend streaming subscription APIs in this phase.
- Direct plugin access to raw websocket objects or unrestricted listener protocol bypasses.
- Relaxing trust/security assumptions for third-party plugins (plugins remain trusted code in MVP).

## Design Principles

- Read-only by contract: plugins receive copies/snapshots, never mutable references.
- Selector first: subscriptions must be scoped to specific slices (no default full-state live subscription).
- Capability gated: every new API is protected by effective capability checks.
- Mode aware: capability availability remains explicit per server mode.
- Listener protocol reuse: plugin realtime support should use existing dependency-event/listener infrastructure, not a parallel channel.
- Stable contracts: JSON-serializable request/response shapes, runtime validation, deterministic error codes.

## Proposed Capability Additions

Add new plugin capabilities:

- `readProjectState`
- `subscribeProjectState`
- `emitListenerEvents`
- `registerListenerEndpoint`

Capability semantics:

- `readProjectState`: required for frontend `readProjectState(...)` and backend `read_project_state(...)`.
- `subscribeProjectState`: required for frontend `subscribeProjectState(...)`.
- `emitListenerEvents`: required for frontend/backend plugin APIs that publish dependency events into the listener realtime pipeline.
- `registerListenerEndpoint`: required for backend plugin routes to be callable from listener callbacks.

Mode policy proposal:

- `ide`: allow all four capabilities.
- `share`: allow frontend `readProjectState`, `subscribeProjectState`, and `emitListenerEvents`.
- `app`: allow frontend `readProjectState`, `subscribeProjectState`, and `emitListenerEvents`.

Notes:

- Backend plugin capabilities like `registerRouter`/`registerListenerEndpoint` remain blocked in `share`/`app` unless separately changed.
- If backend access in deployment modes is desired later, treat that as a separate policy decision.

Files impacted:

- `backend/setta/plugins/models.py`
- `backend/setta/plugins/schemas/setta.plugin.schema.json`
- `backend/setta/plugins/manager.py` (`_MODE_ALLOWED_CAPABILITIES`)
- `backend/setta/code_gen/dependency_graph.py`
- `backend/setta/project_state/listener_dependency_updates.py`
- `backend/setta/listeners/listener_router_endpoint_registry.py`
- `backend/setta/websockets/realtime_event_hub.py`
- `frontend/src/plugins/runtime.ts`
- `frontend/src/state/actions/websocketReceive.ts`

## Frontend API Plan

### Host API Additions

Extend `SettaPluginHost` in `frontend/src/plugins/runtime.ts` with:

- `readProjectState(selector)`
- `subscribeProjectState(selector, listener, options?)`

Proposed types:

```ts
type PluginProjectStateSelector =
  | { kind: "projectConfig" }
  | { kind: "activeSectionIds" }
  | { kind: "section"; sectionId: string }
  | { kind: "sections"; sectionIds: string[] }
  | { kind: "singletonSections" }
  | { kind: "full" }; // read-only pull, not allowed for subscriptions

type PluginProjectStateSubscriptionOptions = {
  fireImmediately?: boolean; // default true
  throttleMs?: number; // default 0
};

readProjectState(selector: PluginProjectStateSelector): unknown;

subscribeProjectState(
  selector: Exclude<PluginProjectStateSelector, { kind: "full" }>,
  listener: (nextValue: unknown, prevValue: unknown | null) => void,
  options?: PluginProjectStateSubscriptionOptions,
): () => void;
```

Behavior:

- `readProjectState` returns a `structuredClone` of the selected slice.
- `subscribeProjectState` uses `useProjectState.subscribe(selectorFn, ...)` under the hood.
- Listener payloads are cloned snapshots to prevent accidental mutation.
- Unknown/invalid selectors fail with `PLUGIN_FRONTEND_REGISTRATION_INVALID`.
- Missing capability fails with `PLUGIN_CAPABILITY_DENIED`.

### Lifecycle + Cleanup

Add host-level cleanup support so subscriptions do not leak across runtime refresh/reload:

- track per-plugin cleanup callbacks in runtime loader state
- auto-run cleanup when plugin runtime reloads or plugin is removed
- `subscribeProjectState` auto-registers its unsubscribe function into this cleanup registry

This avoids stale listeners and zombie updates when plugin frontend modules are reloaded.

### Performance Guardrails

- Block `kind: "full"` for subscriptions.
- Keep selector set finite and explicit.
- Add optional throttle for noisy selectors.
- Keep equality checks stable and cheap for common selectors.
- Document plugin guidance: subscribe once at plugin scope, fan out through plugin-local zustand store.

### SDK Exports

Expose new types in `frontend/src/plugins/sdk.ts` so plugin authors can use typed selectors/options.

## Backend API Plan

### Backend Plugin Context Additions

Extend backend plugin context with a read API:

```py
def read_project_state(
    self,
    *,
    project_config_id: str,
    share_session_id: str | None = None,
    view: Literal["summary", "full"] = "summary",
) -> dict[str, Any]:
    ...
```

Notes:

- `summary` is default for lower payload size.
- `full` returns full project state snapshot serialized as JSON-safe payload.
- no write APIs in this phase.

Add this in both:

- `BackendPluginContext` (`backend/setta/plugins/manager.py`)
- `_WorkerBackendPluginContext` (`backend/setta/plugins/worker.py`)

### Worker Host RPC Additions

Add a new host RPC method:

- `host.read_project_state`

Updates required:

- `SUPPORTED_RPC_METHODS` in `backend/setta/plugins/worker.py`
- `_REQUIRED_BACKEND_RPC_METHODS` in `backend/setta/plugins/manager.py`
- `_dispatch_backend_worker_host_request(...)` handler in `backend/setta/plugins/manager.py`

RPC payload shape:

```json
{
  "projectConfigId": "...",
  "shareSessionId": "...",
  "view": "summary"
}
```

Response:

```json
{
  "projectState": { "...": "..." },
  "view": "summary"
}
```

### Project State Resolution Logic

In `host.read_project_state` dispatch:

- resolve `SettaFastAPIState` from FastAPI `app` context
- if deployment mode:
  - require `shareSessionId`
  - validate/touch session
  - read state from share-session backend
- if IDE mode:
  - read state from active project manager backend

State sourcing approach:

- summary: use existing summary builder path (`build_project_state_summary(...)`)
- full: use `convert_backend_to_single_config(...)` + JSON-safe dump

### Invocation Plumbing Changes

Nested host calls during runtime worker invocations currently lack entry/app context in some paths.

Planned updates:

- pass `entry` and `app` context into `_call_backend_worker_method(...)` for:
  - plugin route invocations (`plugin.invoke_route`)
  - plugin MCP tool invocations (`plugin.invoke_mcp_tool`)
  - plugin codegen invocations if needed for consistency

This ensures `host.read_project_state` can be dispatched whenever worker code calls it.

### Security + Policy Notes

- Read APIs are capability-gated and mode-gated.
- Backend read path must validate deployment session IDs before state access.
- Keep response strictly JSON-serializable; reject invalid payloads deterministically.
- No direct secret-store bypasses are introduced; this follows existing project-state exposure semantics.

## Listener + Realtime Integration Plan

### Frontend Host API Additions

Extend `SettaPluginHost` with listener emit APIs:

- `emitRealtimeDependencyEvent(event)`
- `emitSectionRealtimeValue(sectionId, value, options?)`

Proposed behavior:

- `emitRealtimeDependencyEvent(event)` routes through existing websocket message shape used by `sendRealtimeDependencyEvent(...)`.
- `emitSectionRealtimeValue(...)` is a convenience wrapper that emits section dependency values using existing section key helpers.
- Both APIs require `emitListenerEvents` capability.
- Both APIs validate payload shape before sending and return deterministic plugin errors on invalid payloads/capability denial.
- Deployment-mode coverage checks should apply consistently to direct dependency events and section wrappers (today coverage checks are stronger on section wrappers than raw dependency events).

### Backend Worker Host API Additions

Extend backend plugin context with realtime emit helpers:

- `emit_listener_dependency_event(...)`
- optional binary variant for large payloads (`emit_listener_dependency_event_binary(...)`) if needed by plugin use cases

Worker-host RPC additions:

- `host.emit_listener_dependency_event`
- optional `host.emit_listener_dependency_event_binary`

Dispatch behavior:

- resolve `RealtimeEventHub` from FastAPI state
- in deployment modes, validate/touch `shareSessionId` before emission
- emit via existing hub methods (`emit_dependency_event` / binary counterpart)
- enforce `emitListenerEvents` capability

### Listener-Callable Plugin Endpoints

Current limitation: `listener_router_endpoint_registry` only allows module prefixes under core routers, so listener callbacks cannot invoke plugin routes.

Proposed support:

- Add explicit listener endpoint registration for plugin routes (exact endpoint names, no wildcard module trust).
- Gate registration/invocation under `registerListenerEndpoint`.
- Keep the same request-model requirements as core listener-callable routes (`projectConfigId` required outside listener router namespace, strict model validation).
- Merge plugin listener endpoint specs into listener dispatch resolution without weakening existing core-route checks.

### Dependency Graph + Plugin Section Node Export

Current limitation: `DependencyGraph.section_exporters` skips `SectionType.Plugin`, so plugin sections are not first-class dependency nodes.

Planned updates:

- Add `SectionType.Plugin` exporter in `backend/setta/code_gen/dependency_graph.py`.
- Emit a section dependency node for plugin sections using the standard `create_dep_key(sectionId=...)` contract.
- Use plugin section `data` as serialized node value (JSON-safe literal) for dependency visibility.
- Keep names deterministic so listener dependency matching works consistently across IDE/deployment modes.

### Listener-Driven Plugin Section Updates

Current limitation: `apply_listener_dependency_updates(...)` only handles section updates for TextBlock/Chat and rejects plugin sections.

Planned updates:

- Extend section update handling in `backend/setta/project_state/listener_dependency_updates.py` for `SectionType.Plugin`.
- Define a strict payload contract for plugin section updates (literal JSON object only; deterministic merge/replace semantics documented).
- Reuse existing section update primitives where possible so plugin listener updates follow the same project-state update pipeline and persistence behavior.
- Keep unsupported payloads/types as hard errors with explicit `ListenerDependencyUpdateError` messages.

### Frontend Subscription Story For Realtime Plugin Sections

- Plugin sections that are updated by listener events become observable through `subscribeProjectState({ kind: "section", sectionId })`.
- Plugin authors should immediately fan subscription events into plugin-local zustand stores (`host.createStore(...)`) for UI rendering and derived-state logic.
- This replaces `window` global test hooks for most interactive plugin state flows.

## Fixture + Example Plan

Update/add fixtures to demonstrate the new APIs without `window` hacks:

- frontend fixture (`tests/fixtures/plugins/frontend/frontend/src/index.js`):
  - use `readProjectState({ kind: "projectConfig" })` in command/pane UI
  - use `subscribeProjectState({ kind: "activeSectionIds" }, ...)` to maintain plugin-local metrics store
  - add command(s) that emit realtime dependency events through host listener APIs
- backend fixture (`tests/fixtures/plugins/backend/backend/entrypoint.py` or new fixture):
  - add route that returns `plugin.read_project_state(..., view="summary")`
  - add route/tool that emits listener dependency events from backend worker host APIs

Keep plugin-local zustand usage via `host.createStore(...)` as the recommended pattern.

## Testing Plan

### Frontend Unit Tests

Update `frontend/src/plugins/runtime.test.ts`:

- `readProjectState` returns cloned snapshots for each selector kind
- `subscribeProjectState` emits updates and stops after unsubscribe
- `subscribeProjectState` rejects `kind: "full"`
- capability denied behavior for read/subscribe
- cleanup-on-runtime-reload behavior for active subscriptions

### Backend Unit Tests

Update `tests/plugins/test_plugin_worker.py`:

- worker can call `host.read_project_state`
- invalid read payloads fail with deterministic error codes
- worker can call `host.emit_listener_dependency_event`
- listener emit RPC enforces capability/mode/session validation

Update `tests/plugins/test_plugin_manager.py`:

- host dispatch for `host.read_project_state` in IDE mode
- host dispatch for `host.read_project_state` in deployment mode (valid/invalid session)
- nested host calls during `plugin.invoke_route` and `plugin.invoke_mcp_tool` succeed with context
- host dispatch for listener emit RPC (IDE + deployment session path)
- plugin listener endpoint registration/invocation path resolves only explicitly registered plugin routes

Update listener dependency update tests (new file or existing listener tests):

- plugin section dependency updates apply with documented merge/replace semantics
- invalid plugin section listener payloads fail with `ListenerDependencyUpdateError`
- dependency updates against missing/unsupported plugin targets fail deterministically

Update dependency graph tests:

- `SectionType.Plugin` exports a dependency node with stable name/key/value
- plugin section dependency keys are matchable in listener dependency routing

### Integration / E2E

Add or update Playwright tests:

- frontend fixture command/pane reflects live project-state subscription updates
- backend fixture route returns expected summary state payload
- plugin fixture emits realtime listener events and listener callbacks update plugin section UI in real time

### Manual Smoke

Extend `docs/guides/plugin-fixture-manual-smoke.md`:

- verify fixture pane reacts to active section changes via subscription
- verify backend fixture state endpoint returns current project summary
- verify plugin listener emit command produces dependency events consumed by listener callbacks
- verify listener-driven plugin section updates are reflected in plugin UI without page reload

## Rollout Plan

1. Ship capability/schema/runtime changes behind normal plugin versioning.
2. Update fixtures and automated tests in same PR.
3. Update authoring docs with concrete frontend/backend examples.
4. Optionally add a short migration note for plugin authors currently using `window` globals for test observability.

## Acceptance Criteria

- Frontend plugin can read project config/section slices without importing core stores.
- Frontend plugin can subscribe to project-state slices and receive deterministic updates.
- Backend plugin worker code can read project-state snapshots via host API.
- Plugin frontend/backend code can emit listener dependency events via capability-gated host APIs.
- Listener dependency updates can target `SectionType.Plugin` sections with deterministic payload semantics.
- Listener callbacks can invoke explicitly registered plugin endpoints without broad module-prefix trust.
- Capability gating and mode policy are visible in `/api/plugins/status`.
- Fixture plugins demonstrate both frontend subscriptions and backend state reads.
- Unit + Playwright coverage exists for all new host APIs.

## Open Questions

- Should deployment-mode backend state reads remain blocked even if router capability policy changes later?
- Do we want a stricter payload-size cap for `view="full"` responses from worker-host RPC?
- For plugin section listener updates, should phase 1 use merge-only semantics for `data`, or support explicit replace semantics too?
- Should plugin listener endpoint registration be manifest-declared (static) or runtime-registered (dynamic) for better auditability?
- Do we need an explicit naming convention for plugin section dependency keys beyond `sectionId` to improve cross-plugin interoperability?
- Should we expose additional precomputed selector kinds (for example view-mode layout summaries) in phase 1, or add incrementally?
