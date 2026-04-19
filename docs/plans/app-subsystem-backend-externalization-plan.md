# App-Subsystem Backend Externalization Plan

## Summary

The previous first-party plugin finalization work solved an important but
narrower problem:

- core and generated code no longer import
  `setta/plugins/setta-json-render-app-gen/...`
- shared app-subsystem contracts moved to neutral `internal/appsubsystem/...`
  packages
- the frontend/runtime surface loads the app subsystem like a real plugin

That work did **not** finish the stronger goal of making
`setta-json-render-app-gen` a truly standalone backend plugin.

Today the app subsystem is still backend-owned inside core:

- production code blank-imports `internal/appsubsystemproviders/builtin`
- `internal/appsubsystemproviders/builtin/...` still implements the app
  provider
- `plugins/setta-json-render-app-gen/runtime_backend/main.py` is still a
  placeholder
- the packaged plugin still does not own the real backend behavior

This plan finishes the actual remaining job: remove the compiled-in builtin app
provider and make the plugin package own the backend contribution path too.

## Why The Previous Plan Was Not Enough

The previous plan defined completion as:

- remove direct imports of the repo-root plugin package path from core
- neutralize shared contracts and generated imports
- prove unknown-id provider selection for the already-generic surfaces
- tighten guardrails against reintroducing plugin-package-path imports

That was worthwhile, but it still allowed this shape:

- core app imports a builtin provider package
- builtin provider package registers plugin id `setta-json-render-app-gen`
- plugin package ships frontend assets and a placeholder backend entrypoint

In plain language, that means the backend feature still lives in the wall while
the plugin package mostly provides the label on the socket.

## Current State

What is already correct and should stay correct:

- shared Go-owned app-subsystem contracts live under neutral
  `internal/appsubsystem/...` owner paths
- core/runtime frontend code does not import repo-root plugin source directly
- plugin frontend bundles load from runtime metadata
- package-manager-installed and linked plugin packaging for the app frontend
  already work

What is still wrong:

- `internal/appsubsystemproviders/builtin_import.go` keeps a compiled-in app
  provider alive in production
- `internal/appsubsystemproviders/builtin/...` still owns route wiring, MCP
  tools, UI settings, publish behavior, and deployment registration
- runtime provider validity still depends on in-process registration side
  effects instead of a plugin-owned backend contract
- `plugins/setta-json-render-app-gen/runtime_backend/main.py` still returns
  empty probe data and placeholder runtime responses

## Actual Finish Line

This plan is complete only when all of the following are true:

- no production code blank-imports or otherwise depends on
  `internal/appsubsystemproviders/builtin`
- no production implementation remains under
  `internal/appsubsystemproviders/builtin/...`
- the app plugin package owns the app-subsystem backend contribution surface at
  runtime
- host discovery and dispatch use generic plugin discovery plus a generic
  backend contract, not a compiled first-party provider registry
- a linked app plugin and a package-manager-installed app plugin both work
- an unknown-id app-subsystem plugin can exercise the same backend contract
- disabling or removing the app plugin removes the app subsystem; there is no
  builtin fallback

## Hard Requirements

- This is a clean cutover. Do not add backward compatibility shims, legacy
  support, migrations, dual registration paths, builtin fallbacks, or temporary
  bridges just to preserve the current builtin provider.
- Do not add migration steps, rollout windows, one-time conversion helpers, or
  compatibility toggles. The target state should replace the current builtin
  path directly.
- Keep shared Go-owned contracts, validation types, frontend value exports, and
  endpoint shapes on neutral owner paths under `internal/appsubsystem/...`.
- The host may know the app-subsystem feature family and its public contracts,
  but it must not compile in a concrete first-party provider implementation.
- Provider validity must come from generic plugin discovery plus backend
  registration/probe validation, not from a builtin package calling
  `RegisterBackendProvider()` during init.
- Package-manager-installed app plugins must work without requiring a developer
  `go` toolchain on the target machine just to activate the backend provider.
- Do not solve this by moving correctness-sensitive app-subsystem semantics into
  duplicated Python or TypeScript logic. Keep Go authoritative and delegate when
  needed.
