# Go-Backed Python SDK Surface Inventory

Date: 2026-03-24
Branch: `go-rewrite` (`15fdbd828`)

This doc is the Phase 0 execution artifact from
`go-backed-python-sdk-plan.md`.

## Goal

Inventory the retained Python SDK surface and classify each behavior as:

- backend transport only
- local ergonomic helper
- local canonical behavior that must move to Go

The point is to remove ambiguity before implementation starts.

## Classification Legend

- `Transport`
  Python is acting as a client/adapter to a running Go backend.
- `Ergonomic`
  Python is doing local work, but it is convenience/read-only/orchestration work
  that can remain in Python if it is backed by Go-owned DTOs/contracts.
- `Canonical`
  Python still owns correctness-sensitive runtime/state/protocol behavior that
  should move to Go.
- `Mixed`
  The public surface is valid, but the current implementation still embeds some
  canonical Python ownership under it.

## High-Level Verdict

- The running-backend communication path already exists for essentially all
  retained Python SDK surfaces.
- No public retained SDK behavior currently proves that a local Go core is
  immediately required.
- The main remaining duplication is not "missing transport". It is
  correctness-sensitive post-response processing inside retained Python.
- The canonical local-ownership cluster is concentrated in three places:
  - listener snapshot/delta/dependency hydration in `backend/setta/api/listener.py`
  - runner summary/lookups built from `ProjectStateSingleConfig` in
    `backend/setta/api/runner.py`
  - listener DTOs that still embed `ProjectStateSingleConfig` in
    `backend/setta/types/listener.py`

That means the next implementation step should be contract work, not a local Go
core.

## Surface Matrix

| Surface | Current Python Role | Classification | Running-backend path already exists? | Desired owner/end state | Notes |
| --- | --- | --- | --- | --- | --- |
| `SettaListener` websocket/session/auth/bootstrap/register/send path in `backend/setta/api/listener.py` | Websocket client, auth/session discovery, reconnect loop, callback registration transport | `Transport` | Yes | Keep in Python as thin transport/session glue over the Go listener route | This is already aligned with the active Go-owned `/ws/listeners/{listenerID}` path. |
| `SettaListener.listen(...)`, callback scheduling, debounce/throttle wiring in `backend/setta/api/listener.py` | Callback authoring API and local scheduler integration | `Ergonomic` | Yes | Keep in Python | This is core SDK ergonomics, not backend ownership. |
| `dep_id`, `ListenerDependencyId`, `ctx.ids`, `ctx.values.by_id`, metadata-backed callback state view in `backend/setta/api/listener.py` | Local callback helper layer over dependency metadata and values | `Mixed` | Partial | Keep the Python helper surface, but back it only with Go-owned dependency metadata/value DTOs | The helper API is good. The remaining problem is what data it is built from. |
| Listener snapshot processing, force-refresh handling, dependency cache construction, realtime delta hydration, local dependency graph/value codec usage in `backend/setta/api/listener.py` | Builds listener-visible state from `ProjectStateSingleConfig`, `DependencyGraph`, and `PythonValueCodec` | `Canonical` | Yes | Move to Go-owned contracts/snapshots/deltas | This is the biggest remaining canonical Python ownership cluster. |
| `backend/setta/types/listener.py` DTOs, especially `ListenerForceRefreshContent.projectState: ProjectStateSingleConfig` | Listener contract layer still embeds Python project-state types | `Canonical` | Yes | Replace with listener-specific Go-owned snapshot contracts | This is the contract-level pressure keeping Python project-state alive for the listener path. |
| `ListenerHotReloader` in `backend/setta/api/hot_reload.py` | Local file watching, module reload, callback rebinding | `Ergonomic` | Yes | Keep in Python | Hot reload is a Python authoring concern, not backend ownership. |
| `RouterEndpointAPI` in `backend/setta/api/listener_endpoint_client.py` | Thin retained Python wrapper over the active Go listener endpoint set | `Transport` | Yes | Keep in Python as a narrow typed adapter | Already aligned with the current rewrite target. |
| `ChatHistoryClient`, `ChatStreamEmitterClient`, `ChatToolRunnerClient`, `ChatSectionSyncClient` in `backend/setta/api/chat_toolkit.py` | Thin router-endpoint clients | `Transport` | Yes | Keep in Python as thin endpoint adapters | These already operate as typed clients over Go-owned behavior. |
| `ChatSession` and chat stream assembly helpers in `backend/setta/api/chat_toolkit.py` | Local chat orchestration, message assembly, tool-result flow coordination | `Ergonomic` | Yes | Keep in Python | This is good Python-side orchestration as long as backend truth stays in Go. |
| `on_chat_send_event`, `on_chat_stop_event`, `on_chat_action_event` in `backend/setta/api/chat_toolkit.py` | Parses listener events into convenient typed chat actions | `Ergonomic` | Yes | Keep in Python | This is read-only helper logic over listener event payloads. |
| `SettaRunner.run_detached`, `get_run_status`, `cancel_run`, auth resolution, project metadata lookup in `backend/setta/api/runner.py` | Thin HTTP client over Go routes | `Transport` | Yes | Keep in Python as thin client logic | Already close to end state. |
| `SettaRunner.summary`, `RunnerSummary`, `ParamLookup`, `VariantLookup` in `backend/setta/api/runner.py` | Local summary/lookups built from a full `ProjectStateSingleConfig` fetched from the backend | `Mixed` | Yes | Keep the Python summary ergonomics, but back them with a narrower Go-owned runner snapshot DTO | This is the best first implementation slice because it is small and self-contained. |
| `RunOverride` and `RunPlan` in `backend/setta/api/runner.py` | Local convenience builders for explicit override payloads | `Ergonomic` | N/A | Keep in Python | These can remain Python as long as they lower to explicit contract payloads and do not own canonical semantics. |
| `ShareListenerRuntime` in `backend/setta/share/listener_runtime.py` | Loads share listener entrypoints and binds them to `SettaListener` instances | `Ergonomic` | Yes | Keep in Python unless share-runtime architecture changes independently | This is retained Python authoring/runtime glue, not the main canonical blocker. |
| `deployment_listener_process.py` in `backend/setta/share/` | Process bootstrap wrapper for share listener entrypoints | `Transport` | Yes | Keep in Python wrapper layer or replace only if share process packaging changes | This is packaging/runtime glue over the retained listener API. |
| `backend/setta/types/project_state.py` and `backend/setta/types/project_chat_windowing.py` as active dependencies of the retained SDK | Python canonical project-state/runtime model surface still reachable from listener/runner code | `Canonical` | Indirectly | Remove from the active retained SDK path after listener/runner contract work lands | These files are the canonical tail that the retained SDK still pulls in. |

