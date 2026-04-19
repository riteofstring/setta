# App Subsystem Extraction Plan

## Problem Statement

Setta's AppSpec, app-generation, App Config/Preview, and App mode behavior are
currently one subsystem in practice, but they are spread across core backend and
frontend code. Extracting only the `@json-render/*` renderer would not produce a
meaningful modular boundary because core code still owns or hard-codes:

- app-generation mode names (`json_render`, `json_render_with_image`)
- app-generation prompt injection
- app-definition MCP tools and HTTP routes
- AppSpec validation and patch semantics
- AppSpec persistence and publishing
- App Preview, App Config, and App mode page wiring
- app deployment runtime behavior

The correct unit of extraction is therefore the whole app subsystem, not just
the renderer package.

## Scope

For this plan, the "app subsystem" includes:

- AppSpec/AppDefinition domain logic
- app-definition validation, persistence, and patch streaming
- app-generation chat modes, slash commands, prompt shaping, and preview flow
- App Config, App Preview, and App mode frontend/runtime rendering
- app-definition HTTP and MCP routes/tools
- app deployment publish/load/runtime behavior

This plan assumes the subsystem becomes a first-party plugin in `plugins/`, but
the host/plugin registries still need to be built before code can move cleanly.

## Goals

- Make the app subsystem optional without breaking the rest of Setta.
- Preserve current product behavior when the subsystem is enabled, without
  preserving obsolete internal seams just for compatibility.
- Remove hard dependencies on app-specific contracts from core host code.
- Keep Go as the source of truth for subsystem-owned contracts and validation.
- Make the extracted subsystem packageable later as an optional first-party
  add-on or plugin.

## Non-Goals

- Redesigning the AppSpec contract during the extraction.
- Supporting multiple renderer implementations during the extraction.
- Replacing the current AppSpec catalog with a new generic UI IR.
- Reworking the general plugin system as part of the first extraction step.
- Preserving legacy storage shapes, import paths, command stubs, or generated
  names solely for backward compatibility.

## Concrete Decisions

The following decisions are fixed for this extraction unless a later design doc
explicitly changes them.

### 1) Plugin identity and default state

- The extracted subsystem will land as a first-party plugin in
  `plugins/setta-json-render-app-gen/`.
- The plugin id will be `setta-json-render-app-gen`.
- The plugin manifest will set `enabledByDefault: false`.
- The intended steady state is:
  - Setta works normally without `setta-json-render-app-gen` enabled.
  - AppSpec/app-generation/app-mode behavior only appears when
    `setta-json-render-app-gen` is installed and enabled.

### 2) Meaning of "disabled" and "absent"

For this project, "disabled" and "absent" are treated the same at the product
surface:

- no app HTTP routes are registered
- no app MCP tools are registered
- no app-generation slash commands or prompt contributions are registered
- no App Config/App Preview/App mode frontend surfaces are registered
- no app deployment runtime is available

The implementation may distinguish between:

- plugin present but disabled
- plugin not installed
- plugin installed but failed to load

But the host-facing default should still be "app capabilities unavailable" with
feature-specific error messages where needed.

### 3) No backward-compatibility requirement

- There are no external users depending on the current app-specific storage
  shape, import paths, command stubs, generated names, or route surfaces.
- Do not add compatibility shims, legacy read/write paths, migrations,
  dual-format support, reserved command stubs, import-path bridges, or
  generated-name aliases just to preserve the pre-extraction shape.
- If compatibility-only logic is introduced temporarily during extraction, it
  becomes cleanup debt to remove before the plan is done.
- Prefer the simplest final ownership model over preserving current internal
  seams.

### 4) Ownership of persisted app data

- App-specific persisted data should end in the simplest clean ownership model,
  even if that changes the current on-disk layout.
- `setta-json-render-app-gen` owns the meaning, validation, mutation,
  publishing, and runtime interpretation of app data.
- Core should not carry app-specific storage fields, typed payloads, or helper
  logic solely to preserve backward compatibility.
- If changing or deleting the current `project.json.appDefinition` or
  `app_specs/` layout makes the ownership boundary cleaner, do that directly.
  Do not add migration support unless a current in-repo workflow cannot be
  updated in the same change.

### 5) Generated contracts

- App-specific generated OpenAPI/TypeScript/shared-value outputs should move to
  the cleanest ownership boundary practical during extraction.
