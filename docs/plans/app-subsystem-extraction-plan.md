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

This plan assumes the subsystem remains first-party during the extraction. True
plugin packaging is a final step, not the starting point.

## Goals

- Make the app subsystem optional without breaking the rest of Setta.
- Preserve current behavior when the subsystem is enabled.
- Remove hard dependencies on app-specific contracts from core host code.
- Keep Go as the source of truth for subsystem-owned contracts and validation.
- Make the extracted subsystem packageable later as an optional first-party
  add-on or plugin.

## Non-Goals

- Redesigning the AppSpec contract during the extraction.
- Supporting multiple renderer implementations during the extraction.
- Replacing the current AppSpec catalog with a new generic UI IR.
- Reworking the general plugin system as part of the first extraction step.
- Breaking existing app deployments or silently dropping persisted app data.

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

### 2) App subsystem

The extracted subsystem should own:

- AppSpec/AppDefinition contracts and persistence
- the app catalog and validation
- app-definition HTTP routes and MCP tools
- app-generation prompt contributions, slash commands, and preview logic
- App Config, App Preview, and App mode pages/components
- app deployment publish/load/runtime logic

If the subsystem is disabled or absent:

- app-generation commands/modes disappear
- app-definition routes/tools disappear
- App Config and App Preview UI disappear
- app deployment publish/serve behavior is unavailable
- existing non-app Setta behavior continues to work

## Recommended Extraction Strategy

Do this in two stages:

1. Extract into a first-party feature module behind explicit registries.
2. Only after that boundary is working, package it as an optional plugin/add-on.

Do not start by moving code into `plugins/` or by trying to shoehorn the
current subsystem into the existing plugin model. The current plugin/runtime
surface is not designed to register all of the things the app subsystem needs:

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
At minimum it should indicate whether the app subsystem is enabled and which
surfaces are available:

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
- Register the existing app subsystem through those registries without moving
  code yet.
- Remove direct unconditional mounting of app pages/panes/commands from the
  host shell.

Exit criteria:

- Core bootstraps the current app behavior through registries instead of direct
  imports.
- A build/runtime flag can hide app UI and app routes without breaking core.

### Phase 2: Isolate backend AppSpec/AppDefinition ownership

Deliverable: app-specific domain logic lives under one backend feature module.

Tasks:

- Move `internal/appspec/*` into a dedicated app feature package.
- Move app-definition route registration out of generic `internal/httpapi`
  bootstrapping into the feature package.
- Move app-definition MCP tool registration out of generic `internal/mcpx`
  bootstrapping into the feature package.
- Move app-definition validation/write/stream helpers behind a subsystem-owned
  service interface.
- Keep the current on-disk layout initially unless storage migration is required
  to complete the extraction.

Recommended first-pass package shape:

- `internal/features/app/domain/*`
- `internal/features/app/httpapi/*`
- `internal/features/app/mcp/*`
- `internal/features/app/runtime/*`

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
- Gate chat hydration and replay logic so missing subsystem support does not
  crash when historical messages contain app-generation provenance.
- Decide whether app-generation mode enums stay in shared generated types for
  the first pass or move into subsystem-owned generated outputs later.

Important rule:

- `prompt_builder` and `mcp_server` should be treated as app subsystem modes for
  extraction purposes because they still converge on AppSpec/app-definition
  persistence.

Exit criteria:

- Generic chat code no longer needs to know what `json_render` means.
- Disabling the subsystem removes app-generation commands and prompt injection
  without breaking plain chat.

### Phase 4: Isolate frontend authoring and runtime UI

Deliverable: all app-specific frontend UI lives under one feature module.

Tasks:

- Move `frontend/src/components/App/*` into a feature module.
- Move App Config, App Preview, and App mode page wiring into the same feature
  module.
- Move app preview state out of generic shared stores or namespace it under a
  feature-owned store segment.
- Route streamed app patch previews through a feature-owned preview controller.
- Keep renderer semantics unchanged for the first pass.

Recommended first-pass frontend shape:

- `frontend/src/features/app/runtime/*`
- `frontend/src/features/app/editor/*`
- `frontend/src/features/app/chat/*`
- `frontend/src/features/app/state/*`

Exit criteria:

- Host frontend shell mounts app UI only through feature registration.
- Disabling the subsystem removes app pages/panes/preview state cleanly.

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
- Decide how the CLI exposes feature-owned commands:
  - direct feature command registration, or
  - a core command with feature-contributed subcommands

Exit criteria:

- Core deployment/runtime code can run without app deployment support.
- App deployment behavior is restored by enabling the app subsystem.

### Phase 6: Clean up persistence and generated contracts

