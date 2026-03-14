# Temporary Rewrite Completion Audit Plan

Drafted: `2026-03-14`
Updated with execution results: `2026-03-14`

Purpose: determine from current code, registrations, callers, and executable
behavior whether the Go rewrite is actually complete.

This plan is intentionally stricter than the existing rewrite checklists. Those
docs are useful indexes and hypotheses, but they are not sufficient evidence on
their own. The audit must be reproducible from code and runtime proof.

## Decision rule

Return exactly one verdict:

- `Complete`
- `Incomplete`
- `Cannot prove complete`

`Complete` requires repo-backed proof that every active backend/runtime surface
outside the explicit retained Python boundaries is Go-owned today.

`Incomplete` means at least one active backend capability, caller path, or
runtime owner still depends on Python outside an allowed retained boundary.

`Cannot prove complete` means the code audit found unresolved ambiguity or the
required runtime/test proof could not be executed. If certainty is the goal,
missing proof does not count as complete.

## Completion standard

Treat the rewrite as complete only if all of the following are true:

- Every active non-test frontend caller reaches a Go-owned transport/runtime or
  an explicit retained boundary.
- Every active packaged/default backend entrypoint resolves to Go-owned command
  and server behavior, except for explicitly retained Python wrappers.
- No active Python router, websocket handler, or service owns backend behavior
  outside the explicit retained boundaries.
- Every claimed retained Python boundary is real, narrow, and still required by
  current code or supported public API.
- Go test coverage plus black-box runtime proof match or exceed the meaningful
  behavior still covered by the Python backend/tests.
- No material backend subsystem remains unclassified.

If any one of these statements cannot be proven, do not return `Complete`.

## Explicit retained boundaries to verify

Start with the retained-boundary list in `CURRENT.md`, then verify each claim in
code rather than accepting the doc at face value:

- packaged/install entrypoints and wheel-facing wrappers, including
  `python -m setta`
- public Python APIs:
  - `setta.api.SettaListener`
  - `setta.api.ListenerHotReloader`
  - `setta.api.chat_toolkit`
  - share listener entrypoints that instantiate `SettaListener`
  - `setta.api.SettaRunner`
- retained Python listener boundary means the authoring/client surface only;
  local dependency-graph rebuilding, Python codegen, or generated-runtime
  fallback inside that client are not acceptable completion exceptions
- external tool/provider runtimes and generic stdio MCP servers intentionally
  executed by Go

Anything outside these verified exceptions is presumptively rewrite scope.

## Non-evidence

Do not treat any of the following as proof:

- phase plans marked complete
- checklist rows marked `Complete`
- existence of a Go package, route constant, or handler
- existence of generated frontend bindings alone
- absence of recent Python edits
- assumptions that a Python route is dormant without caller search
- broad statements like "Go owns this now" without transport, registration,
  caller, and runtime-owner evidence

## Required evidence sources

### Runtime and entrypoint wiring

- `cmd/setta/main.go`
- `cmd/setta-server/main.go`
- `internal/app/*`
- `internal/runtime/*`
- `backend/setta/__main__.py`
- `backend/setta/entrypoint.py`
- `frontend/backendStart.sh`
- `build.sh`
- `scripts/build_packaged_go_binaries.sh`
- `verify_install.sh`

### Go transport and runtime inventory

- `internal/httpapi/*`
- `internal/wsapi/*`
- route/registration wiring under `internal/app/*`
- relevant `internal/*` packages by feature area

### Python backend/runtime inventory

- `backend/setta/types/routes.py`
- `backend/setta/routers/*.py`
- `backend/setta/websockets/**/*`
- `backend/setta/api/*`
- other `backend/setta/*` runtime packages when ownership is disputed

### Current caller inventory

- non-test `frontend/src/**/*`
- `frontend/src/utils/generatedEndpoints.ts`
- `frontend/src/utils/generatedTypes.ts`
- direct frontend `fetch`, request helper, and websocket call sites
- plugin runtime/frontend bridge code
- retained public Python API callers and wrappers

### Test and behavior inventory

- `internal/**/*_test.go`
- `tests/**/*`
- relevant Vitest files under `frontend/src/**/*.test.ts*`
- Playwright coverage under `frontend/tests/e2e/**/*.spec.ts`
- `docs/plans/go-backend-rewrite/testing-strategy.md`

## Audit workflow

1. Lock the definition of "complete".
   - Use this document's decision rule, not the existing checklist statuses.
   - Treat `CURRENT.md` as the starting claim set for retained boundaries only.