- Only plugin code may import or rely on app-specific generated surfaces.
- Core host code must stop importing app-specific generated types.
- Do not keep or add compatibility aliases, package-path remaps, or shared-name
  preservation layers solely to avoid churn.

### 6) CLI, route, and startup behavior when unavailable

- App entrypoints should be exposed through the cleanest ownership model, not
  through reserved host stubs kept only for compatibility.
- If `setta-json-render-app-gen` is unavailable, app routes and app entrypoints
  may simply be absent, or they may fail loudly through the feature-owned path.
- App HTTP routes should simply be absent when the plugin is unavailable.
  Requests to `/app/...` should therefore return `404`.
- Attempts to load app deployments without the plugin should fail
  loudly at startup or command entry, not degrade into share mode or partial
  behavior.

### 7) Frontend loading model

- The host frontend shell must not statically import app plugin UI.
- The backend capability manifest will advertise whether
  `setta-json-render-app-gen` is enabled and which app surfaces are available.
- When the capability is present, the host frontend lazily loads the plugin's
  frontend entrypoint and lets it register:
  - routes/pages
  - overview panes
  - slash commands
  - feature-scoped state hooks
- When the capability is absent, the host never loads the app plugin frontend
  chunk.

### 8) Historical chat and stale data

- There is no requirement to preserve historical app-generation provenance,
  stale app-specific persisted payloads, or older internal-only chat metadata.
- Prefer deleting compatibility branches and updating current in-repo fixtures
  over keeping hydration/replay logic for legacy app-generation turns.
- Failing loudly on obsolete app-specific data is preferable to adding hidden
  fallback behavior.

## Current Coupling Inventory

### Backend coupling

Core backend packages currently own app-specific behavior in multiple places:

- `internal/agentruns/app_generation.go`
  - owns allowed app-generation mode values
- `internal/managedchat/*` and `internal/externalagents/*`
  - inject app-generation prompts and image-mode validation
- `internal/mcpx/server.go`
  - registers `get_app_definition`, `validate_app_definition`,
    `set_app_definition`, `stream_app_definition`, and `update_app_definition`
- `internal/httpapi/app_definition_routes.go`
  - owns app-definition HTTP routes
- `internal/projectstate/app_definition_*`
  - owns app-definition reads, writes, compare-and-set helpers, and patch
    application
- `internal/appspec/*`
  - owns the AppSpec catalog, validation, diagnostics, patch parsing, and store
- `internal/deployments/*`
  - publishes and loads app deployments

### Frontend coupling

Core frontend code currently mounts and controls the subsystem directly:

- `frontend/src/components/App/*`
  - renderer, registry, bindings, theme, and runtime model
- `frontend/src/components/Pages/Project/AppPreview.tsx`
  - IDE preview surface