Deliverable: the subsystem boundary is explicit in storage and generated
surfaces.

Tasks:

- Decide whether to keep the legacy `appDefinition` + `app_specs/` persistence
  shape for compatibility or migrate to a feature-extension storage model.
- If migration is required, add explicit legacy read support and a controlled
  write path.
- Decide whether app-specific generated types stay in the shared generated
  bundle or move to a subsystem-owned generated bundle.
- Move `AppSpecPatchPolicyConfig` and similar app-only shared exports under the
  subsystem if practical.

Recommended approach:

- Keep persistence compatibility first.
- Defer persistence-shape migration until after the subsystem boundary is
  working and tests are green.

Exit criteria:

- There is a documented ownership model for app-specific persisted state and
  generated surfaces.
- Core shared generation no longer grows new app-only contracts by accident.

### Phase 7: Package the subsystem

Deliverable: the first-party app subsystem can be shipped optionally.

Tasks:

- Define packaging format:
  - first-party optional module, or
  - first-party plugin package
- Ensure packaging includes:
  - backend registrars
  - frontend bundle/assets
  - generated contract surfaces
  - version compatibility metadata
- Add startup wiring that loads the subsystem when present and reports disabled
  capabilities when absent.
- Add developer install/build flows for enabled vs disabled distributions.

Exit criteria:

- A distribution can run without the app subsystem.
- A distribution with the subsystem enabled preserves current behavior.

## Persistence Strategy

The biggest architectural question is how hard to separate storage during the
first pass.

### Recommended first pass

- Keep the current persisted AppSpec/AppDefinition data model readable and
  writable.
- Move ownership of that model into the subsystem code, but do not force an
  on-disk migration immediately.

This keeps the extraction focused on ownership and registration rather than data
migration risk.

### Optional second pass

If a stronger separation is needed later:

- add a generic feature-extension section to project state
- migrate `appDefinition` into an app feature-owned extension payload
- move `app_specs/` into a feature-owned storage namespace

This should be a separate migration project, not bundled into the first cut
unless extraction is otherwise impossible.

## Compatibility Rules

The subsystem extraction must preserve these behaviors when enabled:

- existing app-definition files continue to load
- existing app deployments continue to serve
- existing app-generation slash commands keep working
- existing MCP tool names and HTTP route names remain valid
- streamed preview patch semantics remain unchanged

When disabled:

- old app data may remain on disk, but host code should not crash on load
- historical chats containing app-generation provenance must hydrate safely
- app deployment startup should fail loudly and specifically, not silently
  downgrade to some other mode

## Testing Plan

### Backend tests

- unit tests for feature-owned AppSpec validation and patch parsing
- unit tests for app-generation prompt contribution logic
- integration tests for feature-owned route/tool registration
- deployment publish/load/runtime tests with subsystem enabled
- startup/runtime tests with subsystem disabled

### Frontend tests

- unit tests for feature-owned preview state and patch preview application
- integration tests for App Config save/validate/preview flow
- integration tests for app slash-command registration and disabled-state hiding
- routing tests for App mode and feature-gated pages

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
2. Register the existing app subsystem through those registries with no major
   moves yet.
3. Move backend app domain/routes/tools into a dedicated feature package.
4. Move app-generation prompt/mode/command ownership into the feature package.
5. Move frontend App Config/Preview/App mode into a dedicated feature module.
6. Move app deployment type handling behind deployment registries.
7. Clean up generated and persistence ownership.
8. Package the subsystem optionally.

## Risks And Mitigations

### Risk: extracting too early into the current plugin model

Mitigation:

- introduce first-party feature registries first
- package later

### Risk: hidden coupling in generated types and state stores

Mitigation:

- inventory generated surfaces explicitly in Phase 0
- add disabled-state tests for hydration and startup

### Risk: persistence migration expands the project too much

Mitigation:

- keep storage compatibility in the first pass
- make storage migration a separate follow-up unless it blocks the extraction

### Risk: chat and deployment code continue to assume app support exists

Mitigation:

- add capability gating and registries before moving code
- make subsystem-disabled boot paths part of CI coverage

### Risk: historical app-generation data becomes unreadable

Mitigation:

- keep mode names and tool names stable during the first pass
- ensure hydration paths degrade gracefully when feature support is absent

## Definition Of Done

This project is done when all of the following are true:

- core backend and frontend can run without the app subsystem enabled
- the app subsystem registers its own routes, tools, chat modes, and pages
- generic chat, deployment, and shell code no longer hard-code app concepts
- current app behavior is preserved when the subsystem is enabled
- disabled-state behavior is tested and documented
- packaging the subsystem separately is straightforward rather than theoretical
