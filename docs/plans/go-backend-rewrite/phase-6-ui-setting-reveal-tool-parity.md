# Phase 6 UI Setting Reveal Tool Parity

## Purpose

This doc scopes the bounded Stage 3 follow-on after the completed Phase 6
UI-setting registry/search/get/set work.

The goal is to rebuild Go-owned parity for `reveal_ui_setting` over the
existing frontend websocket contract, without broadening into plugin setting
support or `revealAfterSet`.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- Stage 1 core UI-setting registry foundation is complete in Go
- Stage 2 `search_ui_settings`, `get_ui_setting_value`, and
  `set_ui_setting_value` transport parity is complete in Go
- the remaining non-project-state Python MCP gap count is 8
- the remaining UI-setting MCP gap has narrowed to `reveal_ui_setting`
- Go already has the necessary bounded metadata to resolve core reveal targets:
  - `internal/uisettings` owns core setting metadata, location, highlight, and
    reveal activation steps
  - `internal/realtime` already owns frontend connection registration,
    affinity-token issuance, share-session-aware connection selection, and JSON
    delivery
- Go does not yet own:
  - a `UISettingReveal` websocket message type
  - a `UISettingRevealResult` inbound websocket acknowledgement path
  - a reveal result hub/coordinator that fails closed on ambiguity, mismatch,
    or disconnect
  - the `reveal_ui_setting` MCP tool

## Scope

This slice should cover:

- Go-owned websocket message types for `UISettingReveal` and
  `UISettingRevealResult`
- a reveal-result hub with explicit request registration, wait, resolve, and
  disconnect cancellation
- a reveal coordinator that selects a frontend using the existing realtime
  registry as the source of truth
- MCP parity for `reveal_ui_setting`
- focused websocket, MCP, HTTP route, and authenticated SSE coverage

## Non-Goals

- plugin-contributed UI-setting registry entries
- plugin-handler reveal semantics beyond transporting the existing metadata
- `set_ui_setting_value(..., revealAfterSet=true)`
- best-effort or keyword-based frontend selection
- routing missing behavior back through Python

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-ui-setting-registry-and-reveal-tools-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tools/ui_settings.py`
- `backend/setta/mcp/ui_settings_context.py`
- `backend/setta/ui_settings/reveal_coordinator.py`
- `backend/setta/ui_settings/reveal_result_hub.py`
- `backend/setta/types/websocket.py`
- `tests/mcp/test_ui_setting_tools.py`
- `tests/websockets/test_frontend_receiver_share_mode.py`
- `frontend/src/state/actions/websocketReceive.ts`
- `internal/uisettings/*`
- `internal/realtime/*`
- `internal/wsapi/routes.go`
- `internal/mcpx/ui_setting_tools.go`

## Current Python Behavior

1. Context resolution
   - determines IDE vs share scope from request context
   - resolves share session id and frontend affinity token from explicit
     agentic/request metadata using a deterministic precedence order

2. Frontend selection
   - uses the frontend sender/registry as the source of truth
   - in IDE mode, fails closed if multiple eligible frontends exist and no
     affinity resolves
   - in share mode, constrains selection by `shareSessionId`

3. Reveal dispatch
   - registers a request in a reveal-result hub keyed by `requestId`
   - sends a `UISettingReveal` websocket message with:
     - `projectConfigId`
     - optional `chatId`
     - optional `activeSectionId`
     - `reveals`
     - `durationMs`
     - `requestId`

4. Reveal completion
   - waits for a correlated `UISettingRevealResult`
   - fails closed when:
     - no eligible frontend exists
     - the preferred frontend is unavailable
     - multiple frontends make routing ambiguous
     - the selected frontend disconnects
     - the ack arrives from the wrong websocket
     - the ack project id mismatches
     - the ack omits statuses for requested setting ids
     - the wait times out

## Current Go Foundation

Already complete:

- bounded core UI-setting registry metadata and read/write delegates in
  `internal/uisettings`
- frontend websocket connection registration in `internal/realtime`
- per-frontend affinity tokens in `internal/realtime.Registry`
- share-session-aware affinity resolution in
  `Registry.ResolveFrontendConnectionID`
- websocket JSON delivery and disconnect cleanup in
  `internal/realtime.WebsocketHub`
- authenticated websocket ingress in `internal/wsapi`
- scoped MCP context and temporary-id translation in `internal/mcpx`

Still missing:

- reveal websocket message types in Go
- reveal-result request tracking
- inbound websocket ack parsing and handoff
- a coordinator that owns deterministic frontend selection and timeout rules
- `reveal_ui_setting` transport parity

## Working Decisions

- reuse the existing realtime registry as the source of truth for frontend
  selection instead of adding a parallel selector
- keep the coordinator custom and explicit; transport should only decode,
  route, and marshal
- fail closed on ambiguity, mismatch, disconnect, and timeout
- land `reveal_ui_setting` first; keep `revealAfterSet` as a separate follow-on
  unless it falls out trivially after the coordinator exists
- keep plugin settings out of this slice; core metadata is already sufficient
  to close the remaining bounded UI-setting tool gap

## Recommended Implementation Order

1. Realtime foundation
   - add Go message structs for `UISettingReveal` and `UISettingRevealResult`
   - add a reveal-result hub with strict resolve/cancel validation

2. Websocket ingress
   - extend frontend websocket decoding to accept `UISettingRevealResult`
   - route inbound results to the reveal-result hub
   - ensure disconnect cleanup cancels pending requests for the selected
     frontend

3. Coordinator and tool parity
   - add a reveal coordinator over `internal/uisettings` metadata and
     `internal/realtime.WebsocketHub`
   - expose `reveal_ui_setting` through the MCP server with thin argument
     parsing and structured failures

4. Verification and doc closeout
   - add focused tests across realtime, wsapi, MCP, HTTP route, and app SSE
   - update the umbrella UI-setting doc and Phase 6 inventory after parity
     lands

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime ./internal/wsapi -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer.*UISetting.*Reveal' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute.*RevealUISetting' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP.*RevealUISetting|TestAppWebsocket.*Reveal' -count=1 -timeout 420s`

## Open Questions

- whether the reveal-result hub belongs under `internal/realtime` or
  `internal/mcpx`; current recommendation is to keep it near websocket
  transport/runtime ownership unless the coordinator needs a narrower package
  boundary
- whether the reveal coordinator should accept a clock/request-id source for
  deterministic tests; current recommendation is yes