- `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
  - app authoring/editor workbench
- `frontend/src/components/Pages/App/AppPage.tsx`
  - app deployment runtime page
- `frontend/src/components/Chat/appGenerationSlashCommands.ts`
  - app-generation slash commands
- `frontend/src/state/actions/ai.ts`
  - streamed app preview patch application
- `frontend/src/state/appSpecPatchStreaming.ts`
  - frontend app-spec patch preview accumulator
- `frontend/src/state/definitions.ts`
  - app definition and preview stores live in generic shared state

### Shared/generated coupling

App-specific contracts are currently mixed into shared surfaces:

- generated frontend enum/types for app-generation modes
- generated OpenAPI/non-HTTP surfaces for app-definition fields
- generated `AppSpecPatchPolicyConfig` shared values

### Deployment/runtime coupling

App mode is not just a page. It is a dedicated deployment/runtime path with:

- app deployment session bootstrapping
- app deployment state loading
- app deployment publish/load behavior
- app-mode CLI/runtime assumptions

## Target End State

After extraction, Setta should have two layers.

### 1) Core host

Core host code should own only generic primitives:

- project/session/runtime lifecycle
- HTTP route registration infrastructure
- MCP tool registration infrastructure
- websocket/event transport infrastructure
- CLI command registration infrastructure
- deployment type registration infrastructure
- frontend shell routing/pane registration infrastructure
- feature capability discovery
- shared project state primitives that are truly cross-feature

Core host should not know about:

- AppSpec
- AppDefinition
- `json_render` generation modes
- app deployment routes or pages
- app-definition validation or patch formats

### 2) App subsystem / plugin

The extracted subsystem should own:

- AppSpec/AppDefinition contracts and persistence
- the app catalog and validation
- app-definition HTTP routes and MCP tools
- app-generation prompt contributions, slash commands, and preview logic
- App Config, App Preview, and App mode pages/components
- app deployment publish/load/runtime logic
- the first-party plugin package `plugins/setta-json-render-app-gen/`

If the `setta-json-render-app-gen` plugin is disabled or absent:

- app-generation commands/modes disappear
- app-definition routes/tools disappear
- App Config and App Preview UI disappear
- app deployment publish/serve behavior is unavailable
- existing non-app Setta behavior continues to work

## Recommended Extraction Strategy

Do this in two stages:

1. Introduce host/plugin registries and capability gating.
2. Move the subsystem into the first-party plugin
   `plugins/setta-json-render-app-gen/`.

Do not start by moving code into `plugins/setta-json-render-app-gen/` before
the registries exist. The current plugin/runtime surface is not designed to
register all of the things the app subsystem needs:

- backend routes
- MCP tools
- chat mode contributions
- deployment types
- frontend pages/panes/routes
- generated/shared contract surfaces

## Host Interfaces To Introduce First

The host needs explicit extension points before code can move cleanly.

### Backend registries

Introduce registries for:

- HTTP route contributions
- MCP tool contributions
- chat mode/prompt contributions
- deployment type contributions
- publish/load/runtime handlers
- frontend shared-value exports and capability descriptors

### Frontend registries

Introduce registries for:

- top-level routes/pages
- overview panes/tabs
- slash command contributions
- feature-scoped state initialization/reset hooks
- feature capability gating

### Capability manifest

Add a backend-owned capability manifest that the frontend can read at startup.
At minimum it should indicate whether `setta-json-render-app-gen` is enabled
and which surfaces are available:

- app authoring UI
- app preview UI
- app-generation chat modes
- app deployment runtime

This avoids frontend hard-coding of app pages/commands when the subsystem is
absent.

## Extraction Phases

### Phase 0: Freeze behavior and define the cut line

Deliverable: a stable baseline and explicit extraction contract.

Tasks:

- Inventory all app-specific routes, tools, pages, stores, and generated
  surfaces.
- Freeze current public names for the first extraction pass:
  - `json_render`
  - `json_render_with_image`
  - app-definition MCP tool names
  - app-definition HTTP route names
- Add missing coverage where current behavior is under-tested:
  - app-generation prompt selection
  - streamed preview patch application
  - app-definition validation/write flow
  - app deployment publish/load/runtime
- Decide and document the initial disabled-state behavior.

Exit criteria:

- There is a written inventory of owned surfaces.
- There are tests covering the current happy paths and the expected disabled
  behavior.

### Phase 1: Add host registries and capability gating

Deliverable: core can host optional feature modules without knowing app details.

Tasks:

- Add backend registries for routes, MCP tools, chat mode contributions, and
  deployment types.
- Add frontend registries for routes/pages, panes, and slash commands.
- Add a capability manifest flow from backend to frontend.
- Create the initial plugin package skeleton at
  `plugins/setta-json-render-app-gen/` with `enabledByDefault: false`, even if
  it temporarily delegates to host-owned code.
- Register the existing app subsystem through the new plugin/registry path
  without moving most code yet.
- Remove direct unconditional mounting of app pages/panes/commands from the
  host shell.

Exit criteria:

- Core bootstraps the current app behavior through registries instead of direct
  imports.
- Disabling `setta-json-render-app-gen` hides app UI and app routes without
  breaking core.

### Phase 2: Isolate backend AppSpec/AppDefinition ownership

Deliverable: app-specific domain logic lives behind the
`setta-json-render-app-gen` plugin.

Tasks:

- Move `internal/appspec/*` into a dedicated app feature package.
- Move app-definition route registration out of generic `internal/httpapi`
  bootstrapping into the feature package.
- Move app-definition MCP tool registration out of generic `internal/mcpx`
  bootstrapping into the feature package.
- Move app-definition validation/write/stream helpers behind a subsystem-owned
  service interface.
- Remove host-owned app storage helpers and typed payload handling instead of
  preserving them as compatibility seams.

Recommended first-pass backend shape:

- `plugins/setta-json-render-app-gen/backend/...`
- host-facing shared helpers only where strictly required

Exit criteria:

- Core no longer imports app-specific validators, tool definitions, or route
  handlers directly.
- The app subsystem can register or omit its backend surfaces through the host
  registries.

### Phase 3: Isolate app-generation integration

Deliverable: app-generation is contributed by the app subsystem, not hard-coded
into generic chat services.

Tasks:

- Replace hard-coded app-generation mode branching in generic managed chat code
  with chat mode contributions.
- Move prompt-building, image-mode validation, and tool guidance into the app
  subsystem.
- Move app-generation slash command definitions behind frontend command
  registries.
- Remove or simplify chat hydration and replay logic that exists only for
  historical app-generation compatibility.
- Move or rename existing app-generation generated surfaces directly instead of
  preserving shared imports just to avoid churn.

Important rule:

- `prompt_builder` and `mcp_server` should be treated as app subsystem modes for
  extraction purposes because they still converge on AppSpec/app-definition
  persistence.

Exit criteria:

- Generic chat code no longer needs to know what `json_render` means.
- Disabling `setta-json-render-app-gen` removes app-generation commands and
  prompt injection without breaking plain chat.

### Phase 4: Isolate frontend authoring and runtime UI

Deliverable: all app-specific frontend UI lives behind the
`setta-json-render-app-gen` plugin.

Tasks:

- Move `frontend/src/components/App/*` into a feature module.
- Move App Config, App Preview, and App mode page wiring into the same feature
  module.
- Move app preview state out of generic shared stores or namespace it under a
  feature-owned store segment.
- Route streamed app patch previews through a feature-owned preview controller.
- Keep renderer semantics unchanged for the first pass.

Recommended first-pass frontend shape:

- `plugins/setta-json-render-app-gen/frontend/...`
- host-facing registration adapters only where strictly required

Exit criteria:

- Host frontend shell mounts app UI only through feature registration.
- Disabling `setta-json-render-app-gen` removes app pages/panes/preview state
  cleanly.

### Phase 5: Isolate app deployment mode and publish/runtime behavior

Deliverable: app deployment is a feature-owned deployment type, not a core
special case.

Tasks:

- Introduce a deployment type registry in the backend host.
- Move app publish/load/runtime behavior behind an app deployment type
  contribution.
- Move app session bootstrap routes and app deployment state routes under the
  feature-owned registration path.
- Remove unconditional core assumptions that app deployments exist.
- Expose app CLI/runtime entrypoints through the cleanest ownership model.
- Remove reserved host command stubs kept only for backward compatibility.

Exit criteria:

- Core deployment/runtime code can run without app deployment support.
- App deployment behavior is restored by enabling the app subsystem.

### Phase 6: Remove compatibility shims and legacy support

Deliverable: compatibility-only layers added during extraction are removed.

Tasks:

- Remove host-side re-export shims and bridge files that only preserve old
  import paths or frontend module layout.
- Remove compatibility-only OpenAPI/shared-generation aliases and host-side
  export anchors that only keep old names reachable.
- Remove compatibility-only command stubs, fallback branches, and dual-path
  logic that no longer serve the final architecture.
- Re-audit the repo for compatibility-driven glue added during earlier phases
  and delete it before moving on.

Exit criteria:

- Host and plugin code use direct ownership paths rather than shimmed
  re-exports wherever the direct path is practical.
- No compatibility-only bridge remains without a current architectural reason
  documented near the code.

### Phase 7: Clean up persistence and generated contracts

Deliverable: the subsystem boundary is explicit in storage and generated
surfaces.

Tasks:

- Move persisted app data to the simplest plugin-owned shape practical during
  extraction.
- Remove host-owned legacy `appDefinition` + `app_specs/` handling if it only
  exists for backward compatibility.
- Keep app-specific generated types out of host-owned code and move or rename
  them directly instead of adding compatibility aliases.
- Move `AppSpecPatchPolicyConfig` and similar app-only shared exports under the
  subsystem if practical.

Recommended approach:

- Prefer deletion, direct moves, and callsite updates over migrations,
  dual-read/write support, or compatibility shims.

Exit criteria:

- There is a documented ownership model for app-specific persisted state and
  generated surfaces.
- Core shared generation no longer grows new app-only contracts by accident.
- Host-owned code no longer carries app-only storage contracts or generated
  compatibility glue.

### Phase 8: Package the subsystem

Deliverable: the first-party plugin `plugins/setta-json-render-app-gen/` can
be shipped optionally and remains non-default.

Tasks:

- Materialize the final plugin package structure under
  `plugins/setta-json-render-app-gen/`.
- Ensure packaging includes:
  - backend registrars
  - frontend bundle/assets
  - generated contract surfaces
  - feature metadata needed for plugin discovery/loading
- Add startup wiring that loads `setta-json-render-app-gen` when enabled and
  reports disabled capabilities when absent.
- Add developer install/build flows for enabled vs disabled distributions.

Exit criteria:

- A distribution can run without `setta-json-render-app-gen`.
- A distribution with `setta-json-render-app-gen` enabled preserves current
  behavior.

## Persistence Strategy

The biggest architectural question is how aggressively to simplify storage while
the subsystem boundary moves.

### Recommended approach

- Prefer the simplest final plugin-owned storage shape now rather than carrying
  legacy payloads forward.
- Update in-repo callsites, fixtures, and tests in the same change instead of
  adding migration or legacy-read support.
- If a temporary opaque payload seam is useful during refactoring, treat it as
  transitional cleanup debt rather than a preserved contract.

## Simplicity Rules

The subsystem extraction should preserve the intended current app feature
behavior when the plugin is enabled, but it does not need to preserve obsolete
internal contracts.

Do not add or keep these solely for backward compatibility:

- legacy persisted app payload shapes
- shared generated aliases or package-path remaps
- host-side re-export shims for moved plugin code
- reserved host command stubs
- historical app-generation hydration/replay fallbacks

When disabled:

- app routes, tools, commands, and UI should disappear cleanly
- app startup should fail loudly and specifically if an unavailable entrypoint
  is reached
- stale app-specific data may be ignored, rejected, or deleted if that keeps
  the ownership boundary simpler

## Testing Plan

### Backend tests

- unit tests for feature-owned AppSpec validation and patch parsing
- unit tests for app-generation prompt contribution logic
- integration tests for feature-owned route/tool registration
- deployment publish/load/runtime tests with subsystem enabled
- startup/runtime tests with subsystem disabled
- command tests for `setta app` when plugin is unavailable

### Frontend tests

- unit tests for feature-owned preview state and patch preview application
- integration tests for App Config save/validate/preview flow
- integration tests for app slash-command registration and disabled-state hiding
- routing tests for App mode and feature-gated pages
- lazy-load tests ensuring the app frontend chunk is not loaded when disabled

### End-to-end tests

- Playwright coverage for:
  - app authoring flow
  - app-generation flow
  - app deployment runtime flow
  - disabled-state behavior when subsystem is absent

### Verification command

- Run `./check_quality.sh` after the extraction work or each major phase.

## Sequencing Recommendation

1. Add registries and capability manifest.
2. Create `plugins/setta-json-render-app-gen/` as a disabled-by-default
   first-party plugin and register the current subsystem through that path with
   no major moves yet.
3. Move backend app domain/routes/tools behind the plugin.
4. Move app-generation prompt/mode/command ownership behind the plugin.
5. Move frontend App Config/Preview/App mode behind the plugin frontend entry.
6. Move app deployment type handling behind deployment registries and plugin
   ownership.
7. Remove compatibility shims and legacy-only glue.
8. Clean up generated and persistence ownership.
9. Finish plugin packaging and disabled-state behavior.

## Risks And Mitigations

### Risk: extracting too early into the current plugin model

Mitigation:

- introduce host/plugin registries first
- move code into `plugins/setta-json-render-app-gen/` only after registration
  surfaces exist

### Risk: hidden coupling in generated types and state stores

Mitigation:

- inventory generated surfaces explicitly in Phase 0
- add disabled-state tests for hydration and startup

### Risk: compatibility cleanup creates noisy callsite churn

Mitigation:

- prefer direct callsite updates over maintaining two paths
- keep cleanup slices narrow and fully verified

### Risk: chat and deployment code continue to assume app support exists

Mitigation:

- add capability gating and registries before moving code
- make subsystem-disabled boot paths part of CI coverage

### Risk: stale app-specific data and tests become invalid during cleanup

Mitigation:

- update fixtures/tests in the same change that removes the old path
- fail loudly rather than adding fallback behavior

## Definition Of Done

This project is done when all of the following are true:

- core backend and frontend can run without the app subsystem enabled
- `plugins/setta-json-render-app-gen/` exists as a first-party plugin and is
  disabled by default
- the app subsystem registers its own routes, tools, chat modes, and pages
- generic chat, deployment, and shell code no longer hard-code app concepts
- current app behavior is preserved when the subsystem is enabled
- disabled-state behavior is tested and documented
- compatibility-only shims, migrations, and legacy support layers have been
  removed unless they are still required by the final architecture and
  explicitly justified
- the subsystem can be enabled through the plugin system rather than being
  compiled in as a mandatory default feature
