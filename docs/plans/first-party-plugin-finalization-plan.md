# First-Party Plugin Finalization Plan

## Summary

The recent app-subsystem real-plugin work moved the frontend boundary in the
right direction:

- the app-subsystem frontend loads from plugin runtime metadata
- the host mounts plugin-owned renderers instead of rendering raw plugin React
  components directly
- the plugin frontend builds against a plugin SDK instead of host source aliases
- app-mode startup resolves providers by contract and supports unknown provider
  ids
- the first-party language-server plugins declare runtime search-path needs
  through backend registration metadata instead of plugin-id switches

The remaining work is mostly backend and generation decoupling.

Today the first-party app-subsystem provider is still not a fully standalone
plugin because core and generated Go code still import
`setta/plugins/setta-json-render-app-gen/...`. That means part of the provider
is still compiled into the host instead of being consumed through plugin
contracts, runtime metadata, or plugin-id-neutral Go-owned packages.

This plan finishes that remaining work.

## Current State Already Landed

These are no longer the main blockers:

- Host runtime frontend code no longer imports
  `plugins/<id>/frontend/src/...` in production paths.
- App-subsystem frontend surfaces load through normal plugin runtime metadata.
- The app-subsystem frontend contract is renderer-based.
- The plugin build uses a plugin-facing SDK instead of host source aliases.
- App-mode startup and runtime payloads resolve app-subsystem providers by
  contract, including unknown ids and conflict states.
- `setta-basedpyright` and `setta-ty` now declare
  `runtimeSearchPathsKey` through backend registrations, and the host merges
  those settings generically.

## Remaining Blockers

The remaining architectural blockers are:

- A manual core-host import of first-party app-subsystem provider code remains
  in `internal/mcpx/server.go`.
- Checked-in generated core files still import
  `setta/plugins/setta-json-render-app-gen/backend/...`, including:
  - `internal/appsubsystemproviders/discovered_providers_gen.go`
  - `internal/frontendbindings/discovered_contract_names_gen.go`
  - `internal/frontendbindings/discovered_type_roots_gen.go`
  - `internal/sharedtypes/discovered_additional_types_gen.go`
  - `internal/sharedvalueexports/discovered_value_exports_gen.go`
- Generator inputs still treat the concrete first-party provider package as an
  authoritative source for shared app-subsystem types and value exports.
- Guardrails currently skip `_gen.go`, so generated first-party coupling can
  persist without failing the import guard tests.
- Production code still exposes `plugins.AppSubsystemPluginID`, which is a
  lingering first-party affordance and should either disappear or be confined
  to tests and packaging helpers.
- Unknown-id provider coverage exists, but the finish line still needs explicit
  end-to-end proof across linked and package-manager-installed plugin flows for
  the remaining backend surfaces.

## Hard Requirements

- Core production code under `cmd/`, `internal/`, `backend/setta/`, and
  `frontend/src/` must not import `plugins/<id>/...` or
  `setta/plugins/<id>/...` outside plugin-owned code, tests, generators, or
  explicit packaging tools.
- Checked-in generated core files must obey the same rule.
- The host may know plugin contract families such as app-subsystem providers,
  but it must not know that the provider is specifically
  `setta-json-render-app-gen`.
- Go-owned canonical app-subsystem contracts, validation shapes, type metadata,
  and shared value exports must live on plugin-id-neutral owner paths.
- The first-party provider may depend on those neutral packages, but the host
  must not depend on provider package paths.
- `setta-basedpyright` and `setta-ty` must remain metadata-driven. Do not
  reintroduce plugin-id switches for language-server behavior.
- Defaults-profile configuration, docs, packaging metadata, test fixtures, and
  plugin-owned code may still reference concrete first-party plugin ids. That is
  not by itself a boundary violation.
- This is a clean cutover. Do not add backward compatibility shims, legacy
  support, migration paths, dual registration paths, or fallback bridges just to
  preserve the old first-party coupling.

## Non-Goals

- Preserving old first-party coupling through compatibility layers.
- Adding migrations or transitional code paths just to ease the refactor.
- Renaming first-party plugin ids or package names.
- Removing defaults-profile references that intentionally install or select
  `setta-basedpyright`.
