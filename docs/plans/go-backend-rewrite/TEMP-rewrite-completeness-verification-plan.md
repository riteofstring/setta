# Temporary Go Rewrite Completeness Verification Plan

Working status: temporary audit doc. Delete or fold into the canonical rewrite
docs after the completeness audit is finished.

## Execution result

Current verdict: the Go backend rewrite is not complete.

Blocking repo-backed gap found during execution:

- current non-test frontend workflow/state-machine run code still depends on
  `frontend/src/state/actions/stateMachineRuns.ts`
- workflow authoring is now Go-owned through `internal/projectstate`,
  `internal/projectview`, `internal/httpapi`, and `internal/frontendbindings`,
  including:
  - top-level section creation for `StateMachineStart`, `StateMachineGate`, and
    `StateMachineEnd`
  - `setStateMachineSectionSettings`
  - `projectConfig.stateMachineEdges`
  - workflow edge CRUD route helpers in the canonical generated frontend
    bindings
- the remaining missing slice is the workflow-run HTTP/frontend transport
  handoff:
  - the repo scan still does not find a Go-owned replacement for
    `startStateMachineRun`, `stopStateMachineRun`, `resetStateMachine`, or
    `getStateMachineRun`
  - Go now owns the workflow-run runtime foundation, `AgentRunUpdated`
    websocket emission, and the `report_state_machine_signal` MCP tool path in
    `internal/statemachineruns`, `internal/app`, and `internal/mcpx`
  - Python still owns the active frontend route path through
    `backend/setta/routers/agentic.py` and the current route-backed workflow
    runner in `backend/setta/agentic/state_machine_runner.py`

Other audit findings remained consistent with the retained-boundary rules:

- packaged and default non-reload entrypoints route to Go (`python -m setta`
  dispatches to the Go CLI)
- dev reload remains an explicit Python-only boundary
- retained Python `SettaListener` and `SettaRunner` now target Go websocket/HTTP
  transports rather than the old Python backend routes

## Goal

Determine whether the Go backend rewrite is actually complete from live code,
tests, and current callers, not from checklist text alone.

## What "certainty" means here

This audit can prove repo certainty, not internet-wide certainty.

Repo certainty means all of the following are true:

- every current in-repo caller hits a Go-owned backend transport/runtime or an
  explicitly retained Python boundary
- every remaining Python backend transport/runtime is either dormant or one of
  the retained boundaries
- the packaged/runtime entrypoints route production behavior into Go
- the test surface does not reveal a live Python-owned backend dependency
  outside the retained boundaries

This audit cannot prove whether some unpublished external caller outside this
repo still depends on old Python routes. If that matters, it must be treated as
separate product/distribution discovery, not inferred from local code.

## Completion standard

The rewrite is complete only if all current backend ownership outside the
explicit retained Python boundaries has moved to Go.

Explicit retained Python boundaries to re-check during the audit:

- packaging/install entrypoints and wheel-facing wrappers, including
  `python -m setta`
- dev-only backend startup/reload
- public Python APIs:
  - `setta.api.SettaListener`
  - `setta.api.ListenerHotReloader`
  - `setta.api.chat_toolkit`
  - share listener entrypoints that instantiate `SettaListener`
  - `setta.api.SettaRunner`
- Python or other sidecars intentionally executed by Go

Anything outside that set is a rewrite gap if it still owns an active backend
runtime or transport needed by current callers.

## Evidence sources

Start from code, not docs:

- Go packaged/runtime entrypoints:
  - `cmd/setta/main.go`
  - `cmd/setta-server/main.go`
  - `internal/app/app.go`
  - `internal/httpapi/*`
  - `internal/wsapi/*`
- Go frontend-contract source:
  - `internal/frontendbindings/specs.go`
  - `frontend/src/utils/generatedRoutes.ts`
  - `frontend/src/utils/generatedEndpoints.ts`
- Frontend caller surfaces:
  - `frontend/src/**`
  - raw transport helpers such as `frontend/src/utils/requestTransport.ts`
  - raw websocket callers
- Retained Python/public boundary code:
  - `backend/setta/entrypoint.py`
  - `backend/setta/__main__.py`
  - `backend/setta/api/__init__.py`
  - `backend/setta/api/listener.py`
  - `backend/setta/api/listener_endpoint_client.py`
  - `backend/setta/api/runner.py`
- Python backend inventory:
  - `backend/setta/types/routes.py`
  - `backend/setta/routers/*.py`
  - Python websocket/server modules still present under `backend/setta/`
- Tests and workflow runners:
  - Go `*_test.go`
  - frontend Vitest suites
  - Python pytest suites under `tests/`
  - dev/build/start scripts under repo root and `scripts/`

Use the current checklist docs only after the code pass, to record or correct
findings.

## Audit passes

### 1. Entry point and packaging audit

Prove which runtime the shipped and default entrypoints actually start.

Steps:

- inspect `cmd/setta/main.go` and `cmd/setta-server/main.go`
- inspect `backend/setta/entrypoint.py` and `backend/setta/__main__.py`
- inspect build/install/start wrappers that launch packaged or dev runtimes
- classify each path as:
  - Go-owned production/runtime path
  - retained Python dev-only path
  - retained Python packaging wrapper
  - unresolved mixed-ownership path

Failure condition:

- any packaged or normal runtime path still starts Python backend runtime for a
  non-retained capability