2. Build the actual Go backend inventory.
   - Enumerate active Go CLI/server entrypoints.
   - Enumerate registered HTTP and websocket routes from Go.
   - Map each feature area to its actual Go runtime owner package.

3. Build the actual Python backend inventory.
   - Enumerate Python HTTP routes, websocket handlers, startup paths, public
     APIs, and runtime-owning packages.
   - Classify each Python surface as:
     - explicit retained boundary
     - active backend owner
     - thin wrapper into Go
     - dormant/unproven

4. Build the actual caller inventory.
   - Find all non-test frontend calls through generated endpoints.
   - Find all raw transport usage: `fetch`, request helpers, `new WebSocket`,
     route interpolation, and mode-specific callers.
   - Find Python public-API callers that still represent supported runtime
     surfaces.
   - Include IDE, launcher, share, and app mode callers separately.

5. Prove caller path ownership feature by feature.
   - For each active caller, prove the chain:
     caller -> registered transport -> runtime owner.
   - If a caller still lands on Python outside an allowed retained boundary,
     record a blocker immediately.
   - If Go owns runtime but caller still reaches Python transport, the rewrite is
     not complete for certainty purposes.

6. Prove broader runtime ownership feature by feature.
   - Audit the major subsystem buckets:
     - runtime/process/distribution
     - auth, modes, sessions, and settings
     - launcher/workspace launch/deployments
     - realtime, websockets, listeners, and terminals
     - project state, editing, LSP, watch-code, and runs
     - MCP, app-spec, UI settings, and app generation
     - AI, agents, external runtimes, and transcription
     - plugins and extensibility
     - file browser, artifacts, attachments, binaries, and git
   - For each bucket, decide whether active ownership is Go-owned, shared,
     Python-owned, or external.

7. Verify retained-boundary claims one by one.
   - Confirm the Python wrapper really delegates into Go where claimed.
   - Confirm dev-only Python startup/reload is still dev-only.
   - Confirm public Python APIs are thin retained surfaces rather than hidden
     active backend owners.
   - Confirm any listener fallback still exists for a concrete current caller,
     not because a plan doc says it might.

8. Build a coverage matrix from tests, not assumptions.
   - Map meaningful Python behavior/test areas to existing Go tests.
   - Identify any behavior still proven only by Python tests.
   - Identify gaps where Go code exists but equivalent behavior proof does not.

9. Execute runtime and test proof.
   - Run Go tests: `./scripts/go.sh test ./...`
   - Run backend Python tests for behavior reference and retained-boundary
     coverage: `source activate.sh && ./scripts/run_backend_tests.sh`
   - Run relevant frontend/Vitest suites for caller-path proof.
   - Run relevant Playwright flows for real transport proof.
   - Run packaged install/smoke proof: `source activate.sh && ./verify_install.sh`
   - Exercise packaged/default entrypoints enough to prove:
     - `python -m setta` dispatches into Go
     - packaged Go binaries are the active runtime target
     - dev reload remains the bounded Python exception

10. Cross-check the existing rewrite docs last.
    - Compare audit findings against:
      - `caller-backed-backend-surface-checklist.md`
      - `backend-capability-coverage-checklist.md`
    - Treat mismatches as doc drift until code proves otherwise.

11. Produce the verdict and evidence ledger.
    - `Complete` only if every gate passes.
    - `Incomplete` if any active Python-owned backend gap remains.
    - `Cannot prove complete` if any gap or ambiguity cannot be closed with code
      and runtime evidence.

## Completeness gates

Do not consider the audit complete until all of the following are true:

- Every active non-test frontend caller has been traced to its transport and
  runtime owner.
- Every supported public Python API has been traced to a retained-boundary
  justification and its actual backend target.
- Every Go route/websocket claimed as active has been checked for registration.
- Every Python route/websocket family has been checked for current callers or
  classified as dormant/unproven with evidence.
- No active backend behavior is still Python-owned outside the explicit retained
  boundaries.
- The packaged/default command path is Go-owned, with Python only as a bounded
  wrapper where explicitly retained.
- The retained-boundary list is smaller than "whatever Python is left in the
  tree"; each boundary is concrete and defended.
- Meaningful Python-covered behavior has corresponding Go-side proof or an
  explicit, current, documented reason it remains retained.
- Required tests/smoke checks have actually been run.

## Expected audit output

The final audit result should include:

- one definitive verdict: `Complete`, `Incomplete`, or `Cannot prove complete`
- a blocker table for every active Python-owned backend gap
- a retained-boundary table with code evidence for why each exception is still
  allowed
- a caller-path summary showing which current surfaces were proven Go-owned
- a test-and-smoke summary listing what was executed and what could not be
  proven

## Key rule

If the repo contains enough ambiguity that the answer depends on trust in the
existing plan docs, the answer is not "complete". It is at best
`Cannot prove complete` until the code and runtime evidence close the gap.

## Audit execution result

### Verdict

`Incomplete`

This verdict holds under both of the only reasonable definitions:

- If "complete" means repo-wide backend/runtime ownership is fully in Go, the
  answer is `Incomplete` because active supported Python runtime surfaces still
  exist.
- The targeted Go-side parity failures found during this audit have since been
  repaired, so the remaining proof against completeness is the still-active
  Python runtime surface area above.

### Proven Go-owned today

- `python -m setta` is a Python wrapper around the packaged Go CLI:
  - `backend/setta/__main__.py`
  - `backend/setta/entrypoint.py`
- Source-checkout `python -m setta` now also wires the Go server companion
  through a Go-owned wrapper instead of failing on a missing sibling binary:
  - `backend/setta/entrypoint.py`
  - `scripts/run_setta_server.sh`
- The old source-only Python `backend/setta/start.py` CLI surface has been
  removed; the active dev and packaged startup paths route through the Go CLI
  instead.
- The current Go binaries are real repo entrypoints:
  - `cmd/setta/main.go`
  - `cmd/setta-server/main.go`
- Source/dev startup now routes through the Go-dispatch path for both normal
  start and reload:
  - `frontend/backendStart.sh`
- Go owns the currently registered websocket transport:
  - `internal/wsapi/routes.go`
- Go owns the main HTTP/runtime registration surface:
  - `internal/app/app.go`
- The Go-owned plugin worker launcher/runtime boundary now starts backend
  workers from a generic command prefix instead of hardcoding
  `python -m setta.plugins.worker` inside session/launcher/spec plumbing:
  - `internal/plugins/worker_runtime.go`
  - `internal/plugins/worker_session.go`
  - `internal/plugins/worker_launcher.go`
  - `internal/plugins/filesystem_worker_spec_resolver.go`
- The dead Python plugin HTTP route module is no longer part of the imported
  Python router package:
  - `backend/setta/routers/plugins.py` has been removed
  - `backend/setta/routers/__init__.py` no longer imports that route surface
- The dead Python plugin MCP tool module is no longer part of the imported
  Python MCP tool package:
  - `backend/setta/mcp/tools/plugins.py` has been removed
  - `backend/setta/mcp/tools/__init__.py` no longer imports that tool surface
- The dead Python websocket listener receiver no longer falls back to
  `state.plugin_manager.invoke_listener_endpoint(...)` for plugin-owned
  endpoints:
  - `backend/setta/websockets/msg_handlers/python_script_receiver.py`
  - only built-in listener router endpoints remain on that legacy Python path
- The frontend transport helpers and active websocket callers point at the Go
  route helpers rather than legacy Python routes:
  - `frontend/src/utils/transportRouteConstants.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/state/hooks/terminals/terminal.ts`
  - `frontend/src/plugins/listenerEndpointClient.ts`

### Verified retained Python boundaries

- The legacy top-level Python FastAPI app module has been removed:
  - `backend/setta/server.py` no longer exists in the active source tree
  - retained Python listener endpoint discovery no longer imports that module
    just to enumerate listener-callable routes
  - local session/process detection no longer treats `setta.server:app` as a
    live Setta backend process shape; the active recognized server shapes are
    the Go binary / wrapper paths instead
- Public Python API exports are still active supported surfaces:
  - `backend/setta/api/__init__.py`
- The retained listener client still owns websocket registration/bootstrap
  logic, and it still contains some graph-backed helper code even though the
  active bootstrap/force-refresh/replay path no longer rebuilds dependency
  metadata from `projectState`:
  - `backend/setta/api/listener.py`
  - `backend/setta/api/listener_endpoint_client.py`
- Share listener runtime still instantiates and runs `SettaListener`:
  - `backend/setta/share/listener_runtime.py`

These are real code-backed supported surfaces, not just stale files. The
listener runtime is now narrower than before, the old top-level Python
FastAPI app is gone, the old `setta.dev_start` reload shim is gone, and the
old source-only Python startup helper surfaces are gone, but the repo is still
not "all Go" today even though the default
packaged/runtime path is predominantly Go-owned.