- Redesigning AppSpec, app-generation UX, or the app-subsystem user model.
- Reworking unrelated plugin extension points that are already generic.

## Concrete Decisions

### 1) Separate provider-owned runtime contributions from shared Go-owned contracts

If core host code needs to import app-subsystem contracts, those contracts must
not live under `plugins/setta-json-render-app-gen/...`.

The steady state is:

- plugin-id-neutral Go-owned packages hold shared app-subsystem contracts,
  validation types, and value exports
- the first-party provider imports those packages
- the host imports only those neutral packages

The opposite direction is not allowed.

### 2) Core host integration must be contract-based, not provider-package-based

If the host needs app-subsystem behavior for MCP tools, app-definition handling,
deployment registration, or generated downstream surfaces, it must consume:

- plugin runtime metadata
- provider-neutral Go-owned contracts
- explicit plugin/backend contribution protocols

It must not consume the first-party provider package path directly.

### 3) Generators may discover providers broadly, but must emit neutral imports

Generators may scan `plugins/` for manifests, metadata, and package discovery.
That is acceptable.

What is not acceptable is emitting checked-in core files that import
`setta/plugins/setta-json-render-app-gen/...`.

If a generated output needs app-subsystem types or value exports, those must
come from a neutral owner path.

### 4) Guardrails must cover generated code too

The current host import guard intentionally skips `_gen.go`. That was useful
while extraction was still in progress, but it is now too permissive.

The finish-line guardrails must fail if checked-in generated host code depends on
the concrete first-party provider package path.

### 5) Language-server plugins are no longer the primary blocker

`setta-basedpyright` and `setta-ty` now declare their runtime search-path needs
through backend registrations. The plan should preserve that architecture and
only add regression coverage where necessary.

Do not spend the loop re-solving language-server generalization unless a fresh
audit finds a real regression.

## Workstreams

### 1) Neutralize shared app-subsystem contracts and value exports

Targets:

- `internal/frontendbindings/discovered_contract_names_gen.go`
- `internal/frontendbindings/discovered_type_roots_gen.go`
- `internal/sharedtypes/discovered_additional_types_gen.go`
- `internal/sharedvalueexports/discovered_value_exports_gen.go`
- any authoritative Go packages that currently force those generated files to
  import `plugins/setta-json-render-app-gen/backend/...`

Implementation direction:

- move shared app-subsystem types, value-export definitions, and validation
  shapes needed by the host out of the plugin package path
- keep Go authoritative for those contracts
- make the provider import the neutral packages rather than the host importing
  provider packages
- regenerate affected downstream outputs

Verification:

- focused generator unit tests or metadata tests for the changed authoritative
  paths
- no generator-drift tests that only rerun generation and compare output

### 2) Remove remaining manual core-host imports of the first-party provider

Targets:

- `internal/mcpx/server.go`
- any fresh non-generated production matches from:
  - `rg --glob '!**/*_test.go' --glob '!**/*_gen.go' 'setta/plugins/setta-json-render-app-gen/' internal cmd backend/setta frontend/src`

Implementation direction:

- replace `internal/mcpx` dependencies on provider package types or errors with
  neutral app-subsystem contract/service packages
- keep host behavior generic over provider id
- if a host-facing helper still lives only in the provider package, move that
  helper behind a neutral contract or plugin runtime integration point

Verification:

- focused Go tests for the affected MCP/app-definition flows

### 3) Decouple provider discovery and generated registries from compiled-in provider packages

Targets:

- `internal/appsubsystemproviders/discovered_providers_gen.go`
- `cmd/setta-gen-go-type-registries/main.go`
- any generator helpers or metadata inputs that currently require blank-importing
  the first-party provider backend

Implementation direction:

- provider discovery may still read manifests and capability metadata under
  `plugins/`
- checked-in generated core files must not require blank-importing
  `setta/plugins/setta-json-render-app-gen/backend`
- provider capabilities should come from plugin-owned metadata or neutral owner
  paths, not from compiled-in provider package imports

Verification:

- focused generator tests for provider discovery and emitted import sets
- runtime tests proving linked and installed plugins still surface the same
  capabilities

### 4) Prove unknown-id providers work end-to-end on the remaining backend surfaces

Targets:

- app mode startup and deployment runtime tests
- MCP/app-definition flows that still lean on first-party fixtures
- plugin packaging/install tests for linked and package-manager-installed
  providers

Implementation direction:

- extend existing unknown-id fixture coverage so the remaining backend surfaces
  are exercised with a non-first-party provider id
- cover:
  - linked-worktree installation
  - package-manager installation
  - app-mode startup
  - app-definition / MCP flows
  - provider conflicts, disabled providers, and invalid providers

Verification:

- focused Go and Python/package tests for those install/runtime paths

### 5) Tighten guardrails and remove stale first-party assumptions

Targets:

- `internal/appsubsystem/host_import_guard_test.go`
- remaining production uses of `plugins.AppSubsystemPluginID`
- docs and tests that need updates to reflect the new boundary rules

Implementation direction:

- extend guardrails so checked-in generated files are covered, not only
  handwritten host files
- fail if production core code or generated core code imports
  `setta/plugins/setta-json-render-app-gen/...` outside tests, generator
  sources, packaging tools, and plugin-owned code
- either remove `plugins.AppSubsystemPluginID` from production packages or move
  it to a narrower test/packaging-only owner
- keep `setta-basedpyright` and `setta-ty` references limited to docs, tests,
  defaults-profile config, packaging metadata, and plugin-owned code

Verification:

- focused guardrail tests
- targeted repo-wide search audit recorded in the plan-completion audit

## Sequencing

### Phase A: Neutral contract extraction

- move shared app-subsystem contracts and value exports to neutral owner paths
- regenerate downstream outputs
- prove host imports can target neutral packages only

### Phase B: Manual host import removal

- remove the last handwritten core-host import of the first-party provider
- keep the affected MCP/app-definition behavior working through neutral
  contracts

### Phase C: Generator and provider-registry decoupling

- update generators and metadata inputs so checked-in generated core files stop
  importing the provider package path
- keep provider discovery working for linked and installed plugins

### Phase D: Unknown-id end-to-end verification

- prove the remaining backend surfaces work with non-first-party provider ids
- verify linked and package-manager-installed flows

### Phase E: Guardrails, cleanup, and final audit

- tighten import guardrails to cover generated code
- remove stale first-party constants or assumptions
- complete the final repo-wide audit

## Verification Plan

Minimum verification for implementation work under this plan:

- focused Go tests for moved contracts, MCP/app-definition flows, generator
  changes, provider resolution, and startup/deployment behavior
- focused Python/package tests when plugin package install/probe behavior is
  affected
- targeted frontend tests only if generated contracts or runtime payloads change
  frontend behavior again
- `./gcf.sh`
- `./check_quality.sh`

If a change materially affects UI behavior, include chrome-devtools visual
verification when a developer-started browser session is already available.

## Exit Criteria

This plan is complete when all of the following are true:

- no production core file imports
  `setta/plugins/setta-json-render-app-gen/...`
- no checked-in generated core file imports
  `setta/plugins/setta-json-render-app-gen/...`
- the host consumes app-subsystem shared contracts only through neutral owner
  paths, runtime metadata, or provider-neutral protocols
- the first-party app-subsystem provider still works through the normal plugin
  runtime flow
- an unknown-id app-subsystem provider works end-to-end through linked and
  package-manager-installed flows for the remaining backend surfaces
- `setta-basedpyright` and `setta-ty` remain metadata-driven with no
  plugin-id-based language-server runtime switches in production code
- any remaining first-party-id references are limited to docs, tests, packaging
  metadata, plugin-owned code, generator sources, or defaults-profile
  configuration

## References

- `docs/plans/third-party-plugin-generalization-plan.md`
- `docs/plans/app-subsystem-real-plugin-plan.md`
- `internal/mcpx/server.go`
- `internal/appsubsystemproviders/discovered_providers_gen.go`
- `internal/frontendbindings/discovered_contract_names_gen.go`
- `internal/frontendbindings/discovered_type_roots_gen.go`
- `internal/sharedtypes/discovered_additional_types_gen.go`
- `internal/sharedvalueexports/discovered_value_exports_gen.go`
- `internal/plugins/runtime.go`
- `internal/appsubsystem/host_import_guard_test.go`
- `internal/plugins/language_servers.go`