### 2. Active transport inventory audit

Build the actual backend transport inventory from code.

Steps:

- enumerate Go HTTP routes from `internal/httpapi`
- enumerate Go websocket routes from `internal/wsapi`
- enumerate Go-generated frontend contract routes from
  `internal/frontendbindings/specs.go`
- enumerate Python route/websocket inventory from `backend/setta/types/routes.py`
  and `backend/setta/routers/*.py`
- diff the Go and Python inventories

Classification required for every Python route/websocket family:

- active retained boundary
- active rewrite gap
- dormant legacy surface with no current caller
- deleted/replaced surface

Failure condition:

- any current caller still requires a Python transport outside the retained
  boundaries

### 3. Current caller reachability audit

Prove what current callers actually invoke.

Steps:

- scan frontend imports of `generatedEndpoints`, `generatedRoutes`, and
  websocket helpers
- separately scan for raw `fetch(`, `requestTransport`, `new WebSocket`, and
  literal backend route usage
- inspect CLI and command flows that call backend routes directly
- inspect retained Python API clients and their transport targets
- inspect plugin/listener runtimes that may open backend websockets directly

Required output:

- a caller-backed map from each current caller cluster to the concrete Go or
  retained-Python transport it reaches

Failure condition:

- any live caller path bypasses Go and lands on a Python backend transport not
  covered by the retained boundary list

### 4. Runtime ownership audit from constructors and registrations

Prove ownership from live wiring, not package names.

Steps:

- start at `internal/app/app.go`
- trace constructor wiring for the major capability buckets
- identify which runtime/service implementation is registered for HTTP, WS,
  MCP, background tasks, and distribution entrypoints
- for each remaining Python implementation, determine whether it is:
  - a retained public boundary
  - a sidecar invoked by Go
  - dead code / merge buffer
  - still an active owner

Capability buckets to classify:

- auth/bootstrap/modes/settings
- launcher/workspace launch/deployments
- project state/project shell/layout/code editing
- LSP/watch-code/codegen/pythonenv helpers
- terminals/runs/detached runs
- MCP/app-spec/UI settings
- AI/chat/external agents/transcription
- plugins/backend worker runtime
- artifacts/binary/file browser/git

Failure condition:

- a non-retained capability still resolves to Python runtime ownership in the
  live app wiring

### 5. Retained Python boundary audit

Confirm that the retained boundaries are truly narrow and target Go where
intended.

Steps:

- inspect `setta.api` exports
- inspect `SettaListener` websocket/bootstrap path and retained endpoint client
- inspect `SettaRunner` HTTP path
- inspect dev-only startup/reload scripts
- inspect packaging wrapper dispatch

Required output:

- for each retained boundary, document:
  - what still stays Python
  - what transport/runtime behind it is Go
  - what would count as accidental scope creep

Failure condition:

- a retained boundary hides broader Python backend ownership than the rewrite
  rules allow

### 6. Test-backed proof pass

Use tests to challenge the static audit.

Minimum execution passes:

- `./scripts/go.sh test ./...`
- relevant frontend Vitest suites for transport/generated-endpoint usage
- `./scripts/run_backend_tests.sh`

Interpretation rules:

- failing Go tests may reveal incomplete or regressed Go ownership
- failing frontend transport tests may reveal caller drift away from the Go
  contract
- passing Python tests do not prove Python is still active; they must be
  classified as retained-boundary coverage, dormant legacy coverage, or stale
  tests
- failing Python tests in non-retained areas may indicate either stale tests or
  an incomplete rewrite and must be resolved by code inspection, not guessed

Optional widening if needed:

- `./t.sh`
- `./scripts/run-playwright-e2e.sh`

### 7. Workflow proof pass

Exercise the runtime paths that matter most for completion claims.

Focus flows:

- packaged CLI/server startup path
- IDE mode startup
- share/app deployment startup
- frontend websocket connect
- listener websocket connect through retained Python listener SDK and plugin
  listener clients
- detached runner transport through retained Python runner client

Goal:

- confirm that the active workflow surfaces resolve to Go at runtime, not just
  in source layout

### 8. Decision and doc update pass

Only after the code/test audit:

- update `caller-backed-backend-surface-checklist.md` where caller reachability
  findings changed
- update `backend-capability-coverage-checklist.md` where ownership findings
  changed
- update `CURRENT.md` only if retained-boundary or workflow guidance changed

Then produce one conclusion:

- `Complete`
- `Not complete`
- `Cannot prove complete from repo evidence alone`

The third outcome should be used only if the remaining uncertainty is real and
cannot be resolved from code, tests, or runnable workflows in this repo.

## Concrete exit criteria

Do not call the rewrite complete unless every item below is satisfied:

- all active frontend/backend/websocket callers are mapped to Go or an explicit
  retained Python boundary
- the packaged production/runtime path resolves to Go
- retained Python boundaries are narrow and documented
- no non-retained Python router/websocket/runtime remains required by current
  callers or workflows
- the broad Go test pass and targeted workflow checks do not reveal a Python
  ownership dependency outside retained boundaries
- the canonical rewrite docs are updated to match the code findings

## Expected final artifacts

- updated canonical checklist docs if the audit changes any ownership or caller
  findings
- a final written conclusion with code/test evidence
- removal of this temporary doc once its contents are folded into the canonical
  rewrite docs or the audit result
