# First-Party Plugin Standalone Completion Plan

## Summary

The previous plugin loops each removed a real class of coupling:

- `app-subsystem-real-plugin-plan.md` moved the app-subsystem frontend onto a
  runtime-loaded renderer contract.
- `first-party-plugin-finalization-plan.md` removed most direct host imports of
  first-party provider package paths and neutralized shared contracts.
- `app-subsystem-backend-externalization-plan.md` started removing compiled-in
  backend ownership and placeholder packaged-backend behavior.

That work improved the architecture, but it still left the finish line split
across multiple partial plans. The result is a codebase where the app-subsystem
plugin is plugin-shaped, yet still not fully standalone by the repo's intended
third-party-capable standard.

This document is the new single source of truth for finishing the job.

## Clean Cutover Rule

This plan requires a direct cutover.

Do not add:

- backward compatibility shims
- legacy support
- migrations
- transitional code paths
- dual contracts or dual runtime paths
- rollout toggles
- temporary bridges
- compatibility wrappers that preserve the old architecture

If the correct standalone boundary requires deleting or breaking the old
internal-only path, do that directly.

When replacing an old path with the standalone path, remove the superseded
path in the same change unless it is still the actively used production path
for the current phase. This plan does not allow "keep both for now" solutions.

## What "Standalone" Means Here

This plan does **not** target a hostless plugin model.

Setta still owns:

- canonical Go contracts
- correctness-sensitive validation and local runtime semantics
- public route and websocket shapes
- explicit local-core delegation surfaces
- generic plugin discovery, lifecycle, and transport plumbing

A first-party plugin counts as standalone when all of the following are true:

- plugin-owned code depends only on plugin-owned code plus published or
  packaged host SDK surfaces
- production host code does not compile in first-party provider behavior or
  fixed first-party plugin-id exceptions to make that plugin work
- linked-worktree and package-manager-installed plugin flows expose the same
  runtime-visible behavior
- an unknown-id plugin can implement the same contract and exercise the same
  surfaces
- disabling or removing the plugin removes the feature with no builtin fallback

## Current State

What is already in good shape:

- generic plugin discovery and package-manager discovery are real runtime paths
- plugin frontend bundles load through runtime metadata rather than repo-local
  source imports
- app-subsystem frontend surfaces use a renderer-based contract
- shared app-subsystem contracts already live on neutral Go-owned paths
- `setta-basedpyright` and `setta-ty` are already close to the intended
  standalone model and should not be reopened unnecessarily

What is still wrong:

- `plugins/setta-json-render-app-gen/frontend` still builds through repo-local
  aliasing to host-controlled paths rather than a fully packaged plugin-facing
  boundary
- `plugins/setta-json-render-app-gen/runtime_backend/main.py` still imports
  private host package surfaces directly and shells into `sdk-local-core`
  without a clearly published plugin-backend SDK boundary
- the packaged app plugin wheel does not yet prove a clean, intentional host
  dependency model for those backend SDK surfaces
- build-time and generated metadata still bake in the concrete first-party
  app-subsystem provider id in places where the host should remain plugin-id
  agnostic
- unknown-id backend-provider proof still lags the frontend and neutral-contract
  work
- backend-side guardrails are not yet strong enough to prevent future drift back
  to private host imports, no-op packaged backends, or first-party runtime
  exceptions

## Goals

- Finish the app-subsystem plugin as a truly standalone Setta plugin.
- Consolidate the finish line that was previously split across the three earlier
  plans.
- Preserve Go ownership for correctness-sensitive behavior while exposing only
  explicit plugin-facing SDK and runtime contracts.
- Keep `setta-basedpyright` and `setta-ty` stable, metadata-driven, and free of
  new first-party special cases.

## Non-Goals

- Making plugins independent of Setta as a host runtime.
- Reopening already-landed frontend extraction work unless a fresh audit proves
  a real regression.
- Reintroducing repo-local imports of `plugins/...` or
  `setta/plugins/...` into production host code.
- Adding backward compatibility, legacy support, migrations, transitional code,
  compatibility shims, dual contracts, rollout toggles, temporary bridges, or
  builtin fallbacks.
- Renaming first-party plugin ids.
- Churning `setta-basedpyright` or `setta-ty` beyond the small residual
  standalone-boundary audit described below.

## Hard Requirements

- Production code under `cmd/`, `internal/`, `backend/setta/`, and
  `frontend/src/` must not rely on a concrete first-party plugin id or package
  path to make the app subsystem work.
- Plugin-owned frontend code must depend only on plugin-owned code and published
  plugin-facing frontend SDK surfaces.
- Plugin-owned backend Python code must depend only on plugin-owned code and
  published or packaged plugin-facing backend SDK surfaces.
- Private host package imports from plugin-owned backend code are not an
  acceptable steady state, even if they happen to work inside the repo checkout.
- If the backend plugin needs Go-owned semantics, it must use explicit SDK or
  local-core contracts rather than duplicating those semantics in Python.
- Linked-worktree and package-manager-installed plugin flows must remain
  equivalent for runtime-visible behavior.
- Superseded internal-only paths must be deleted rather than preserved behind
  compatibility branches, wrappers, migration helpers, or staged rollout code.
- Remaining concrete first-party-id references are acceptable only in:
  docs, tests, packaging metadata, plugin-owned code, and defaults-profile
  configuration.

## Workstreams

### 1) Freeze the allowed standalone boundary

Targets:

- the plugin-facing frontend SDK
- the plugin-facing backend Python SDK or local-core client surfaces
- plugin-owned import boundaries
- packaging metadata that defines how installed plugins receive those SDK
  surfaces

