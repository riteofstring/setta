# App Subsystem Real Plugin Plan

This plan narrows `third-party-plugin-generalization-plan.md` to the concrete
frontend/runtime work needed to make
`plugins/setta-json-render-app-gen` behave like an actual plugin package rather
than a repo-local extension that only happens to be shipped in a wheel.

## Summary

The current app-subsystem frontend is not a real plugin boundary.

The main app currently expects the provider to hand it raw React
`ComponentType`s, and the first-party provider frontend is built against host
source aliases such as `components`, `openapi`, `plugins`, `state`, and
`utils`. That means the packaged plugin cannot be treated as an isolated bundle
loaded only through runtime metadata. It still depends on host source code and
host module singletons.

The long-term fix is not another bridge. The fix is to replace the current
component-based contract with a real plugin rendering contract and a stable
frontend plugin SDK.

## Hard Requirements

These are the rules for the final architecture:

- We do not need backward compatibility, legacy support, migrations, or
  transitional compatibility layers for the old app-subsystem frontend shape.
- The main app must not import from `plugins/...` at runtime outside tests,
  generators, or explicit packaging tools.
- A plugin frontend bundle must not import host source aliases like
  `components/*`, `openapi/*`, `plugins/*`, `state/*`, or `utils/*`.
- The host must load app-subsystem frontend code only from installed plugin
  runtime metadata.
- App-subsystem frontend surfaces must be mounted through an explicit renderer
  contract, not by rendering plugin-owned React `ComponentType`s directly inside
  the host React tree.
- Any host capabilities a plugin needs must be exposed through a versioned SDK
  or typed host object, not through source imports.
- The installed wheel path and linked-worktree dev path must exercise the same
  frontend contract.

## No Compatibility Burden

This refactor should be a clean cutover, not a compatibility exercise.

Do not add or preserve any of the following just to ease the transition:

- dual registration shapes
- v1/v2 frontend contract adapters
- host-side plugin bridges
- repo-local import exceptions
- migration-only storage logic
- fallback code paths for the old component-based contract
- compatibility aliases for old plugin frontend module structure

If a piece of old host/plugin coupling is in the way, delete it and move the
plugin to the new contract directly. The right outcome is a clean plugin
boundary, not a prolonged mixed state.

## Current Defects

The current design breaks the plugin boundary in four places.

### 1. The host renders plugin React components directly

`frontend/src/plugins/appSubsystem.ts` defines app-subsystem frontend
registrations as raw `ComponentType`s for overview, preview, app mode, and app
deployment modal surfaces.

That is the wrong contract for a real plugin because it assumes:

- shared React runtime identity
- shared store singletons
- shared host module graph

Ordinary frontend plugins already avoid this problem for section kinds by using
`mount/update/unmount` renderers instead of raw React components.

### 2. The first-party provider frontend imports host internals directly

The app provider frontend sources import host-owned modules such as:

- `components/*`
- `openapi/http`
- `plugins/appSubsystem`
- `state/*`
- `utils/*`

That means the plugin source is coupled to the host implementation rather than
to a plugin API.

### 3. The plugin build aliases host source into the bundle

`plugins/setta-json-render-app-gen/frontend/vite.config.mjs` points the plugin
build at the repo frontend tree and aliases host source directories directly.

That is useful for extraction bring-up, but it is not acceptable as the final
plugin architecture because the plugin is not actually compiled against a
published contract.

### 4. Wheel packaging and browser loading are not proving the right thing

Today a wheel can contain `frontend/dist/index.js`, but that alone does not mean
the plugin is real. If the bundle still assumes host source imports or host
React/store identity, packaging success is misleading.

## Target Architecture

### 1. Replace `ComponentType` registrations with renderer registrations

The app-subsystem frontend contract should be reshaped around renderers that the
host mounts into DOM containers.

Example shape:

```ts
type PluginRenderer<Props> = {
  mount: (
    target: HTMLElement,
    props: Props,
    host: AppSubsystemFrontendHost,
  ) => void;
  update?: (target: HTMLElement, props: Props) => void;
  unmount?: (target: HTMLElement) => void;
};

type AppSubsystemFrontendRegistrationV2 = {
  overviewTab?: {
    titleQuickInfo: string;
    moreMenuQuickInfo: string;
    moreMenuLabel: string;
    renderer: PluginRenderer<OverviewTabProps>;
  };
  previewSurface?: {
    renderer: PluginRenderer<PreviewSurfaceProps>;
  };
  appModeRoute?: {
    renderer: PluginRenderer<AppModeRouteProps>;
  };
  appDeploymentModal?: {
    renderer: PluginRenderer<AppDeploymentModalProps>;
  };
  chat?: {
    slashCommands: ChatSlashCommandDefinition[];
    imageRequiredModes: string[];
    customModes: AppSubsystemCustomSlashCommandModesRegistration;
  };
  controller?: AppSubsystemFrontendController;
};
```

This lets the plugin own its own React root, state, and lifecycle for each
surface. The host owns only:

- when a surface should exist
- where it is mounted
- what props/context are passed in

### 2. Introduce a stable frontend plugin SDK

The plugin must compile against a stable SDK, not against host source paths.

The SDK should expose only explicit host capabilities such as:

- project context and project-state subscriptions
- notifications
- navigation helpers
- modal close/open hooks where relevant
- typed backend request helpers for declared app routes
- plugin-scoped store creation if needed
- theme and shell context snapshots

The SDK must be versioned through `apiVersion` and must live outside the host
source aliases currently consumed by the plugin.

A plugin may bundle its own UI library usage or depend on a formally exported
plugin UI package, but it must not import host React components from
`frontend/src/components`.