- `setta[defaults]` and the language-server defaults/bootstrap model stay
  intact. Those defaults/distribution concerns are not the blocker here.

## Non-Goals

- Reopening already-landed frontend extraction work unless a new audit proves a
  regression.
- Reintroducing repo-local imports of `setta/plugins/setta-json-render-app-gen`
  into production code.
- Preserving the builtin provider package as a dormant or fallback path.
- Adding migration steps, compatibility windows, or rollout toggles.
- Renaming first-party plugin ids or changing defaults-profile policy.
- Moving neutral shared contracts back into the plugin package.
- Requiring end users to install a Go toolchain in order to use a pip-installed
  app plugin.

## Concrete Decisions

### 1) The builtin app provider must be deleted, not merely ignored

The finish line is not "core stops importing the plugin package path."

The finish line is:

- no production `internal/appsubsystemproviders/builtin_import.go`
- no production `internal/appsubsystemproviders/builtin/...`
- no production first-party init registration for the app provider

Tests and docs may still mention the old path while the refactor is landing,
but production ownership must leave core entirely.

### 2) The packaged app plugin must own a real backend runtime

The current plugin wheel ships a placeholder backend entrypoint:

- `plugins/setta-json-render-app-gen/runtime_backend/main.py`

That is not enough.

The packaged plugin must ship a real backend implementation surface that can be
linked from source and installed from a wheel.

### 3) Do not require a developer Go toolchain for installed plugin flows

Normal Go plugin backends in this repo build from source via the local `go`
binary. That is acceptable for fixtures and some dev flows, but it is not an
acceptable finish line for the packaged app plugin.

The expected implementation path is:

- keep the packaged app plugin backend on a packaged runtime entrypoint
  (`runtime_backend/main.py` or an equivalently packaged runtime path)
- if that runtime needs Go-owned semantics, extend an explicit Go-backed local
  delegation surface such as `sdk-local-core`

Do not switch the app plugin to `backend/main.go` unless the packaged
package-manager-installed flow still works without a developer `go` toolchain.

### 4) Host-owned shapes, plugin-owned behavior

The host may continue to own:

- public HTTP/OpenAPI route shapes
- shared request/response contracts
- shared MCP tool schemas and metadata when those are genuinely canonical
- deployment startup envelopes and generic runtime plumbing

The plugin backend must own the actual provider behavior behind those shapes.

If the host currently calls a builtin Go service directly, replace that with a
generic runtime-backed adapter.

### 5) If Python plugin code needs Go semantics, use explicit Go delegation

If the packaged backend runtime is Python and it needs:

- app-definition validation
- app-spec normalization
- publish preparation
- deployment content preparation
- other correctness-sensitive local behavior

then extend Go-backed delegation surfaces such as:

- `internal/pythonsdklocalcore`
- `internal/settacmd/sdk_local_core.go`
- `backend/setta/api/local_core.py`
- generated SDK contracts/constants

Do not reimplement those semantics by hand in Python just to make the plugin
"self-contained."

### 6) Unknown-id providers must use the same contract

The unknown-id app-subsystem fixture must stop being frontend-only proof.

The same generic backend contract used by the first-party plugin must also work
for:

- linked unknown-id providers
- package-manager-installed unknown-id providers
- disabled, invalid, and conflicting provider states

## Workstreams

### 1) Replace builtin provider validity with a generic plugin-backend contract

Targets:

- `internal/plugins/runtime.go`
- `internal/plugins/app_subsystem_registry.go`
- `internal/appsubsystem/provider.go`
- plugin capability/probe/runtime discovery paths
- any generated metadata that still assumes a compiled-in provider registry

Implementation direction:

- stop treating an app-subsystem plugin as valid only because a builtin package
  registered it during process init
- define provider validity from plugin discovery plus backend registration or
  probe validation
- reuse existing plugin backend capability machinery where it fits, but add an
  explicit app-subsystem backend contract if the current probe/runtime surfaces
  are not enough