Implementation direction:

- document and enforce that plugin-owned code may use only:
  - plugin-owned code
  - explicit generated contracts
  - explicit plugin-facing SDK packages or modules
- move any currently-needed backend helpers off private host modules and behind
  a narrow plugin-facing API
- make the host dependency for installed plugin flows intentional rather than an
  accidental repo checkout property
- delete superseded internal-only paths rather than carrying both old and new
  implementations forward in parallel

Verification:

- focused tests for the plugin-facing SDK surfaces
- focused import-boundary tests for plugin-owned frontend and backend code

### 2) Finish frontend packaging isolation

Targets:

- `plugins/setta-json-render-app-gen/frontend/vite.config.mjs`
- plugin frontend build inputs
- plugin frontend packaging verification

Implementation direction:

- stop aliasing repo source directories or unpublished build artifacts into the
  plugin bundle
- keep the plugin frontend dependent on explicit SDK artifacts and ordinary
  package-manager dependencies only
- verify the installed plugin artifact, not only the repo-local build

Verification:

- focused plugin frontend build tests
- installed-artifact verification that app-subsystem frontend surfaces load from
  runtime metadata with no repo-source assumptions

### 3) Finish backend runtime ownership behind a published host boundary

Targets:

- `plugins/setta-json-render-app-gen/runtime_backend/main.py`
- plugin-facing backend SDK modules
- plugin wheel dependency and packaging metadata

Implementation direction:

- keep the app plugin on a packaged runtime backend entrypoint for installed
  flows
- replace private host imports with a published or packaged plugin-facing
  backend SDK boundary
- if `sdk-local-core` remains the delegation path, treat it as a formal plugin
  runtime contract with typed client helpers rather than ad-hoc internal imports
- ensure the plugin package owns the provider behavior presented through the
  generic plugin backend contract
- remove repo-private helper paths once the published backend SDK boundary
  replaces them

Verification:

- focused probe/runtime tests for the packaged app plugin
- wheel-content and installed-plugin tests
- explicit proof that installed plugin activation does not require a developer
  Go toolchain

### 4) Remove remaining first-party runtime and build exceptions

Targets:

- production runtime provider selection
- generated provider catalogs and other checked-in generated metadata
- OpenAPI or other build-time paths that still bake in the first-party app
  provider as a concrete runtime assumption
- residual first-party affordances outside packaging, tests, and docs

Implementation direction:

- remove or confine any generated or production path that still treats
  `setta-json-render-app-gen` as the required app-subsystem provider
- keep host behavior provider-family-aware but plugin-id agnostic
- preserve existing language-server generalization work and keep remaining
  `setta-basedpyright` / `setta-ty` references limited to allowed areas
- delete first-party-only runtime and build branches instead of leaving them
  dormant behind compatibility conditionals

Verification:

- focused generator tests when generated metadata changes
- repo-wide production-path searches proving the remaining concrete first-party
  references are in allowed locations only

### 5) Prove unknown-id and installed-flow parity

Targets:

- unknown-id app-subsystem backend fixture
- linked-worktree plugin install flow
- package-manager-installed plugin flow
- disabled, invalid, and conflicting provider coverage

Implementation direction:

- give the unknown-id app-subsystem fixture the same backend contract, not just
  the frontend contract
- prove the same host surfaces work for:
  - first-party linked plugin
  - first-party installed plugin
  - unknown-id linked plugin
  - unknown-id installed plugin
- prove removing or disabling the plugin removes the feature with no builtin
  fallback

Verification:

- focused Go and Python tests for app-definition, MCP, publish, deployment, and
  startup/runtime selection flows

### 6) Tighten guardrails and perform the final audit

Targets:

- frontend import-boundary guardrails
- backend import-boundary guardrails
- packaged-backend no-op regression guardrails
- first-party-exception regression guardrails

Implementation direction:

- keep the existing frontend guardrails
- add backend-side guardrails that fail if plugin-owned Python code imports
  private host modules instead of the published backend SDK boundary
- add a focused guard that fails if the packaged app backend regresses to a
  placeholder probe/runtime implementation
- add a final audit pass that checks the full standalone definition rather than
  only import-path neutrality

Verification:

- focused guardrail tests
- fresh repo-wide audit before declaring completion

## Exit Criteria

Do not mark this plan complete until a fresh audit confirms all of the
following:

- plugin-owned frontend code imports only plugin-owned code and published
  plugin-facing frontend SDK surfaces
- plugin-owned backend Python code imports only plugin-owned code and published
  plugin-facing backend SDK surfaces
- `plugins/setta-json-render-app-gen/frontend` no longer depends on repo-source
  aliasing or unpublished host build artifacts
- `plugins/setta-json-render-app-gen/runtime_backend/main.py` is a real
  provider runtime, not a placeholder or thin repo-private shim
- superseded internal-only runtime and build paths have been removed rather than
  preserved as fallback or compatibility code
- linked-worktree and package-manager-installed first-party app-plugin flows are
  equivalent at runtime
- an unknown-id app-subsystem plugin exercises the same backend and frontend
  contract end-to-end
- disabling or removing the app plugin removes app-subsystem behavior with no
  builtin fallback
- non-plugin-owned production and checked-in generated code no longer relies on
  a concrete first-party app plugin id to make the app subsystem work
- remaining concrete references to `setta-json-render-app-gen`,
  `setta-basedpyright`, and `setta-ty` are limited to docs, tests, packaging
  metadata, plugin-owned code, or defaults-profile configuration
