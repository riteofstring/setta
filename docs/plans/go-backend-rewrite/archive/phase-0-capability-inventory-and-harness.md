# Phase 0: Capability Inventory And Harness

## Purpose

Phase 0 exists to remove ambiguity before implementation starts.
The goal is to turn the current Python backend into a usable reference map for the Go rewrite without turning it into a compatibility prison.

## Scope

This phase should produce:

- a route and capability inventory grouped by subsystem and runtime mode
- a websocket message and session-behavior inventory
- an MCP endpoint and tool-surface inventory
- a shortlist of reference tests to preserve high-value behaviors
- a first coverage matrix mapping Python-covered behavior to required Go coverage
- a keep/redesign/drop decision list for major backend surfaces
- a black-box harness shape that can exercise either backend

## Non-Goals

- building the real Go server
- porting Python unit tests line-for-line
- preserving legacy route names just because they already exist
- defining storage migration paths
- locking MCP, PTY, or LSP libraries without the planned spikes

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/go-backend-rewrite-stack-recommendations.md`
- `backend/setta/types/routes.py`
- `backend/setta/routers/*.py`
- `backend/setta/websockets/*.py`
- `backend/setta/mcp/*.py`
- `tests/auth`
- `tests/routers`
- `tests/websockets`
- `tests/project_state`
- `tests/mcp`
- `tests/server_state`
- `docs/reference/auth-and-sessions.md`
- `docs/reference/setta-realtime-behavior.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/setta-files.md`

## Key Questions

- Which current backend capabilities are core product behaviors versus incidental implementation details?
- Which route families should survive conceptually, even if their exact shapes change?
- Which websocket message flows are part of the product model?
- Which MCP behaviors are essential versus historical convenience?
- Which tests are strong enough to become early black-box reference tests?

## Workstreams

### 1. HTTP Capability Inventory

Deliver:

- route family grouping by subsystem
- mode applicability:
  - IDE
  - share
  - app
  - launcher
- statefulness classification:
  - stateless request
  - process-global runtime
  - project runtime
  - share-session runtime
- keep/redesign/drop recommendation per family

Suggested first-pass groups:

- auth/bootstrap
- projects/project-state
- sections/code/project manager
- artifacts/attachments/binary
- terminals
- git/filesystem
- LLM/agentic
- MCP tool call and runtime status
- launch/launcher/runtime-control
- plugins
- deployments/share

### 2. Websocket And Realtime Inventory

Deliver:

- connection types
- auth requirements per connection
- message categories
- sequencing/replay rules
- project/session routing rules
- share-session behavior notes
- candidate simplifications for the Go rewrite

Focus code:

- `backend/setta/routers/websocket.py`
- `backend/setta/websockets/*.py`
- `docs/reference/setta-realtime-behavior.md`

### 3. MCP Inventory

Deliver:

- endpoint list
- transport list
- init tools versus discoverable tools
- namespacing rules
- scope-enforcement rules
- frontend-affinity behavior
- internal versus external MCP usage split

Focus code:

- `backend/setta/mcp/*.py`
- `backend/setta/routers/mcp_tools.py`
- `docs/reference/mcp-system-overview.md`

### 4. Reference Harness Definition

Deliver:

- harness shape for:
  - HTTP calls
  - websocket sessions
  - MCP tool calls
- environment/bootstrap requirements
- disposable-workspace strategy
- fixture strategy for file-backed state
- list of first black-box suites to implement

The harness should target product behavior, not internal method boundaries.

### 5. Keep/Redesign/Drop Decision Log

Deliver:

- a short decision record for each major subsystem
- explicit note when a current behavior is intentionally dropped

This avoids accidental drift and avoids fake compatibility obligations.

## Deliverables

- one inventory artifact for HTTP capabilities
- one inventory artifact for websocket/realtime behavior
- one inventory artifact for MCP surface area
- one first-pass Go coverage matrix
- one black-box harness plan
- one keep/redesign/drop decision log

These can be separate docs or a small set of structured markdown files in this folder.

## Suggested First Reference Suites

- bootstrap token exchange
- auth cookie issuance/validation
- websocket auth acceptance/rejection
- share-session requirement enforcement
- project state load/save happy path
- terminal attach/delete/resize
- MCP tool registration and namespacing
- one MCP scoped tool call

## Exit Criteria

- we can explain the backend capability map without reading Python code live
- we have a first-pass black-box suite list with owners and scope
- we have a first-pass coverage matrix showing how Go coverage will meet or exceed the Python behavioral surface
- we have explicit keep/redesign/drop calls for the major route families
- Phase 1 can begin without route-shape confusion

## Risks

- inventory work expands into implementation too early
- too much time is spent documenting low-value routes
- current Python quirks get mistaken for required product behavior

## Open Questions

- Should launcher/runtime-control endpoints be part of the first rewrite wave at all?
- Should the Go rewrite keep one unified process for all modes, or split some launcher concerns out?
- How much of the current route count is genuine product surface versus accumulated backend convenience?