## Surface-By-Surface Conclusions

### 1. `SettaListener`

The public listener authoring surface should stay Python.

What can stay:

- callback decorators
- callback scheduling
- hot reload
- `ctx.ids`
- `ctx.values.by_id(...)`
- metadata-backed `state.foo` access
- websocket/session/auth glue

What should move:

- any listener-visible state construction that still depends on
  `ProjectStateSingleConfig`
- local dependency-graph rebuilding
- local direct-value rendering that duplicates backend semantics
- snapshot/delta interpretation that should be expressed by Go-owned listener
  contracts instead

### 2. `SettaRunner`

The runner path is already close to the target architecture.

What can stay:

- `RunPlan`
- `RunOverride`
- name/variant/param lookup ergonomics

What should change:

- `summary()` should stop fetching a full `ProjectStateSingleConfig` and stop
  building lookups from the Python project-state model
- instead, Go should return a runner-specific snapshot DTO with exactly the
  lookup data the retained Python helper layer needs

This is the cleanest first implementation slice.

### 3. Chat Toolkit

The chat toolkit is not a major canonical-ownership problem today.

Most of it already behaves like:

- typed Python helpers
- thin route clients
- local orchestration over authoritative backend behavior

It should stay Python unless a specific helper is later shown to encode
canonical backend semantics.

### 4. Share Listener Runtime

The share runtime is also not the primary blocker.

It loads Python listener authoring entrypoints and runs them against the same
Go-backed listener protocol. That is consistent with the retained-boundary
decision.

## Immediate Next-Step Recommendation

Start Phase 1 and Phase 3 work, not local-core work.

Concrete next slice:

1. define a runner snapshot contract that replaces `ProjectStateSingleConfig`
   usage in `SettaRunner.summary()`
2. replace the Python runner summary/lookups to consume that narrower contract
3. in parallel, begin removing `ProjectStateSingleConfig` from listener-facing
   contracts, starting with `ListenerForceRefreshContent`

## What This Means For The Local Go Core Question

Phase 0 does not prove that a local Go core is needed yet.

It proves something narrower:

- if a local Go core is eventually needed, it will be for residual canonical
  local work after contract cleanup
- it is not the first blocker
- the first blocker is that retained Python still consumes the wrong shape of
  backend data and still reconstructs some backend semantics locally

So the correct next move is:

- richer Go-owned contracts first
- local Go core only if a real serverless canonical gap still exists afterward
