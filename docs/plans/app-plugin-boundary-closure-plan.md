# App Plugin Boundary Closure Plan

## Summary

The remaining issue is not that Setta owns generic app-subsystem infrastructure.
That part is correct and should stay in core.

The remaining issue is that `plugins/setta-json-render-app-gen` is plugin-shaped
at runtime, but its source/build boundary is still weaker than the runtime
boundary:

- the runtime path is generic and third-party-capable
- the plugin frontend still builds through repo-root frontend package
  resolution and repo-level build orchestration
- the installed-bundle proof is stronger than the plugin-source/build proof

This plan closes that gap without re-solving already-correct architecture.

## Clean Cutover Rule

This plan is a direct cutover plan.

Do not add or preserve:

- backward compatibility
- legacy support
- migrations
- transitional code paths
- compatibility wrappers
- dual runtime or dual build paths
- rollout toggles
- temporary bridges

If an older internal-only or repo-only path is superseded by the correct
boundary, remove it rather than keeping both paths alive.

## Plain-Language Model

### What is good core architecture

These things belong in Setta core and are not bugs:

- generic plugin discovery, install, enablement, and runtime metadata
- app-subsystem provider selection and conflict handling
- public HTTP/OpenAPI route shapes and websocket/runtime payload shapes
- correctness-sensitive Go semantics exposed through explicit local-core or SDK
  boundaries
- generic plugin-family lifecycle such as language-server transport, restart,
  status, and selection plumbing
- published plugin-facing SDK packages and modules that plugins can depend on

That is the same class of architecture that makes the language-server plugins
reasonable: Setta owns the skeleton, and plugins contribute provider-specific
behavior through the published contract.

### What is bad coupling

These are the actual remaining problems:

- production or generated host code needs a concrete first-party plugin id or
  package path to make the app subsystem work
- plugin-owned code imports private host modules instead of published
  plugin-facing SDK surfaces
- plugin source/build requires repo-root frontend tooling or repo-private module
  resolution that is not part of the plugin's intentional dependency model
- verification proves only that a checked-in built bundle works, while leaving
  the plugin source/build boundary under-specified

## Current State

What is already in good shape:

- the app-subsystem frontend loads from runtime metadata
- the app-subsystem frontend contract is renderer-based rather than raw host
  React component imports
- unknown-id app-subsystem providers are supported by the runtime contract
- the backend plugin path uses published plugin-facing Python surfaces instead
  of private host imports
- `setta-basedpyright` and `setta-ty` already match the intended "host owns the
  skeleton, plugin supplies registrations" architecture and should not be
  reopened without a concrete regression

What is still wrong:

- `plugins/setta-json-render-app-gen/frontend/vite.config.mjs` still resolves
  its build inputs by reaching into the repo-root frontend package graph
- `frontend/scripts/buildAppSubsystemPluginFrontend.mjs` still acts as a
  repo-owned orchestration path for producing the plugin bundle
- build verification is stronger for the installed bundle than for the plugin
  source tree or a staged copy of that tree
- the remaining checks do not yet make the allowed boundary explicit enough to
  prevent future drift back toward repo-only build assumptions

## Goals

- Keep the generic app-subsystem family infrastructure in Setta core.
- Keep Go authoritative for correctness-sensitive app semantics.
- Keep local-core or published SDK delegation as the approved path for
  Go-owned behavior.
- Make the first-party app plugin source/build consume only intentional,
  explicit plugin-facing dependencies.
- Prove the plugin can be built from a staged plugin source tree without
  repo-root frontend package assumptions.
- Keep linked-worktree and package-manager-installed plugin flows equivalent at
  runtime.
- Preserve unknown-id provider parity through the same runtime contract.

## Non-Goals

- Making the app plugin hostless.
- Moving canonical app-subsystem semantics out of Go and into the plugin.
- Removing the generic app-subsystem skeleton from Setta core.
- Reworking the language-server plugin family architecture.
- Redesigning the app-subsystem contract, AppSpec model, or app UX.
- Adding backward compatibility, legacy support, migrations, transitional code,
  compatibility bridges, rollout toggles, or dual runtime/build paths.

## Hard Requirements

- Core may continue to own generic app-subsystem framework code, route shapes,
  plugin lifecycle plumbing, provider selection, and explicit local-core
  delegation surfaces.
- Plugin-owned frontend code may depend only on plugin-owned code, published
  plugin-facing frontend SDK surfaces, and explicit third-party package
  dependencies.
- Plugin-owned backend Python code may depend only on plugin-owned code,
  published plugin-facing backend SDK surfaces, and explicit host/runtime
  package dependencies when those are intentional.
- The app plugin must not rely on repo-root frontend package resolution or
  repo-private build aliases as hidden prerequisites.
- Verification must prove the plugin source/build boundary from a staged copy or
  equivalent isolated build input, not only from the checked-in built bundle.
- Production and checked-in generated host code must remain concrete-plugin-id
  agnostic for app-subsystem runtime behavior outside explicitly allowed
  locations such as docs, tests, packaging metadata, defaults profile, and
  plugin-owned code.
- Do not preserve compatibility-era repo-only or internal-only paths once the
  correct standalone boundary exists.
- Do not treat the existence of core plugin-family infrastructure as a defect.
  The defect is first-party-only coupling, not Setta-owned runtime skeleton
  code.