### Remaining blocker

No currently reproduced Go-owned parity blocker remains from the targeted audit
slice. The remaining blocker is repo-wide backend/runtime ownership outside the
explicit retained boundary list, most notably the still-active Python plugin
worker implementation/runtime path in `backend/setta/plugins/worker.py` and the
Python plugin-management path that still launches that worker. The old
top-level Python FastAPI app, the old `setta.dev_start` shim, and the old
source-only Python startup/CLI helper surfaces are no longer part of that
blocker set.

### Test and smoke evidence executed

- Passed:
  - `source activate.sh && python -m setta version`
  - `pnpm -C frontend exec vitest run src/utils/requestTransport.test.ts src/utils/backendOriginTransport.test.ts src/utils/transportRouteConstants.test.ts src/utils/endpointUtils.test.ts src/utils/generatedEndpoints.test.ts src/plugins/listenerEndpointClient.test.ts src/state/hooks/terminals/websocketUrl.test.ts src/state/actions/websocketReceive.test.ts`
  - `source activate.sh && ./scripts/go.sh test ./internal/settacli ./internal/sshx ./internal/codeformat -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/httpapi -run '^TestRegisterProjectRoutesCreatesTopLevelPluginLanguageSection$' -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/app -run '^(TestAppPluginLanguageServerRoutesDiagnosticsAndCompletion|TestAppLinkRefreshesPluginLanguageServerRouter)$' -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/mcpx -run '^TestServerListsToolsAndScopesToolCalls$' -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/app -run '^(TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerRegistersPluginBackendMCPTools)$' -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/httpapi -run '^(TestRegisterStateMachineRunRoutesUsesActiveShareSessionForGet|TestRegisterStateMachineRunRoutesBlocksMutationsInShareMode|TestRegisterStateMachineRunRoutesAllowsDeploymentRegistrationWithoutRuntime|TestRegisterAttachmentRoutesIncludesShareSessionForDeployment)$' -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/app -run '^TestAppShareModeServesArtifactOverlayRoutesAndBroadcastsScopedUpdates$' -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/projectstate -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/settacmd -count=1`
  - `source activate.sh && pytest tests/start/test_dev_start.py tests/start/test_dev_script_wiring_structure.py tests/start/test_dev_script_wiring_backend_start.py tests/start/test_module_entrypoint.py -q`
  - `source activate.sh && python -m setta --no-open --workspace /tmp/setta-go-entrypoint-smoke`
    - verified live source-checkout boot reaches the Go server and `Ctrl+C`
      exits without a Python traceback
  - `source activate.sh && pytest tests/start/test_start_server_dispatch.py tests/start/test_start_workspace_validation.py tests/start/test_launcher_cli.py tests/start/test_module_entrypoint.py -q`
  - `./scripts/go.sh test ./internal/config -count=1`
- Failed:
  - `./scripts/go.sh test ./...` when first run without the activated Python env
- Inconclusive / not counted as proof:
  - `source activate.sh && ./scripts/run-playwright-e2e.sh ...` exited after the
    Vite frontend logged repeated `EPIPE` pre-transform errors, so it was not
    used as evidence either way
  - `source activate.sh && ./scripts/run_backend_tests.sh` was still running at
    the time the verdict became certain and was stopped once the blocker set was
    sufficient

### Bottom line

The code audit does show that the default packaged command/server path is now
Go-owned. But the rewrite is not complete with certainty:

- the repo still has active retained Python runtime surfaces, so "all Go" is
  false
- the targeted Go-owned parity blockers found during this audit have been
  repaired, but that does not change the repo-wide incompleteness caused by the
  retained Python runtime ownership

### Follow-up after audit

A follow-up rewrite step repaired the two plugin language-server app tests that
had been failing only because they assumed `project-alpha` already existed in an
otherwise empty IDE runtime. After explicitly seeding the empty project in the
test fixture, both targeted reruns passed.

A second follow-up rewrite step updated the stale app MCP tool-count baselines
to match the canonical `internal/mcpx` server baseline (`79` base tools and
`81` when the fixture plugin contributes two backend MCP tools). The targeted
app and `internal/mcpx` reruns passed.

A third follow-up rewrite step fixed the share-mode artifact startup path. The
app now constructs `chatattachments.Service` whenever a project runtime exists
(including deployment/share mode), and deployment/share registration no longer
requires a state-machine runtime just to boot the app. The targeted
`internal/httpapi` and `internal/app` share-mode reruns now pass.

