# Watch Code Standalone Plugin Recovery Plan

## Context

The current branch should be fixed forward from the current commit. Do not roll
back to the pre-pivot commit and do not revert the later commits as a chain.
Those later commits contain useful fixes around provider lifecycle, project
plugin data lifecycle, generated contracts, frontend SDK boundaries, route
contract validation, mode-blocked provider handling, and callable refresh.

The architectural regression to correct is narrower: `setta-watch-code` is
packaged and surfaced like a plugin, but normal Watch Code backend route and
backend UI-setting execution is currently owned by app Go code. The plugin
backend declares the route and setting surfaces, then fails closed with a
Go-host-required response for normal runtime execution. That is not standalone
in the sense needed for a plugin that could be written out-of-tree by someone
who cannot edit Setta core.

`branch_intent.md` and `cumulative_review.md` are review-loop inputs only. Since
this recovery plan does not depend on running the review loop, do not restore or
maintain those files as part of this work.

## Decision

Fix the current branch in place.

Do not:

- roll back to an old commit
- revert the post-pivot commits wholesale
- restore `branch_intent.md`
- restore `cumulative_review.md`
- re-add removed Watch Code enabled state or a `/watch-code/enabled` route

## Standalone Definition

`setta-watch-code` is standalone only if a third-party plugin author could build
the same kind of Watch Code provider out of tree using published host APIs,
published generated contracts, and published Python/frontend SDK surfaces.

For this recovery, that means:

- Core Go may own the Watch Code engine, validation, generated contracts,
  provider selection, service lifecycle, and generic plugin hosting.
- Core Go may expose narrow, published local-core or SDK commands that a plugin
  backend can call.
- Core Go must not execute Watch Code plugin HTTP route business logic on behalf
  of the plugin.
- Core Go must not execute Watch Code backend UI-setting read/write business
  logic on behalf of the plugin.
- The plugin backend must handle its registered backend runtime requests for the
  active provider and call published commands for the Go-owned engine work.
- The plugin frontend must continue to use generic plugin host APIs such as
  project plugin-data reads/subscriptions and backend route fetches.
- The public route shape remains the current extracted shape:
  `/plugins/<pluginId>/watch-code/inputs`.
- The backend UI settings remain the current plugin-scoped settings:
  `plugin::<providerPluginId>::folders` and
  `plugin::<providerPluginId>::files`.

## Current Failure Shape

The recovery is specifically meant to remove this shape:

- `internal/app/watch_code_plugin_backend_routes.go` parses
  `/plugins/<pluginId>/watch-code/*` and performs Watch Code mutations and
  backend UI-setting reads/writes in app-owned Go code.
- `plugins/setta-watch-code/backend/main.py` returns
  `Watch Code mutations are handled by the active Setta Go host.` for normal
  runtime execution.
- The previous narrow Python/local-core Watch Code mutation surface was deleted,
  leaving the plugin backend without a standalone execution path.

## Target Shape

### Host/Core

The host should provide only these Watch Code-specific responsibilities:

- discover and select exactly one active probed Watch Code provider
- keep provider fail-closed states for missing, disabled, invalid,
  pending-restart, conflicting, or mode-blocked providers
- own the Watch Code engine and project-state mutation correctness
- own Go-generated route suffix, UI-setting ID, handler ID, error code, and
  schema-version contracts
- expose a narrow published command surface for plugin backends to invoke the
  Go-owned engine
- route registered plugin backend runtime requests through the generic plugin
  backend dispatcher

The host may reject a route or UI-setting operation before dispatch when the
target plugin is not the active valid Watch Code provider. If the request is for
the active valid provider, execution must enter the plugin backend rather than a
Watch Code-specific app interceptor.

### Plugin Backend

`plugins/setta-watch-code/backend/main.py` should:

- keep emitting the backend probe contract for Watch Code provider metadata,
  the `inputs` route, and the `folders`/`files` UI settings
- decode normal backend runtime `http` requests for the `inputs` route
- decode normal backend runtime `ui_setting` reads and writes for `folders` and
  `files`
- call published local-core or SDK commands for the actual Go-owned state and
  engine work
- return normal success/error responses from its own runtime path
- reserve Go-host-required failures only for truly missing host capability, not
  as the normal implementation

