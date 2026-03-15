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
- The legacy Python `SettaFastAPIState` no longer constructs or boots the
  Python plugin manager/runtime during IDE/share/app startup:
  - `backend/setta/server_state.py`
  - plugin runtime registration state is no longer sourced from a Python
    plugin manager on that legacy Python server-state path
- The legacy Python `BaseProjectManager` no longer owns plugin codegen target
  validation or plugin codegen output materialization/cache state:
  - `backend/setta/project_state/base_project_manager.py`
  - the remaining Python project-state path now treats plugin codegen targets
    as opaque config payloads instead of running a duplicate Python-side plugin
    codegen runtime
- The frontend transport helpers and active websocket callers point at the Go
  route helpers rather than legacy Python routes:
  - `frontend/src/utils/transportRouteConstants.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/state/hooks/terminals/terminal.ts`
- Schema-backed plugin UI settings are now Go-owned on the MCP path:
  - `internal/uisettings/plugins.go`
  - `internal/mcpx/ui_setting_tools.go`
  - active plugin setting search/read/write now resolve through Go plugin
    runtime/config APIs instead of the old Python plugin UI-setting registry
- The old Python-backed plugin listener-endpoint surface is gone:
  - `backend/setta/plugins/worker.py` no longer registers listener endpoints
  - `internal/plugins` no longer captures or invokes plugin listener endpoints
  - `/ws/listeners/{listenerID}` now serves retained Python listeners and
    built-in listener endpoints only, not plugin-defined endpoint dispatch
- The old Python-backed plugin backend static-dir surface is gone:
  - `backend/setta/plugins/worker.py` no longer registers static dirs
  - `internal/plugins` no longer captures backend static-dir registrations
  - `/plugin-static/{pluginId}/...` is no longer part of the active root route
    inventory

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
explicit retained boundary list, most notably the still-in-tree Python plugin
worker implementation/runtime path in `backend/setta/plugins/worker.py`. The
deleted Python plugin-management path in `backend/setta/plugins/manager.py`,
the removed plugin listener-endpoint path, the old top-level Python FastAPI
app, the removed backend static-dir path, the old `setta.dev_start` shim, the
old source-only Python startup/CLI helper surfaces, the legacy Python
server-state startup path, the legacy Python project-state plugin-codegen
owner, and the removed plugin language-server runtime/app/UI surface are no
longer part of that blocker set, and schema-backed plugin UI settings are no
longer part of that blocker set either.

### Test and smoke evidence executed

- Passed:
  - `source activate.sh && python -m setta version`
  - `pnpm -C frontend exec vitest run src/utils/requestTransport.test.ts src/utils/backendOriginTransport.test.ts src/utils/transportRouteConstants.test.ts src/utils/endpointUtils.test.ts src/utils/generatedEndpoints.test.ts src/state/hooks/terminals/websocketUrl.test.ts src/state/actions/websocketReceive.test.ts`
  - `source activate.sh && ./scripts/go.sh test ./internal/settacli ./internal/sshx ./internal/codeformat -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/httpapi -run '^TestRegisterProjectRoutesCreatesTopLevelPluginLanguageSection$' -count=1`
  - `source activate.sh && ./scripts/go.sh test ./internal/app -run '^(TestAppServesPluginRuntimeWithoutRemovedBackendRegistrations|TestAppLinksPluginRoutesAndServesRuntime|TestAppPluginRestartClearsPendingBackendPluginState|TestAppLinkedPluginCodegenTargetsStayUnavailableAfterLink)$' -count=1`
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
  - `source activate.sh && pytest tests/server_state/test_share_state.py tests/server_state/test_launcher_state.py -q`
  - `source activate.sh && pytest tests/server_state -q`
  - `source activate.sh && pytest tests/share/test_policy.py tests/routers/test_share_dependencies.py -q`
  - `source activate.sh && pytest tests/routers/test_share_websocket_requirements.py -q`
  - `source activate.sh && python -m py_compile backend/setta/server_state.py tests/server_state/test_share_state.py tests/server_state/test_launcher_state.py`
  - `source activate.sh && pytest tests/project_state/test_codegen_targets.py -q`
  - `source activate.sh && pytest tests/project_state -q`
  - `source activate.sh && python -m py_compile backend/setta/project_state/base_project_manager.py tests/project_state/test_codegen_targets.py`
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

A second follow-up rewrite step updated the stale app MCP tool-count baseline
to match the canonical `internal/mcpx` server baseline (`79` base tools). The
targeted app and `internal/mcpx` reruns passed.

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