A fourth follow-up rewrite step repaired the detached-terminal round-trip
behavior in `internal/projectstate` by giving the deterministic detach path a
stable right-of-existing placement rule instead of reusing the general
create-layout aspect-ratio tie-break. The targeted failing test and the full
`internal/projectstate` package now pass.

A fifth follow-up rewrite step moved the default source-worktree reload path off
the Python dev server entrypoint. `frontend/backendStart.sh --reload` now goes
through `python -m setta --reload`, the Go CLI owns `--reload` for the default
start path, and the thin Python entrypoint now prefers the current Go CLI from
a source checkout instead of stale bundled artifacts. The focused Go and Python
reload-wiring tests pass.

A sixth follow-up rewrite step converted `python -m setta.dev_start` into a
compatibility shim that forwards to the Go CLI reload path instead of owning a
Python `uvicorn` server startup flow. The focused start-path Python tests pass.

A seventh follow-up rewrite step fixed the source-checkout `python -m setta`
handoff so the Go CLI receives a runnable `setta-server` companion through
`SETTA_SERVER_BIN` instead of failing on the missing sibling-binary assumption
that only works for packaged installs. The live source-checkout start path now
boots the Go server successfully and exits cleanly on interrupt.

An eighth follow-up rewrite step converted the remaining server-owning
`backend/setta/start.py` default/share/app paths into thin Go dispatch shims
and widened the Go server log-level parser to accept the legacy `CRITICAL`
environment alias that the Python startup path had tolerated. The focused
Python start-surface tests and `internal/config` Go tests pass.

Those follow-up fixes cleared the targeted Go-owned parity blockers found by
this audit and moved the default dev reload path and the explicit
`setta.dev_start` surface onto the Go-owned start path, and they fixed the
source-checkout `python -m setta` companion handoff, but the repo still
remains `Incomplete` because the retained Python runtime surfaces above are
still active supported code paths.

A ninth follow-up rewrite step moved the Python `backend_launcher` surface off
the in-process `uvicorn` server and onto a Go `setta-server` subprocess,
updated the source-checkout server wrapper to build and exec a real
`setta-server` binary, taught Python session pruning to recognize
`setta-server`, and moved `backend/setta/start.py tools` onto Go CLI dispatch.
The focused Python verification now passes for source-checkout module entry,
launcher-backed auth/API flows, the tools shim, and the `setta-server` session
registry regression. This step also exposed a separate remaining rewrite gap:
legacy Python-style `project.json` payloads are still not readable by the Go
project-state runtime, so the launcher auth/API integration fixture was updated
to seed Go-schema registry files in order to verify the launcher/session
handoff itself against the Go-owned persisted contract.

A tenth follow-up rewrite step moved the Go plugin worker runtime/session/spec
boundary off the hardcoded `PythonBinary + "-m setta.plugins.worker"` shape and
onto a generic worker command prefix plus probe validation. The current default
runtime provider still resolves that command prefix to the Python worker, but
the Go launcher/spec plumbing now depends only on "start this worker command"
instead of on a Python-specific subprocess shape. The focused and full
`internal/plugins`, `internal/codegen`, `internal/httpapi`, and
`tests/plugins/test_plugin_worker.py` verification now pass.

An eleventh follow-up rewrite step removed the dead Python plugin HTTP route
module and its direct route tests. The retained listener router endpoint
registry still passes after `backend/setta/routers/__init__.py` stopped pulling
that plugin route surface into the router package import graph, which narrows
the remaining Python plugin blocker to the manager/worker runtime rather than
the old Python HTTP plugin route layer.

A twelfth follow-up rewrite step removed the dead Python plugin MCP tool module
and its direct MCP tool tests. The remaining Python MCP registration/import
checks still pass after `backend/setta/mcp/tools/__init__.py` stopped importing
that plugin tool surface, which further narrows the remaining Python plugin
blocker to the manager/worker runtime rather than the old Python MCP mutation
tool layer.

A thirteenth follow-up rewrite step removed the dead Python websocket fallback
that dispatched listener router endpoint calls into `PluginManager` for
plugin-owned endpoints. The nearby listener endpoint client and
`python_script_receiver` listener tests still pass, which narrows the remaining
Python plugin blocker further toward the manager/worker runtime and the
legacy Python project-state/server wiring that still constructs that manager.