The command surface should be narrow and current-state-specific. It should not
restore broad `setta.plugin_runtime.local_core` compatibility. Likely commands:

- `watch_code_get_project_data`
- `watch_code_set_inputs`
- `watch_code_set_folders`
- `watch_code_set_files`

The exact names can be generated from Go-owned constants, but the behavior must
preserve the existing correctness guarantees:

- strict input decoding
- existing project scope required
- provider plugin ID required
- folder and file writes preserve sibling values through owner-level mutations
- project snapshots, websocket updates, frontend op status, Watch Code service
  config, and ignored-root policy stay consistent

### Frontend

The plugin frontend should keep the current generic shape:

- read project data through `readProjectState({ kind: "pluginData", pluginId })`
- subscribe to plugin data through the generic host API
- call `fetchBackendRoute("/watch-code/inputs")`
- use generated Watch Code backend constants rather than handwritten route or
  setting strings
- keep the old enabled route/state absent

## Workstreams

### 1. Add Executable Guardrails

Add tests before or alongside the ownership fix so the wrong architecture cannot
look complete again.

Guardrails should prove:

- the first-party Watch Code plugin backend runtime handles normal `http`
  requests for `/plugins/<pluginId>/watch-code/inputs`
- the first-party Watch Code plugin backend runtime handles normal `ui_setting`
  read/write requests for `folders` and `files`
- normal plugin backend runtime execution does not return the Go-host-required
  message
- app/core code does not contain a Watch Code-specific plugin route executor for
  accepted active-provider requests
- the removed `/watch-code/enabled` route remains rejected

Prefer production-path tests. Avoid tests that only restate implementation
details or bypass the plugin runtime path being protected.

### 2. Publish The Narrow Command Surface

Reintroduce a narrow plugin-callable Watch Code command surface from Go-owned
contracts. Keep it current to the branch:

- no enabled command
- no broad generic local-core compatibility module
- no old route aliases
- no migration or dual-read behavior for old top-level Watch Code fields

Generated Python constants/helpers should come from Go-owned metadata, not from
hand-maintained Python mirrors.

### 3. Move Execution Back Into The Plugin Backend

Update `plugins/setta-watch-code/backend/main.py` so accepted active-provider
runtime requests are executed by the plugin backend. The backend should use the
published command surface for state reads and mutations.

The plugin backend should own:

- request body decoding for its public plugin route
- mapping route requests to narrow commands
- mapping backend UI-setting handlers to narrow commands
- response shape for its plugin-owned route
- normal plugin runtime errors

### 4. Remove The App-Owned Route/UI-Setting Executor

Remove or shrink `internal/app/watch_code_plugin_backend_routes.go` so it no
longer owns accepted Watch Code plugin route or backend UI-setting execution.

Keep generic/provider-level fail-closed behavior where it belongs, but do not
handle active-provider Watch Code route bodies or setting values in app-owned
interceptor code.

### 5. Preserve The Useful Post-Pivot Fixes

Carry forward the useful behavior added after the pivot:

- provider fail-closed statuses
- mode-blocked provider handling
- complete backend route-contract validation
- project-scoped plugin data lifecycle behavior
- provider change service reconciliation
- folder/file sibling preservation
- generated contract ownership
- frontend SDK boundary cleanup
- callable refresh behavior

If a test currently asserts app-owned execution, update it to assert the same
behavior through plugin backend execution.

## Verification

Run focused tests first:

- `./scripts/go.sh test ./internal/plugins`
- `./scripts/go.sh test ./internal/app -run 'WatchCode|PluginBackend|UISetting'`
- `./scripts/go.sh test ./internal/watchcodecontracts ./internal/pythonsharedconstants`
- `source activate.sh && pytest tests/plugin_runtime/test_watch_code_plugin_backend.py -q`
- `source activate.sh && pytest tests/start/test_packaged_distribution.py -k watch_code -q`
- `pnpm --dir plugins/setta-watch-code/frontend run test`
- `pnpm --dir plugins/setta-watch-code/frontend run typecheck`
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts`

Then run generation/cleanup and full current-change verification:

- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Run Playwright or CDP only if rendered Watch Code frontend behavior changes.