A fourteenth follow-up rewrite step removed Python plugin-manager/runtime boot
from the legacy `SettaFastAPIState` server stack. `backend/setta/server_state.py`
no longer constructs `PluginManager`, no longer loads backend plugins during
IDE/share/app startup, and no longer threads plugin-provided language servers
or external-agent adapters through that Python server-state path. The direct
legacy tests that only existed to enforce Python plugin startup from
`SettaFastAPIState` were removed, and the remaining server-state/share-mode
tests still pass. This narrows the remaining Python plugin blocker away from
the deleted server-state startup owner and toward the standalone plugin
manager/worker modules plus the project-state/UI-setting surfaces that still
depend on them.

A fifteenth follow-up rewrite step removed the duplicate Python plugin-codegen
owner from `backend/setta/project_state/base_project_manager.py`. The legacy
Python project-state runtime no longer validates plugin codegen registrations,
no longer materializes plugin codegen outputs under `plugin_codegen/`, and no
longer maintains Python-side plugin codegen cache/fingerprint state. The direct
Python project-state plugin-codegen tests were removed, and the focused plus
full `tests/project_state` suites still pass. This narrows the remaining Python
plugin blocker away from project-state/codegen and further toward the
standalone plugin manager/worker modules plus the Python UI-setting/plugin-pane
surface that still depends on them.

A sixteenth follow-up rewrite step moved schema-backed plugin UI settings onto
the Go-owned MCP/runtime path. `internal/uisettings/plugins.go` now builds
plugin UI-setting registry entries directly from Go plugin runtime/config
schema data, `internal/mcpx/ui_setting_tools.go` now resolves scoped registries
through that Go plugin runtime, and the old Python plugin UI-setting registry
is no longer required for active plugin setting search/read/write behavior.
Focused `internal/uisettings`, `internal/mcpx`, and `internal/app` UI-setting
tests now pass, including schema-backed plugin search/read/write and
plugin-unavailable vs setting-not-found behavior. This narrows the remaining
Python plugin blocker away from UI-setting flows and further toward the
standalone Python plugin manager/worker runtime itself.

A seventeenth follow-up rewrite step removed dead Python `plugin_manager`
threading from the legacy project-manager stack. The Python share/session
project-manager path no longer accepts or stores a plugin manager through
`BaseProjectManager`, `SessionProjectManager`, or `ProjectManagerSwitcher`, and
the dead tests that only asserted that constructor plumbing were removed. The
focused `tests/project_state` and broader share/server-state checks still pass.
This narrows the remaining Python plugin blocker away from ancillary
project-manager wiring and leaves the standalone Python plugin manager/worker
runtime as the primary remaining backend-ownership tail in this area.

An eighteenth follow-up rewrite step removed the dead `plugin_manager` field
from the legacy Python `SettaFastAPIState`. That server-state object no longer
pretends to expose a Python plugin runtime slot during startup, and the focused
launcher/share-state plus Python MCP registration tests still pass. This does
not remove the standalone Python plugin manager/worker runtime itself, but it
does eliminate one more stale ownership hint from the deleted Python server
stack.

A nineteenth follow-up rewrite step cut plugin-owned behavior out of the legacy
Python UI-setting stack. `backend/setta/ui_settings/registry.py` now builds a
core-only registry, `backend/setta/mcp/tools/ui_settings.py` now treats
plugin-style setting ids as ordinary unknown-setting misses instead of routing
through Python plugin runtime availability checks, and the focused Python
UI-setting plus MCP verification still passes. This removes the old Python
UI-setting registry/tools from the remaining plugin blocker set and narrows the
active backend-ownership tail further toward the standalone Python plugin
manager/worker runtime itself.

A twentieth follow-up rewrite step deleted the now-dead plugin-runtime
implementation block from `backend/setta/ui_settings/registry.py` itself. The
legacy Python registry file no longer imports plugin-runtime types, no longer
contains schema/backend plugin UI-setting builders, and no longer carries local
plugin availability/config traversal helpers that the core-only path cannot
reach. The focused Python UI-setting and MCP verification still passes, which
confirms that this block had become dead compatibility baggage rather than an
active retained boundary.

A twenty-first follow-up rewrite step removed the last stale plugin-runtime
guard from `backend/setta/mcp/tools/ui_settings.py`. The legacy Python reveal
path no longer tries to call an undefined plugin-runtime support helper before
revealing a setting, which matches the core-only registry it now uses. The
focused Python MCP/UI-setting verification still passes after that cleanup.