- keep `internal/appsubsystemproviders/discovered_providers_gen.go` only if it
  remains pure metadata derived from plugin manifests rather than a compiled-in
  implementation registry

Verification:

- focused runtime/discovery tests for active, disabled, invalid, and conflicting
  providers
- focused generator tests only if emitted metadata changes

### 2) Introduce a generic runtime-backed app-subsystem host adapter

Targets:

- `internal/appsubsystem/provider.go`
- app-definition host flows
- app deployment host flows
- MCP tool registration flows
- scoped UI setting flows
- publish/deployment registration flows

Implementation direction:

- route app-subsystem behavior through a generic adapter that dispatches to the
  selected plugin backend
- keep shared contracts and route/tool shapes Go-owned and neutral
- if the plugin backend is Python, extend explicit local-core delegation for the
  Go-owned semantics instead of duplicating behavior in Python
- reuse existing generic plugin backend runtime surfaces such as plugin MCP
  tools or plugin UI settings where they fit cleanly, but do not hide the
  finish line behind repo-local first-party exceptions

Verification:

- focused Go and Python tests for app-definition reads/writes/validation
- focused tests for MCP tool registration and execution
- focused tests for app publish and app deployment runtime behavior

### 3) Turn the app plugin packaged backend into the real provider

Targets:

- `plugins/setta-json-render-app-gen/runtime_backend/main.py`
- any new packaged Python modules or assets required by that runtime
- `plugins/setta-json-render-app-gen/pyproject.toml`
- plugin runtime packaging tests

Implementation direction:

- replace the placeholder backend probe/runtime behavior with the real provider
  implementation
- make the packaged plugin advertise and serve the real backend contract
- if extra Python modules are needed, package them in the wheel
- keep the backend package runnable from a normal installed plugin root

Verification:

- focused plugin backend probe/runtime tests
- wheel-content tests for the packaged app plugin
- package-manager-installed plugin runtime tests proving no developer Go
  toolchain is required for the installed plugin backend path

### 4) Add unknown-id backend fixture coverage under the same contract

Targets:

- `tests/fixtures/plugins/app-subsystem-unknown-id/...`
- linked-worktree install coverage
- package-manager-installed install coverage

Implementation direction:

- give the unknown-id app-subsystem fixture a real backend implementation under
  the same generic contract
- make it exercise the same host surfaces as the first-party app plugin
- keep first-party ids out of the runtime contract itself

Verification:

- linked unknown-id provider flow
- package-manager-installed unknown-id provider flow
- disabled/invalid/conflict coverage under the new backend contract

### 5) Delete builtin production code and tighten guardrails

Targets:

- `internal/appsubsystemproviders/builtin_import.go`
- `internal/appsubsystemproviders/builtin/...`
- any tests or docs that still describe builtin backend ownership
- guardrails that should now forbid builtin provider ownership from returning

Implementation direction:

- remove the production builtin provider package and any production references
  to it
- update guardrails so production code cannot reintroduce builtin provider
  ownership
- add a focused guard against leaving the packaged app backend as a no-op
  placeholder

Verification:

- focused guardrail tests
- repo-wide search proving the builtin provider is gone from production code

## Exit Criteria

Do not mark this plan complete until a fresh audit confirms all of these:

- non-test production code under `cmd/`, `internal/`, `backend/setta/`,
  `frontend/src/`, and `plugins/` no longer references
  `internal/appsubsystemproviders/builtin`
- `internal/appsubsystemproviders/builtin_import.go` is gone
- no production implementation files remain under
  `internal/appsubsystemproviders/builtin/...`
- `plugins/setta-json-render-app-gen/runtime_backend/main.py` is no longer a
  placeholder that only returns empty probe data and no-op runtime responses
- the selected app-subsystem provider is validated through generic plugin
  discovery plus backend contract validation, not builtin init registration
- linked and package-manager-installed app plugins both activate the backend
  provider successfully
- an unknown-id plugin exercises the same backend provider contract
- disabling or removing the app plugin removes app-subsystem backend behavior
  with no builtin fallback
- `setta[defaults]`, `setta-basedpyright`, and `setta-ty` still behave as
  before
