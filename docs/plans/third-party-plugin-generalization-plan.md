# Third-Party Plugin Generalization Plan

## Summary

Setta's ordinary plugin flow is already mostly generic. Unknown plugin ids can be
discovered, linked, installed from GitHub or PyPI, and loaded into the frontend
through `/plugins/runtime`.

The remaining first-party-only behavior is concentrated in the extracted app
subsystem and one smaller language-server path-injection path. This plan focuses
on removing those exceptions without rewriting the generic plugin system that is
already working.

## Problem Statement

The current codebase still treats the app subsystem as a first-party capability
gate instead of a real third-party-capable plugin contract.

The main blockers are:

- `internal/plugins/runtime.go` derives app-subsystem availability from the fixed
  plugin id `setta-json-render-app-gen`.
- `internal/appsubsystem/deployment_runtime.go` hard-requires that same plugin id
  for app mode startup.
- `frontend/src/plugins/appSubsystemRuntime.tsx` statically imports
  `../../../plugins/setta-json-render-app-gen/frontend/src/index` instead of
  loading the installed plugin frontend from runtime metadata.
- `internal/app/app.go`, `internal/app/app_generation_modes.go`, and
  `internal/app/plugin_backend_mcp_runtime.go` directly import
  `setta/plugins/setta-json-render-app-gen/backend/...` from core host code.
- `plugins/setta-json-render-app-gen/setta.plugin.json` does not use the normal
  plugin `backend` or `frontend` entrypoint shape, so the generic plugin loader
  is not actually what powers the subsystem.
- `internal/plugins/language_servers.go` still special-cases
  `setta-basedpyright` and `setta-ty` by plugin id for required runtime-path
  injection.

As long as those paths remain, a plugin written by someone else can only
approximate the app subsystem. It cannot replace it by following the published
plugin schema alone.

## Goals

- Make the app subsystem resolvable by contract, not by fixed plugin id or repo
  import path.
- Let the host load installed plugin artifacts and runtime registrations rather
  than repo-local first-party code.
- Preserve Go ownership for correctness-sensitive app contracts, validation, and
  runtime behavior.
- Keep the existing generic plugin discovery, install, and frontend-runtime
  paths as the foundation rather than replacing them.
- Generalize the remaining language-server plugin-id switch statements into
  explicit plugin metadata.

## Non-Goals

- Redesigning the app subsystem contract, AppSpec model, or app-generation UX.
- Supporting multiple simultaneous app-subsystem providers in the first pass.
- Reworking every plugin extension point in one change.
- Adding compatibility shims purely to preserve the current first-party-only
  implementation shape.

## Concrete Decisions

### 1) Treat the app subsystem as a provider contract

The host may know that an `appSubsystem` provider contract exists, but it must
not know that the provider is specifically `setta-json-render-app-gen`.

The provider selection rules should be:

- zero active providers: app subsystem unavailable
- one active provider: that provider owns the subsystem
- more than one active provider: fail loudly with explicit conflict status and
  disable the subsystem until the conflict is resolved

Do not silently pick one provider by heuristic once multiple valid providers are
active.

### 2) The provider must be a real plugin package

An app-subsystem provider must use normal plugin packaging:

- manifest `backend` entrypoint
- manifest `frontend` entrypoint when frontend surfaces are exposed
- declared capabilities for the runtime surfaces it uses
- explicit provider metadata for app-subsystem ownership

The current "feature-capability-only manifest with no normal entrypoints" shape
should not remain the steady state.

### 3) Core host code must stop importing provider packages directly

Any direct import from `plugins/setta-json-render-app-gen/...` in core host code
is definitionally first-party-only. The host must instead consume:

- plugin runtime metadata
- plugin backend probe/runtime protocols
- generated or owner-defined provider contracts that are independent of the
  provider's plugin id

### 4) The frontend must load the provider from plugin runtime metadata

App authoring UI, preview UI, app-mode routes, deployment modal UI, and
slash-command UI must come from the installed provider frontend entrypoint,
loaded through the same runtime metadata path used by ordinary plugins.

The host must not statically import the first-party repo copy.

### 5) Language-server special cases must become metadata-driven

If a language-server plugin needs required runtime search-path injection, the
plugin must declare that requirement explicitly through plugin-owned metadata or
probe output. The host must not switch on plugin ids.

## Target End State

After this plan lands:

- a plugin with an unknown id can provide the app subsystem if it implements the
  published provider contract
- the host has no app-subsystem-specific direct imports from
  `plugins/setta-json-render-app-gen/...`
- the frontend loads app-subsystem UI from the installed plugin frontend bundle
- app mode startup resolves the active provider by contract, not by fixed plugin
  id
- language-server runtime path injection works for any plugin that declares the
  required metadata

## Workstreams

### 1) Introduce generic app-subsystem provider resolution

Replace the current `AppSubsystemPluginID`-based runtime aggregation with
provider resolution over any active plugin that advertises app-subsystem
provider metadata.

Backend work:

- replace the fixed-id aggregation in `internal/plugins/runtime.go`
- model provider selection status explicitly in runtime and status payloads
- surface conflict states without fallback behavior
- update websocket/runtime-refresh plumbing to carry provider selection changes

Tests:

- no provider
- one non-first-party provider
- disabled provider
- invalid provider
- multiple active providers with explicit conflict behavior

### 2) Convert the app subsystem into a real runtime-managed plugin

Update `plugins/setta-json-render-app-gen` to use the same runtime-managed
plugin shape as ordinary plugins.

Required changes:

- add normal manifest `backend` and `frontend` entrypoints
- declare the capabilities the provider actually uses
- keep Go-owned app contracts in provider-owned Go code, but expose them through
  plugin runtime protocols rather than host imports