A twenty-second follow-up rewrite step narrowed the Python plugin package
surface itself. `backend/setta/plugins/__init__.py` no longer exports
`PluginManager`, and the direct agentic integration tests that only exercised
the dead Python `PluginManager` -> external-agent-runner path were removed.
The surrounding external-agent runner, preflight, and route suites still pass,
which confirms the retained Python agentic surface does not depend on that
plugin-manager export.

A twenty-third follow-up rewrite step deleted the dead Python plugin-manager
implementation itself. `backend/setta/plugins/manager.py`,
`backend/setta/plugins/errors.py`, and the dedicated
`tests/plugins/test_plugin_manager.py` suite are gone, and the remaining plugin
worker plus surrounding agentic suites still pass. This removes the standalone
Python plugin manager from the blocker set and leaves the Python plugin worker
implementation as the primary remaining backend-ownership tail in this area.

A twenty-fourth follow-up rewrite step removed the live CLI scaffolding path
that still generated new Python backend plugins. `internal/plugins/authoring.go`
no longer accepts `--template backend`, `--template full` now scaffolds only
frontend + content files, the generated `pyproject.toml` no longer packages
`backend/*.py`, and the canonical authoring docs now stop directing users to
`backend/entrypoint.py`. Focused `internal/plugins` and `internal/settacmd`
tests pass after moving the restart-required regression check onto the existing
backend fixture instead of a generated backend scaffold. This does not remove
the remaining Python plugin worker runtime, but it does stop the active Go CLI
from creating new Python backend authoring surfaces while that runtime tail is
being removed.

A twenty-fifth follow-up rewrite step removed dead plugin UI-setting support
from the retained Python worker runtime. `backend/setta/plugins/worker.py` no
longer advertises `host.register_ui_setting` or
`plugin.invoke_ui_setting_handler`, no longer stores Python-side UI-setting
handler tables, and no longer exposes `register_ui_setting(...)` on the worker
plugin context. The unused `PluginRegisteredUISetting` model was also removed
from `backend/setta/plugins/models.py`, and the dedicated Python worker tests
for that dead path were deleted. This does not change the remaining blocker
status, because plugin UI settings were already Go-owned, but it narrows the
Python worker runtime to the still-live route/MCP/codegen/language-server/
external-agent surface.

A twenty-sixth follow-up rewrite step removed the Python worker's
`handshake.override.json` test hook. `backend/setta/plugins/worker.py` now
emits only the real handshake payload, the dedicated Python worker tests for
override parsing/application are gone, the launcher integration test no longer
depends on mutating a production worker hook to force a mismatch, and the dead
handshake-failure fixture directories were removed from
`tests/fixtures/plugins/`. Typed handshake mismatch coverage remains in the Go
`decodeWorkerHandshake` tests, but the retained Python worker runtime no longer
contains a production path that exists only for those tests.

A twenty-seventh follow-up rewrite step removed more dead Python worker-context
API surface. `backend/setta/plugins/worker.py` no longer exposes the
`deployment_mode` convenience property or the unsupported
`register_startup_task` / `register_shutdown_task` stubs, and the focused
Python worker tests now only assert the still-live context fields and still-live
registration failures. This does not change the blocker verdict, but it narrows
the retained Python worker boundary away from non-functional compatibility
helpers and closer to the real route/MCP/codegen/language-server/external-agent
runtime that still needs replacement.

A twenty-eighth follow-up rewrite step removed the Python worker's mode and
capability introspection contract. `backend/setta/plugins/worker.py` no longer
accepts `--server-mode`, `--requested-capability`, or
`--effective-capability`, and the worker plugin context no longer exposes those
values back to Python plugin code. The focused Python worker test that existed
only to assert that metadata echo path was removed, and the Go worker-session /
worker-RPC wiring now passes capability enforcement only through the Go host
context instead of feeding a dead Python-side convenience API. This keeps the
Go runtime's real capability filtering/status tracking intact while narrowing
the remaining Python worker runtime away from authoring-time introspection
helpers.

A twenty-ninth follow-up rewrite step removed another dead Python worker
convenience field. `backend/setta/plugins/worker.py` no longer accepts
`--plugin-root`, and the Python worker plugin context no longer exposes
`plugin_root`; the subprocess never used that path for real runtime behavior.
The Go worker host still keeps the plugin root in its own worker context for
relative path resolution, but the Python subprocess/test wiring no longer feeds
that dead authoring-only field into the worker process.

A thirtieth follow-up rewrite step removed the Python-backed plugin route
surface outright. `backend/setta/plugins/worker.py` no longer supports
`register_router(...)` or `plugin.invoke_route`, the Go plugin runtime no
longer starts or proxies plugin backend routes, the `/api/plugins/{pluginId}`
transport was deleted, and the frontend `host.apiFetch(...)` helper plus its
fixture and Playwright coverage were removed. The remaining Python plugin
worker blocker is now narrower: real backend ownership is limited to the
retained worker capability clusters that still exist in `worker.py`, not any
route transport surface.