### 3. Move app-specific frontend state fully into the plugin

The plugin should own:

- app definition draft state
- preview override state
- app-mode page state
- deployment publish modal state

The host should own only generic runtime state such as:

- selected provider
- provider load status
- provider registration metadata
- routing/presence decisions

Cross-surface app-subsystem behavior should go through the plugin registration's
controller API, not through host imports into plugin stores.

### 4. Give the plugin a real backend client surface

The plugin frontend must stop importing host `openapi/http`.

Instead:

- Go remains the source of truth for route shapes and contracts.
- The plugin gets generated TypeScript client/types for its app routes through a
  plugin-safe SDK artifact or plugin-owned generated output.
- The host may provide a narrow generic transport helper if needed, but not a
  source import into the host OpenAPI tree.

This keeps route ownership Go-backed while preserving the plugin boundary.

### 5. Make the plugin build isolated by default

The plugin frontend build must use the plugin directory as its true root and may
only import from:

- plugin-owned source
- published workspace packages intended for plugin use
- normal third-party dependencies

It must not alias host source directories into the plugin build.

If the plugin needs design-system primitives or shared helpers, those must be
exported as real plugin-facing packages, not as path aliases into
`frontend/src`.

### 6. Keep the host generic

After the new contract lands, host render sites in:

- overview
- main container / preview
- router
- modal container

should do the same generic job they already do for other plugin surfaces:

- ask runtime for the active provider registration
- create a container
- mount or update the provider renderer
- unmount on teardown

The host should not know whether the provider uses React, Preact, or no
framework at all.

## Rejected Approaches

These should be treated as explicit non-solutions.

### 1. Host-side imports from `plugins/...`

Do not import repo-local plugin source into the host runtime as a way to "share"
React or stores. That only hides the boundary problem.

### 2. Sharing host source aliases with plugin bundles

Do not keep the current Vite alias pattern that points the plugin at
`frontend/src/*`. That is extraction scaffolding, not a real plugin contract.

### 3. Raw React `ComponentType` registrations

Do not keep the current app-subsystem frontend registration shape and try to fix
it with more dedupe, externals, import maps, or bundle tricks. The contract
itself is wrong for isolated plugin execution.

### 4. First-party-only exceptions

Do not add plugin-id-based exceptions for `setta-json-render-app-gen` in the
host runtime. The first-party provider must succeed by the same contract an
unknown provider would use.

### 5. Transitional compatibility layers

Do not introduce migration-only code to soften the move from the old contract to
the new one. No adapters, no dual-write logic, no old/new frontend contract
coexistence, and no compatibility cleanup deferred to a later pass.

## Migration Plan

### Phase 1. Define the v2 frontend contract

- Add a new app-subsystem frontend registration contract based on renderers and
  an explicit controller API.
- Keep the contract generic and plugin-id-agnostic.
- Version it explicitly and fail loudly on mismatches.
- Delete the old `ComponentType`-based contract rather than carrying both
  shapes in parallel.

### Phase 2. Build the frontend plugin SDK

- Add a plugin-facing frontend SDK package for app-subsystem providers.
- Export only typed host services needed by the app subsystem.
- Generate or package plugin-safe route clients/types from Go-owned contracts.

### Phase 3. Teach the host to mount renderer-based app surfaces

- Replace direct `<PluginComponent />` rendering with container-based
  mount/update/unmount handling.
- Update overview, preview, app route, and modal rendering sites.
- Keep lifecycle cleanup strict so provider reloads do not leak roots or state.
- Do not keep a fallback path that still renders raw plugin React components.

### Phase 4. Migrate `setta-json-render-app-gen` to the SDK

- Remove imports from host source aliases.
- Replace host state imports with SDK services or plugin-owned stores.
- Replace host OpenAPI imports with plugin-safe generated clients.
- Make the plugin build root self-contained.
- Do this as a direct cutover, not with an intermediate bridge or host-owned
  shim layer.

### Phase 5. Prove the contract with an unknown-id fixture

- Add a fixture app-subsystem provider with a non-first-party id.
- Verify that it can register the same surface family through the same runtime
  contract.
- Keep the first-party provider from being the only implementation under test.

### Phase 6. Delete the old contract and scaffolding

- Remove `ComponentType`-based app-subsystem registrations.
- Remove host-side assumptions that plugin UI is renderable as host React
  elements.
- Remove plugin build aliases into host source.
- Add regression guardrails so neither side can reintroduce the old coupling.
- Remove any temporary compatibility code in the same pass rather than leaving
  cleanup debt behind.

## Required Guardrails

- A host-side lint or test guard must fail if runtime frontend code imports from
  `plugins/*/frontend/src` outside tests or packaging-only code.
- A plugin-side lint or build guard must fail if plugin frontend code imports
  `components`, `openapi`, `plugins`, `state`, or `utils` from host source.
- Browser verification must use the installed plugin artifact, not only repo
  source imports.
- At least one integration test must exercise an unknown plugin id implementing
  the app-subsystem frontend contract.

## Acceptance Criteria

This plan is complete only when all of the following are true:

- `plugins/setta-json-render-app-gen` frontend builds without aliasing host
  source directories.
- The main app runtime does not import from `plugins/...` to make app-subsystem
  frontend surfaces work.
- The app provider frontend is loaded only from runtime metadata and installed
  plugin artifacts.
- App Config, App Preview, App mode, app deployment modal, and app-generation
  slash commands all work in the browser through the new renderer contract.
- The same contract works for an unknown plugin id.
- The previous invalid-hook / duplicate-runtime failure mode is impossible by
  construction, not merely hidden by bundler configuration.