- ensure package-manager installation and linked-worktree installation both
  produce the same runtime-visible shape

This work should also add a non-first-party fixture provider so the contract is
tested against an unknown id, not only against the first-party plugin name.

### 3) Remove direct backend imports from core host code

Core host code currently imports the first-party provider directly for:

- app HTTP route registration
- app deployment type registration
- app-generation mode contributions
- app MCP tool registrations
- app definition runtime and publish helpers

These paths need contract-based replacements.

Implementation direction:

- define provider-owned backend contribution protocols for app-subsystem
  surfaces that the host currently wires directly
- route those contributions through plugin discovery, plugin backend probe, or
  plugin backend runtime mechanisms
- keep the host limited to generic transport and lifecycle responsibilities

This likely requires new plugin runtime contracts for at least:

- app-subsystem route contributions
- app-subsystem MCP tool contributions
- app-generation mode and validation contributions
- app deployment type/runtime contributions

The first pass should optimize for explicit contracts and minimal ownership
leakage, not for maximum generality across unrelated feature families.

### 4) Expand the generic frontend plugin host for app-subsystem surfaces

The generic frontend plugin runtime already supports panes, section kinds,
commands, and top-nav items. The app subsystem still uses a parallel special
loader.

Unify that path by extending the generic frontend plugin host with explicit
registration APIs for the app-subsystem surfaces that the host shell needs.

Likely registrations:

- overview tab
- project preview surface
- app-mode route/page
- app deployment modal entry
- slash-command definitions and mode metadata
- feature-scoped initialization and reset hooks

Then:

- move the provider frontend registration to normal `register(host)` flow
- remove `frontend/src/plugins/appSubsystemRuntime.tsx`
- remove repo-local first-party imports from core frontend code

### 5) Generalize startup and deployment gating

App mode startup currently hard-requires the first-party plugin id.

Replace that with provider resolution:

- resolve the active app-subsystem provider for app mode
- fail loudly when no provider is active
- fail loudly when multiple providers are active
- keep share mode unaffected

User-facing messages should refer to the app-subsystem provider contract or the
resolved provider id, not to "the first-party plugin" as a hard-coded concept.

### 6) Generalize language-server runtime-path injection

Replace the plugin-id switch in `internal/plugins/language_servers.go` with
explicit metadata.

Implementation options:

- manifest metadata owned by the plugin
- backend probe output for language-server registrations

Either approach is acceptable if it keeps Go as the source of truth and avoids
re-stating TypeScript or Python logic by hand.

The end state must allow an unknown plugin id to request the same runtime-path
behavior without a host code change.

### 7) Cleanup and guardrails

After the refactor, add guardrails that prevent regression back to first-party
assumptions.

Recommended guardrails:

- targeted grep-based tests or focused unit tests that fail if core host code
  imports `plugins/setta-json-render-app-gen/...`
- runtime tests that install a fixture provider with an unknown id and verify
  host behavior
- package-manager tests for the same unknown-id provider
- negative tests for provider conflicts

Do not add tautological generator-drift tests.

## Sequencing

### Phase A: Contract and runtime model

- define provider selection model
- add runtime/status payload support
- add conflict semantics
- add non-first-party fixture provider

### Phase B: Backend contract migration

- migrate app MCP tools, routes, deployment registration, and app-generation
  contributions off direct host imports
- convert the first-party provider to the real plugin packaging shape

### Phase C: Frontend contract migration

- extend generic frontend host registrations
- move app-subsystem frontend loading to normal plugin runtime flow
- delete special frontend loader paths

### Phase D: Startup and cleanup

- switch app mode startup to provider resolution
- remove first-party wording from remaining user-facing errors
- add regression guardrails

### Phase E: Language-server cleanup

- replace hard-coded plugin-id runtime-path handling with metadata-driven logic
- migrate first-party plugins to the new metadata
- add unknown-id tests

The language-server cleanup can land independently if it unblocks broader plugin
generality, but it should not delay the main app-subsystem provider migration.

## Verification Plan

Minimum verification for implementation work under this plan:

- Go tests covering provider resolution, conflicts, startup gating, route and
  MCP registration, and language-server metadata behavior
- frontend tests covering runtime loading from plugin entrypoint URLs, not
  repo-local imports
- one fixture app-subsystem provider with a non-first-party id linked from a
  local folder
- one package-manager-installed fixture app-subsystem provider with a
  non-first-party id
- app mode startup verification for:
  - no provider
  - one provider
  - multiple providers

If frontend UI changes are made during implementation, include chrome-devtools
visual verification for the affected app-subsystem surfaces.

## Exit Criteria

This plan is complete when all of the following are true:

- a plugin with an unknown id can provide the app subsystem end-to-end
- core host code no longer directly imports
  `plugins/setta-json-render-app-gen/...` outside plugin-owned code and tests
- `frontend/src/plugins/appSubsystemRuntime.tsx` no longer exists
- app subsystem UI is loaded from plugin runtime metadata like other plugin
  frontends
- app mode startup is provider-based rather than fixed-id-based
- language-server runtime path injection is metadata-driven rather than
  plugin-id-driven

## References

- `docs/plans/app-subsystem-extraction-plan.md`
- `internal/plugins/runtime.go`
- `internal/appsubsystem/deployment_runtime.go`
- `frontend/src/plugins/appSubsystemRuntime.tsx`
- `internal/app/app.go`
- `internal/app/app_generation_modes.go`
- `internal/app/plugin_backend_mcp_runtime.go`
- `internal/plugins/language_servers.go`