Subsequent follow-up rewrite steps removed two more dead Python worker
transport boundaries. `backend/setta/plugins/worker.py` no longer registers
static dirs or emits listener dependency events, the Go plugin runtime no
longer captures either surface, and the Go app / backend-route / codegen
runtime wiring no longer threads plugin-specific listener-producer state into
worker hosts just to support the deleted listener-event bridge. The focused
real-worker Go and Python tests then validated the retained worker boundary
through MCP-tool registration and invocation.

A later follow-up rewrite step removed the plugin-defined backend MCP-tool
surface outright. The dedicated Go `BackendRouteRuntime` / `BackendRuntimeHolder`
path is gone, the Python worker no longer advertises `host.register_mcp_tool`
or `plugin.invoke_mcp_tool`, the backend MCP fixture was deleted, and the app
no longer hot-swaps plugin-defined MCP registrations into the authenticated Go
MCP server. The remaining Python plugin worker blocker is narrower again: live
backend ownership is now limited to codegen targets, language servers,
external-agent adapters, and project-state reads.

A later follow-up rewrite step removed the Python worker `read_project_state`
path as well. The worker no longer advertises `host.read_project_state`, the
Go worker host no longer carries a project-state reader service just for backend
plugins, and the dedicated project-state-reader helper plus worker-specific
tests were deleted. The remaining Python plugin worker blocker is narrower
again: live backend ownership is now limited to codegen targets, language
servers, and external-agent adapters.

A later follow-up rewrite step removed the Python worker
`register_external_agent_adapter` path as well. The worker no longer
advertises that host RPC, the Go worker host/runtime no longer normalizes or
captures plugin external-agent adapter registrations, and the direct plugin
runtime/app/plugin worker coverage for that backend plugin surface was deleted.
The remaining Python plugin worker blocker is now limited to codegen targets
and language servers.

A later follow-up rewrite step then removed the dead plugin external-agent
config and executor mode around that deleted worker surface. Go no longer
accepts `toolType=plugin` or `pluginAdapterId` in the active external-agent
config contract, the preflight/runtime path no longer resolves plugin adapter
metadata, the plugin executor branch was deleted, and the generated frontend
bindings no longer advertise plugin external-agent settings. That cleanup did
not remove a live worker capability cluster by itself; it removed the dead Go
product/config surface that still exposed the already-deleted plugin
external-agent path. The remaining Python plugin worker blocker is still
limited to codegen targets and language servers.

A later follow-up rewrite step removed the active plugin-codegen app/runtime/UI
surface as well. The Go app no longer materializes plugin codegen outputs on
save/run, `setProjectConfigCodegenTargets` now rejects non-Python languages
over HTTP, app-authenticated MCP, and the MCP tool-call route, plugin runtime
status no longer loads or surfaces backend codegen registrations, the
RunInstructions and PluginsPane callers no longer expose plugin codegen target
selection or registration UI, and the dedicated Playwright coverage for plugin
codegen target selection was deleted. After that slice, the remaining Python
plugin worker blocker is limited to language servers.

A later follow-up rewrite step removed the active plugin language-server
surface too. The Go app no longer loads plugin-supplied additional LSP specs
at startup or after plugin mutations, the plugin manifest/runtime contract no
longer retains `registerLanguageServer` or `registeredLanguageServers`, the
language-server-only plugin fixtures were deleted, and the PluginsPane plus the
dedicated plugin language-server Playwright coverage no longer present that
path as an active product feature. That removes the last active plugin-worker
language-server product/runtime surface even though the transitional Python
worker implementation still remained in-tree for cleanup.

A later follow-up rewrite step then removed the dead plugin-worker
language-server registration machinery itself. The Python worker no longer
advertises `host.register_language_server`, the Go worker host no longer
accepts or normalizes language-server registrations, the old backend
registration loader/runtime overlay was deleted, and plugin runtime/status now
hardcode empty backend-registration arrays instead of loading worker-backed
language-server data. After that slice, the remaining Python plugin-worker
cleanup is no longer language-server related; it is limited to the separate
codegen-target worker machinery that still exists in-tree.