## Concrete Decisions

### 1) Keep the host-owned app-subsystem family infrastructure

Setta should continue to own:

- provider-family runtime metadata and selection rules
- public API shapes and shared contracts
- plugin transport and lifecycle plumbing
- local-core commands for correctness-sensitive behavior
- plugin-facing frontend and backend SDK surfaces

Do not create a second canonical app-subsystem framework inside the plugin
package.

### 2) The remaining fix is source/build boundary closure

The app plugin is already close to the right runtime architecture. The remaining
work is to close the gap between:

- "the built plugin bundle can be loaded generically"
- and
- "the plugin source/build path depends only on intentional plugin-facing
  dependencies"

That means the main target is not runtime redesign. The main target is build
input isolation and stronger proof.

### 3) Published SDK and local-core boundaries are the correct plugin interface

If the plugin needs host behavior, it should use:

- `@setta/app-subsystem-frontend-sdk`
- published backend plugin runtime helpers such as `setta.plugin_runtime`
- explicit local-core calls for Go-owned semantics

Do not treat those boundaries as temporary hacks. They are the intended plugin
integration contract.

### 4) Build-time repo coupling is the real remaining failure mode

If the plugin frontend build still requires:

- the repo-root `frontend/package.json`
- repo-root dependency resolution
- repo-owned build scripts as hidden prerequisites

then the runtime boundary may be correct while the source/build boundary is
still too weak. That is what this plan closes.

### 5) Keep the language-server pattern as the mental model

The app plugin should be judged by the same principle as the first-party
language-server plugins:

- core owns the family infrastructure
- plugins contribute provider-specific registrations and behavior
- an unknown-id plugin using the same contract should work

The goal is not to eliminate core framework code. The goal is to eliminate
first-party-only runtime and build assumptions.

## Workstreams

### 1) Freeze the allowed boundary

Targets:

- plan/audit documents and loop guidance
- plugin-owned import boundary checks
- any stale wording that still treats valid host-owned framework code as
  disallowed coupling

Implementation direction:

- make the approved boundary explicit:
  - host-owned family infrastructure is allowed
  - published SDK and local-core delegation are allowed
  - private host imports and repo-only build assumptions are not allowed
- keep the loop focused on residual source/build issues rather than reopening
  already-landed runtime extraction work

Verification:

- focused import-boundary tests
- focused audit notes that identify only concrete remaining issues

### 2) Remove repo-root frontend build coupling from the app plugin

Targets:

- `plugins/setta-json-render-app-gen/frontend/vite.config.mjs`
- any plugin-specific frontend package manifests or build metadata
- `frontend/scripts/buildAppSubsystemPluginFrontend.mjs` if it still represents
  repo-owned build coupling rather than an optional convenience wrapper

Implementation direction:

- stop resolving plugin frontend dependencies through the repo-root frontend
  package as a hidden prerequisite
- make the plugin frontend dependency model explicit and intentional
- keep the plugin frontend compiled against published SDK surfaces and ordinary
  package-manager dependencies only
- if a convenience repo wrapper remains, it must call into an already-valid
  plugin-owned build path rather than being the only way the plugin can build

Verification:

- build the plugin frontend from a staged plugin source tree outside the repo's
  frontend dependency-resolution path
- keep runtime metadata loading tests green

### 3) Strengthen staged-source and installed-flow proof

Targets:

- plugin packaging tests
- startup/runtime tests for first-party and unknown-id providers
- any tests that currently prove only bundle import rather than source/build
  boundary correctness

Implementation direction:

- add proof for a staged copy of the app plugin source tree or equivalent
  isolated build input
- preserve the existing installed-wheel runtime proof
- keep unknown-id providers on the same runtime contract and installed-flow
  expectations
- keep the backend boundary on published `setta.plugin_runtime` and local-core
  surfaces instead of inventing a second contract

Verification:

- staged-source frontend build verification
- installed-wheel verification
- linked-worktree and package-manager runtime verification for first-party and
  unknown-id providers as needed

### 4) Add regression guardrails and close out

Targets:

- boundary tests for plugin-owned frontend and backend code
- tests that fail if the app plugin frontend build regresses back to repo-root
  dependency resolution
- final focused audits for concrete first-party app-plugin assumptions in host
  production code

Implementation direction:

- fail loudly when plugin-owned code crosses into private host modules
- fail loudly when plugin build metadata reintroduces repo-root dependency
  resolution as a hidden requirement
- keep allowed first-party references confined to docs, tests, defaults,
  packaging metadata, and plugin-owned code

Verification:

- focused tests for build metadata and staged-source builds
- focused runtime and packaging tests
- `./gcf.sh`
- `./check_quality.sh`

## Completion Criteria

This plan is complete only when all of the following are true:

- the app plugin still uses the generic host-owned app-subsystem framework and
  published SDK/local-core boundaries
- the app plugin source/build path no longer depends on repo-root frontend
  package resolution as a hidden prerequisite
- the plugin can be built from a staged source tree or equivalent isolated
  input using only intentional dependencies
- installed-flow proof remains green
- unknown-id provider parity remains green
- no new production or generated first-party runtime exceptions were introduced
- the resulting architecture is clearly the language-server-style model:
  core owns the family framework, plugins supply provider behavior, and no
  concrete first-party plugin path bleeds into host runtime behavior