A later follow-up rewrite step then removed that remaining plugin-worker
codegen-target machinery too. The transitional Python worker module
`backend/setta/plugins/worker.py` was deleted, along with the Go worker
session/launcher/RPC/runtime/codegen-resolver stack and the dedicated Python
worker tests. The only shared pieces carried forward from that deletion are the
small capability-normalization helpers still used by plugin discovery and
authoring. After that slice, the rewrite no longer has any live Python plugin
worker/runtime owner. The remaining cleanup in this area is narrower: stale
plugin-codegen manifest/schema/model/fixture metadata still advertises
`registerCodegenTarget` even though the runtime behind that capability is gone.

A later follow-up cleanup slice removed that stale `registerCodegenTarget`
advertising too. The plugin manifest capability lists in Go/Python no longer
accept it, the dead backend-codegen and worker-failure codegen fixtures were
deleted, the Playwright/plugin-pane expectations were updated to current
capabilities, and the shared Playwright seed script no longer injects deleted
backend plugin fixtures into test workspaces. The remaining rewrite tail is no
longer the deleted plugin codegen capability itself; it is whatever broader
dead backend-plugin metadata still remains elsewhere in the tree.

A later follow-up cleanup slice removed two more dead backend-plugin manifest
capabilities that no longer had any runtime owner at all:
`registerListenerEndpoint` and `registerStaticDir`. The plugin manifest
schemas/models and the Go capability normalization path no longer advertise
either one, and the stale fixture-linking example no longer points at the
already-removed backend static-router path. The remaining dead backend-plugin
tail is now centered on the old plugin external-agent adapter surface.

A later follow-up cleanup slice removed the last active plugin-runtime/status
advertising for that deleted external-agent path. The Go capability
normalization path no longer accepts `registerExternalAgentAdapter`, the
plugin runtime/status transport and generated frontend bindings no longer carry
`registeredExternalAgentAdapters`, and the `PluginsPane` no longer renders or
tests an external-agent registration block for plugins. After that slice, the
remaining rewrite tail in this area is no longer the active Go/frontend
contract; it is the legacy Python external-agent adapter runtime and tests
that still exist in-tree.

A later follow-up cleanup slice then removed that legacy Python plugin
external-agent adapter runtime as well. The Python external-agent types no
longer define `toolType=plugin` or `pluginAdapterId`, the dedicated
plugin-process adapter module and plugin-branch registry logic were deleted,
the Python preflight/runner/router stack no longer threads plugin adapter
registrations through health checks or run startup, and the dedicated plugin
external-agent tests plus fixture plugin were removed. After that slice, the
old plugin external-agent path is gone from both the active Go contract and
the remaining Python backend code.

A later follow-up cleanup slice removed the broad dead Python router stack
outside the retained listener-endpoint modules. The legacy Python HTTP/router
files for launch, launcher-home, bootstrap, frontend/share websocket routes,
MCP tools, AI/agentic, file/artifact/git, app-deployment/share-deployment,
settings/projects/sections/runs, and related helper modules were deleted along
with their direct route/auth test suites. `backend/setta/routers/__init__.py`
is now a narrow package marker instead of importing the whole old route graph,
and `backend/setta/listeners/listener_router_endpoint_registry.py` now imports
only the retained `project_manager`, `terminals`, `listener`, and `lsp`
modules directly. After that slice, the remaining Python rewrite blocker is no
longer the deleted route transport surface; it is the narrower legacy
`SettaFastAPIState` / `backend/setta/websockets/**` / Python project-state
support tail that still exists behind retained listener/share behavior.

A later follow-up cleanup slice removed the dead Python CLI websocket path as
well. The stub `WMHCLISender`/`WMHCLIReceiver` classes were deleted, the legacy
`SettaFastAPIState` no longer constructs CLI websocket handlers, Python
`RunCodeRequest` no longer carries `cliId`, the Python terminal run path no
longer branches on CLI output transport, and the old `/cli` websocket route
constants were removed from the Python route enum. After that slice, the
remaining Python backend tail no longer includes a dormant CLI transport path;
it is the broader server-state/websocket-support and Python project-state
runtime still carried for retained listener/share behavior.

A later follow-up cleanup slice removed the dead Python inbound websocket
receiver stack and the old Python listener-coverage path. The legacy
`WMHFrontendReceiver`, `WMHPythonScriptReceiver`, and
`ListenerCoverageTracker` modules were deleted, `SettaFastAPIState` no longer
constructs those receiver objects during IDE/share/app startup, the old Python
`route_get_listener_coverage` route was removed from
`backend/setta/routers/listener.py`, and the Python frontend sender no longer
broadcasts listener-coverage snapshots from that deleted path. After that
slice, the remaining Python websocket tail is narrower again: it no longer
includes old inbound websocket message handling, and is now centered on the
still-live outbound listener/share support plus the broader legacy
`SettaFastAPIState` and Python project-state wiring.
