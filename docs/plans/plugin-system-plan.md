# Plugin System Plan (Frontend + Backend + Content)

This document proposes a pragmatic plugin system for Setta that supports:

- Backend plugins (Python, FastAPI, MCP, LSP, external agent adapters).
- Frontend plugins (new UI, new section rendering, new commands/panes).
- Content plugins (blueprints/presets you can export from Setta and reuse).
- "Drop-in" installation by copying a folder into `plugins/` (no marketplace or discovery required).

The focus is on an implementation that works in both dev and built modes, keeps Setta's performance constraints in mind, and does not require regenerating core generated types per plugin.

## Goals

- Allow users to drop a plugin folder into a workspace `plugins/` directory and have it load.
- Support backend-only, frontend-only, and full-stack plugins.
- Support plugin-defined section types and UI types without needing to edit core switch statements for every plugin.
- Support plugin-defined AI integrations (external agent adapters, MCP tools, custom chat providers).
- Support plugin-defined language tooling (LSP configuration, optional new languages over time).
- Provide a first-class way to export a Group (or selection) into a reusable "content plugin" from inside Setta.
- Provide a first-class way to export a ProjectConfig (or entire project) as a reusable plugin template that can be imported into other Setta workspaces.
- Keep load order deterministic and failures debuggable.
- Keep runtime overhead low when plugins are not used (lazy load frontends; avoid work per render).

## Non-goals (Initial)

- Marketplace, search, auto-updates, ratings, signatures, trust verification.
- Sandboxing untrusted code in a secure way (plugins are assumed local and trusted at first).
- Supporting arbitrary runtime TypeScript compilation in the browser.
- Perfect backwards compatibility for plugin API between Setta versions.

## Current Constraints (Feb 2026)

- Frontend is a Vite-built React bundle in production (served as static assets by the backend).
- Backend types use discriminated unions generated under `backend/setta/types/generated/`, and frontend has generated types under `frontend/src/utils/generatedTypes.ts`.
- Section types are currently a closed set (`SectionType` enum), and the UI renders sections via centralized switches.
- MCP tools are registered by importing modules (see `docs/reference/mcp-system-overview.md`).
- Setta has three runtime modes: IDE, Share, App. Share/App are both "deployment modes" with stronger restrictions than IDE mode (see `docs/reference/sharing-mode-vs-ide-mode.md`).

## Core Idea

Treat "plugin" as a first-class runtime concept with three layers:

1. Discovery and loading (scan folders, read manifest, enable/disable, lifecycle).
2. A stable host API (backend and frontend registries for extension points).
3. A small number of "escape hatches" in core data models to represent plugin-defined things.

The key design choice is to add a small number of built-in, generic "plugin" types that can carry plugin-defined subtypes.

## Plugin Types (What A Plugin Can Be)

- Backend plugin.
- Frontend plugin.
- Full plugin (backend + frontend).
- Content-only plugin.

Examples mapped to these types:

- Different AI chat bots or skills.
- Backend plugin: adds an external agent adapter and a few MCP tools.
- Content-only plugin: adds blueprints (exported section groups), prompts, templates.
- Frontend plugin: adds a new pane, command palette actions, and a custom section renderer.
- Language tooling plugin: adds an LSP server definition and configuration UI, later possibly adds a new `CodeLanguage`.

## Filesystem Layout

### Default plugin directories

Proposed search order:

- Workspace plugins: `<workspace>/plugins/*/setta.plugin.json`
- Setta-files plugins (workspace-scoped, non-shareable): `<setta_files_root>/plugins/*/setta.plugin.json` (optional; `setta_files_root` can be local or global, see `docs/reference/setta-files.md`)
- Global user-level plugins: `<setta_home>/plugins/*/setta.plugin.json` (optional; typically `~/.setta/plugins`, resolved via `resolve_setta_home()`, override with `SETTA_HOME`)

Workspace `plugins/` is the primary "drop a folder in" mechanism and is the only directory that is expected to be shareable via git.

### Install scopes and precedence

Treat installation location as an explicit scope:

- `workspace`: `<workspace>/plugins/<pluginId>/...`
- `setta_files`: `<setta_files_root>/plugins/<pluginId>/...` (workspace-scoped but not in git)
- `global`: `<setta_home>/plugins/<pluginId>/...`

Runtime precedence for duplicate plugin ids:

1. `workspace`
2. `setta_files`
3. `global`

If the same `pluginId` exists in multiple scopes, the highest-precedence plugin is the active one; lower-precedence copies are marked as shadowed in plugin status/debug output.

Rationale:

- Keeps behavior deterministic.
- Lets teams override a globally installed plugin in a specific workspace without mutating the global copy.

### One plugin folder vs separate frontend/backend folders

Recommendation: keep a single plugin folder per plugin under `plugins/<pluginId>/`, and let that folder contain optional `backend/`, `frontend/`, and `content/` subfolders.

Reasons:

- Full-stack plugins are naturally one unit (one id, one version, one enable switch).
- Splitting into `frontend plugins` and `backend plugins` folders creates version skew problems and forces Setta to "pair" halves that may not match.
- "Drop-in" install stays simple: copy one folder (or unzip one archive) into `plugins/`.

UI convenience: the in-app plugin file browser can still provide top-level view toggles (for example "Frontend files" and "Backend files") that just jump into `plugins/<pluginId>/frontend/` or `plugins/<pluginId>/backend/` for the selected plugin. That gets the usability benefits without changing the on-disk model.

### Plugin folder structure

Example:

```text
plugins/
  setta-rust-tools/
    setta.plugin.json
    backend/
      entrypoint.py
      rust_lsp.py
    frontend/
      dist/
        index.js
        index.css
    content/
      blueprints/
        rust-dev-group.json
      prompts/
        review.md
    README.md
```

Notes:

- Frontend output is pre-built JS/CSS. Setta should not need to run Vite to use a plugin.
- Content is plain files that Setta understands (blueprints, prompt templates, etc).

## Manifest: `setta.plugin.json`

The manifest should be small, explicit, and stable. It must include enough information for Setta to:

- Identify the plugin.
- Decide if it is compatible with the running Setta version.
- Know whether it has backend code, frontend code, and/or content.
- Know what capabilities it wants to register (for future permission gating).

Example:

```json
{
  "schemaVersion": 1,
  "id": "setta-rust-tools",
  "name": "Rust Tools",
  "version": "0.1.0",
  "settaVersionRange": ">=0.0.0",
  "enabledByDefault": false,
  "backend": {
    "entrypoint": "backend/entrypoint.py"
  },
  "frontend": {
    "entrypoint": "frontend/dist/index.js",
    "style": "frontend/dist/index.css"
  },
  "content": {
    "blueprintsDir": "content/blueprints",
    "projectTemplatesDir": "content/project_templates",
    "promptsDir": "content/prompts"
  },
  "capabilities": [
    "registerSectionKinds",
    "registerMcpTools",
    "registerLanguageServer"
  ]
}
```

Suggested fields:

- `schemaVersion`: manifest schema version (integer).
- `id`: stable plugin id (string). Recommended: normalized package-style name (PEP 503 style), for example `setta-rust-tools`.
- `name`: human name.
- `version`: plugin version (semver string).
- `settaVersionRange`: compatibility constraint.
- `enabledByDefault`: default enable behavior for new workspaces.
- `backend.entrypoint`: relative path to Python entrypoint.
- `frontend.entrypoint`: relative path to prebuilt JS entrypoint.
- `frontend.style`: optional CSS path.
- `content.blueprintsDir`: optional folder for blueprint JSONs.
- `content.projectTemplatesDir`: optional folder for project template JSONs.
- `content.promptsDir`: optional folder for prompt files.
- `capabilities`: future-facing allowlist for permissions and UI messaging.

### Capability vocabulary (normative MVP)

To keep mode-gating and plugin host behavior deterministic, `capabilities` is a closed string set in MVP:

- `registerSectionKinds`
- `registerPane`
- `registerCommand`
- `registerToolbarItem`
- `registerContextMenu`
- `registerSettingsPanel`
- `registerMcpTools`
- `registerLanguageServer`
- `registerExternalAgentAdapter`
- `registerCodegenTarget`
- `registerRouter`
- `registerStaticDir`
- `writeWorkspacePlugins`

Validation rules:

- Unknown capability values fail manifest validation with `PLUGIN_MANIFEST_INVALID_CAPABILITY`.
- Duplicate capability entries fail manifest validation with `PLUGIN_MANIFEST_DUPLICATE_CAPABILITY`.
- Capability checks are enforced at host API call time. If a plugin calls a host API without an effective capability, the host returns `PLUGIN_CAPABILITY_DENIED`.

### Manifest validation baseline

- Manifest parsing should be strict (`extra=forbid`): unknown fields should fail validation instead of being ignored.
- Validation errors should be surfaced with stable error codes (for example `PLUGIN_MANIFEST_INVALID`, `PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA`, `PLUGIN_MANIFEST_PATH_NOT_FOUND`).
- Invalid plugins remain discoverable in status/debug output but are not activated.

### Plugin identity and uniqueness

Use a Python-ecosystem-friendly ID policy while keeping source identity explicit:

- `id` in the manifest is the plugin's package-style identifier (for example `setta-rust-tools`).
- Global uniqueness is not guaranteed without a central registry, so the host should track a canonical source key in plugin status/state:
  - `pypi:setta-rust-tools`
  - `github:acme/SettaRustTools`
  - `gitlab:team/setta-rust-tools`
- For GitHub or generic git installs, derive the plugin id from `pyproject.toml` `[project].name` when available; fallback to a source-derived id like `gh.acme.setta-rust-tools` when metadata is missing.
- Status/installer output should include both `id` (human-facing plugin identity) and canonical source key (provenance identity).

## Backend Plugins

### Load model

Backend plugins are loaded by a new `PluginManager` during backend initialization, before MCP tools are registered and before the "backend ready" signal is emitted.

The backend must:

- Scan plugin directories and parse manifests.
- Resolve enable/disable state.
- Load backend entrypoints in deterministic order.
- Capture and surface plugin load failures to the UI (notifications and a debug pane).

### Entrypoint contract

Each backend plugin provides one function:

```python
def register(plugin: "BackendPluginContext") -> None:
    ...
```

This keeps plugin import side effects minimal and makes the host responsible for lifecycle.

### Backend dependency/import model (normative MVP)

- Backend plugin code executes inside Setta's backend Python process (no per-plugin virtualenv in MVP).
- The host loads `backend.entrypoint` by file path and temporarily includes the plugin root and `backend/` directory for plugin-local imports.
- Import/load failures (for example missing module, syntax error, missing symbol) mark the plugin `invalid` with error code `PLUGIN_BACKEND_IMPORT_FAILED`; host startup continues.
- `zip`, folder-path, and `github:` installs must be self-contained for backend runtime (plugin-local vendored deps or Setta-runtime deps only).
- `pypi:` installs resolve plugin content from package artifacts at install time; the host still does not perform dependency installation during plugin load.

### BackendPluginContext (host API)

The context object should be the only stable surface plugins need. It should expose:

- `plugin_id` and `plugin_root`.
- `server_mode` (one of `ide | share | app`) and/or `deployment_mode` flag.
- `requested_capabilities` and `effective_capabilities` (post-policy filtering for current mode).
- `register_router(router, *, prefix=...)`.
- `register_static_dir(url_prefix, path)`.
- `register_mcp_tool(func, *, name=None, annotations=None)`.
- `register_external_agent_adapter(adapter)`.
- `register_language_server(provider)`.
- `register_codegen_target(target)`.
- `register_startup_task(coro_fn)`.
- `register_shutdown_task(coro_fn)`.

Implementation note:

- For MCP tools specifically, Setta already supports module-import-based tool registration. A plugin can optionally just import a module that uses `@setta_tool`, but `register_mcp_tool(...)` gives a more explicit path and allows Setta to attach plugin metadata.
- In the current backend, `SettaFastMCP` registers tools during construction. So plugin backend entrypoints that provide MCP tools must be loaded before the MCP server is created.

### Suggested backend extension points (first-class registries)

Make these registries explicit, owned by the host:

- MCP tools registry (plugin id, tool name, callable, schema annotations).
- External agent adapter registry (new run modes, config UI hooks).
- Language server registry (language key to server implementation and settings).
- Codegen registry (codegen target providers, config models, generation hooks).

This makes plugin impact discoverable, testable, and debuggable.

### Routers and endpoints

Backend plugins should be able to add HTTP endpoints, but to reduce collisions:

- Mount plugin routers under `/api/plugins/<pluginId>/...`.
- Provide a small helper in the context for building a pre-configured router with Setta auth and logging dependencies attached.
- Note: plugin endpoints will not be part of Setta's core `Route` enum, so plugin routers should use a plain `fastapi.APIRouter` with string paths (the host is responsible for mounting under `/api/plugins/<pluginId>` with the standard dependencies).

Generated frontend endpoints:

- Initial implementation can avoid integrating plugin endpoints into `pnpm generate` by requiring plugin frontends to use a generic fetch helper for `/api/plugins/...`.
- Later, extend `pnpm generate` to optionally generate plugin endpoints into a plugin-local `generatedEndpoints.ts` that ships with the plugin frontend.

### Deployment modes (share/app) behavior

Default policy:

- Plugin discovery and loading is enabled in IDE and Share.
- Share/App use capability gating: plugins can load, but only a mode-specific subset of capabilities can be activated.
- Capability filtering should be deterministic and visible in both backend status and frontend plugin UI.

Recommended mode policy (initial):

- `ide`: allow all declared capabilities that pass normal compatibility checks.
- `share`: allow UI/content-focused capabilities (`registerSectionKinds`, `registerPane`, `registerCommand`, `registerToolbarItem`, `registerContextMenu`, `registerSettingsPanel`, content template/blueprint access).
- `share`: block infrastructure/power capabilities (`registerMcpTools`, `registerLanguageServer`, `registerExternalAgentAdapter`, `registerCodegenTarget`, `registerRouter`, `registerStaticDir`, `writeWorkspacePlugins`).
- `app`: same as `share` for MVP, with room to tighten later if needed.

Mode matrix (normative MVP):

| Capability | ide | share | app |
| --- | --- | --- | --- |
| `registerSectionKinds` | allow | allow | allow |
| `registerPane` | allow | allow | allow |
| `registerCommand` | allow | allow | allow |
| `registerToolbarItem` | allow | allow | allow |
| `registerContextMenu` | allow | allow | allow |
| `registerSettingsPanel` | allow | allow | allow |
| `registerMcpTools` | allow | block (`mode_policy`) | block (`mode_policy`) |
| `registerLanguageServer` | allow | block (`mode_policy`) | block (`mode_policy`) |
| `registerExternalAgentAdapter` | allow | block (`mode_policy`) | block (`mode_policy`) |
| `registerCodegenTarget` | allow | block (`mode_policy`) | block (`mode_policy`) |
| `registerRouter` | allow | block (`mode_policy`) | block (`mode_policy`) |
| `registerStaticDir` | allow | block (`mode_policy`) | block (`mode_policy`) |
| `writeWorkspacePlugins` | allow | block (`mode_policy`) | block (`mode_policy`) |

Rationale:

- Share/App are intentionally constrained runtimes; capability gating preserves plugin UX while keeping deployment behavior predictable.
- This is a product policy for deterministic behavior and UX, not a hard security sandbox.

### Plugin registry APIs (normative MVP)

Lock endpoint contracts before implementation to avoid backend/frontend drift.

`GET /api/plugins/list` (for frontend loader, active plugins only):

- `schemaVersion`: integer (`1` for MVP).
- `serverMode`: `ide | share | app`.
- `plugins`: list of active plugin descriptors sorted by `pluginId` ascending.

Plugin descriptor fields:

- `pluginId`, `name`, `version`.
- `sourceScope`: `workspace | setta_files | global`.
- `canonicalSourceKey`.
- `frontend`: `{ entrypointUrl?: string, styleUrl?: string }`.
- `content`: `{ hasBlueprints: boolean, hasProjectTemplates: boolean, hasPrompts: boolean }`.
- `effectiveCapabilities`: `string[]`.
- `restartRequired`: boolean.

`GET /api/plugins/status` (debug/observability, all discovered plugins including inactive/broken/shadowed):

- `schemaVersion`: integer (`1` for MVP).
- `serverMode`: `ide | share | app`.
- `plugins`: list sorted by:
  - `pluginId` ascending.
  - scope precedence (`workspace`, `setta_files`, `global`).
  - `sourcePath` ascending.

Status entry fields:

- `pluginId`, `name`, `version`.
- `state`: `active | disabled | invalid | shadowed | pending_restart`.
- `sourceScope`, `sourcePath`, `canonicalSourceKey`.
- `shadowedBySourcePath`: optional string.
- `requestedCapabilities`, `effectiveCapabilities`.
- `blockedCapabilities`: `[{ capability: string, reason: "mode_policy" | "host_policy" | "manifest_invalid" }]`.
- `restartRequired`: boolean.
- `errors`: list of `{ code: string, message: string }`.

### Plugin management APIs (normative MVP)

Lock write contracts in MVP so frontend, CLI, and MCP integrations all call the same backend operations.

`POST /api/plugins/install`:

- request: `{ sourceSpec: string, scope?: "workspace" | "setta_files" | "global", enable?: boolean, force?: boolean }`
- source spec formats:
  - `path:<local-path>`
  - `url:<https-url-to-zip>`
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- response: `{ pluginId, version, sourceScope, sourcePath, canonicalSourceKey, components, state, restartRequired }`

`POST /api/plugins/uninstall`:

- request: `{ pluginId: string, scope?: "workspace" | "setta_files" | "global" }`
- if `scope` is omitted and the plugin exists in multiple scopes, return `PLUGIN_UNINSTALL_SCOPE_REQUIRED`.
- response: `{ pluginId, removedFromScope, restartRequired }`

`POST /api/plugins/enable`:

- request: `{ pluginId: string }`
- response: `{ pluginId, state, restartRequired }`

`POST /api/plugins/disable`:

- request: `{ pluginId: string }`
- response: `{ pluginId, state, restartRequired }`

`POST /api/plugins/rescan`:

- request: `{}`
- response: `{ schemaVersion, serverMode, installedPlugins, activePlugins }`

## Frontend Plugins

### Load model

Frontend plugins are loaded by the UI based on a backend-provided registry:

- Backend exposes `/api/plugins/list` returning enabled plugins and their frontend entrypoints (and optional CSS).
- Frontend lazy-loads plugin JS with native ESM `import()` only (no script-injection path in MVP).
- `/api/plugins/list` returns absolute backend-origin URLs for `frontend.entrypointUrl` and `frontend.styleUrl`, so loader behavior is identical in dev and built modes.

Key requirement:

- No plugin frontend code should be part of the core bundle.
- No plugin frontend code should run unless the plugin is enabled.

### Frontend entrypoint contract

The frontend entrypoint should export:

```ts
export function register(host: SettaPluginHost): void;
```

The host object is the stable API surface.

Implementation note:

- The plugin frontend entrypoint should be a standards-compliant ES module (ESM) so the host can load it via native `import()` without bundler-specific loaders.

### SettaPluginHost (frontend host API)

The host should provide a registry-based API, with high-level primitives only:

- `registerSectionKind(def)`.
- `registerPane(def)` (initially: panes rendered inside a single core "Plugins" hub tab/modal, not arbitrary new top-level Overview tabs).
- `registerCommand(def)`.
- `registerToolbarItem(def)`.
- `registerContextMenu(def)`.
- `registerSettingsPanel(def)`.
- `getProjectContext()` and `subscribeProjectContext(...)`.
- `readSection(sectionId)` and `updateSection(sectionId, patch)`.
- `openArtifact(artifactId)` and `createArtifact(...)`.
- `apiFetch(path, init)` scoped to `/api/plugins/<pluginId>/...`.
- `serverMode` and `effectiveCapabilities` for mode-aware plugin behavior.

Performance note:

- The host should encourage coarse-grained subscriptions and explicit invalidation, not "subscribe to whole project state" patterns.

### Representing plugin-defined section types

Add one new built-in section type to core models:

- `SectionType.Plugin = "Plugin"`
- `PluginSectionImpl` stores the plugin-defined payload as data.

`PluginSectionImpl` suggested fields:

- `type`: `"Plugin"`
- `pluginId`: string
- `kind`: string
- `data`: object
- `schemaVersion`: number (optional)

This is the key escape hatch:

- Setta core only needs to understand `Plugin` sections as a container.
- Plugins define `kind` values and renderers for them.
- Missing plugin renderer yields a generic fallback UI instead of crashing.

This approach avoids needing to regenerate discriminated unions for every plugin-defined section type.

### Rendering plugin sections (recommended MVP strategy)

Use an imperative "mount/unmount/update" renderer API so plugin UIs can be self-contained bundles (including their own dependencies) without trying to share React with the host.

Renderer shape:

```ts
type PluginSectionProps = {
  sectionId: string;
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  readOnly: boolean;
  serverMode: "ide" | "share" | "app";
  effectiveCapabilities: string[];
};

type PluginSectionRenderer = {
  mount(el: HTMLElement, props: PluginSectionProps): void;
  update?(el: HTMLElement, props: PluginSectionProps): void;
  unmount?(el: HTMLElement): void;
};
```

Host-side React component:

- Renders a single `div` mount point.
- Calls `mount` once, `update` on prop changes, and `unmount` on cleanup.

Tradeoffs:

- Pros: simplest interoperability, no import maps, no shared React version constraints.
- Cons: plugin sections run their own rendering trees and can be harder to integrate with Setta keyboard shortcuts and theme unless the host API provides those hooks.

Performance guardrails for plugin sections:

- Keep `mount` lightweight; defer heavy widgets until the section is visible or user-activated.
- Avoid broad subscriptions (`subscribeProjectContext` to whole project state) for each section; prefer selector-based subscriptions scoped to section-relevant data.
- Ensure `update` is incremental and idempotent; avoid full rerenders when unchanged props arrive.
- Share expensive services at plugin scope (for example one poller/store per plugin) rather than one per section instance.
- `unmount` must clean up listeners/timers/observers to prevent leaks during section deletion, disable, and hot reload.
- Add performance coverage for large-canvas scenarios (for example 100+ plugin sections) to catch update fanout regressions.

### Missing renderer fallback UX (normative MVP)

If a `SectionType.Plugin` section exists but the plugin frontend renderer is unavailable, render a stable fallback card instead of a blank/erroring node.

Fallback card fields:

- `pluginId`
- `kind`
- reason (`plugin_disabled`, `plugin_not_installed`, `frontend_load_failed`, or `mode_blocked`)
- compact `data` preview

Fallback card actions:

- "Open Plugins" (jumps to plugin status pane/modal)
- "Copy Section JSON"
- "Delete Section"

Follow-on:

- Add an optional "React component" mode once we are ready to support shared dependencies cleanly.

### Plugin UI types beyond sections

Initial extension points that are high leverage and low risk:

- Add menu items to create plugin sections (new "Add" items).
- Add a single core "Plugins" hub in Overview (or a modal) that can host plugin-provided panes and debug views.
- Add commands (keyboard shortcut registry entries).

Later extension points:

- Canvas node overlays, edge layers, toolbar buttons, context menus, settings pages.

### CSS and theming

Recommended:

- Plugin CSS is loaded only when the plugin is enabled.
- Encourage plugins to scope styles under a root attribute, for example `[data-setta-plugin-root="setta-rust-tools"]`.
- Provide host theme tokens as CSS variables so plugins can match Setta look without copying Tailwind internals.

## Content Plugins (Blueprints, Templates, Skills)

Content plugins are "no code" plugins. They can ship:

- Blueprints (section group templates).
- Project templates (exported ProjectConfigs or entire projects).
- Prompt templates.
- Snippets, meta-control presets, agent profiles, engine configs.

Implementation note (current codebase):

- Prompt templates, agent profiles, engine configs, and external agent configs already have first-class models and persistence under `<setta_files_root>/` with watcher-driven updates. For the MVP, content plugins should either be treated as read-only "template sources" (imported into those stores) or surfaced in a separate "Plugin Content" UI without trying to merge into the mutable stores.

### Blueprints

Blueprints should reuse existing copy/paste infrastructure:

- Frontend already copies sections via `route_prepare_sections_for_copy`.
- Backend already pastes sections via `route_paste_sections`.
- The clipboard schema (`ProjectStateCoreWithSectionVariantMap`) is a good base.

Blueprint file format proposal:

`blueprint.json` suggested fields:

- `schemaVersion`
- `name`
- `description`
- `data`: `ProjectStateCoreWithSectionVariantMap` (same shape as clipboard)
- `recommendedSectionNamePrefix` (optional)

Import behavior:

- "Add blueprint" creates sections by pasting the blueprint at a chosen location.
- If the blueprint is a Group subtree, Setta can paste the Group as one top-level section.

### Exporting a Group as a plugin from inside Setta

Add a UI action:

- "Export Group As Plugin..."

Flow:

1. User selects a Group section (or selection that is auto-wrapped into a Group).
2. Setta calls `prepareSectionsForCopy` for that section id.
3. Setta writes a new plugin folder under `plugins/<pluginId>/`.
4. Setta writes `setta.plugin.json` and `content/blueprints/<name>.json` containing the serialized data.
5. Optionally copy referenced artifacts/code/json sources into `plugins/<pluginId>/content/assets/` and rewrite paths inside the blueprint (later phase).

This turns Setta itself into a "plugin authoring" tool for reusable workflows.

Implementation note:

- Today, the backend has APIs like `route_create_file` but does not have a generic "write arbitrary file contents to workspace root" API. Export flows will likely need a dedicated backend route/tool that is explicitly constrained to writing under `<workspace>/plugins/...` (IDE mode only).

### Project templates

Project templates are the "big hammer" version of blueprints: instead of pasting a section subtree, Setta can instantiate an entire ProjectConfig (or multiple configs) into the current workspace.

Use cases:

- "Starter projects" (a full Setta project as a reusable template).
- Opinionated AI setups (engine configs, prompts, agent profiles) plus sections wired together.
- Team templates (consistent layout, codegen settings, and common sections).

Template file format proposal:

`project_template.json` suggested fields:

- `schemaVersion`
- `name`
- `description`
- `project`: a Setta project snapshot (recommended: the same shape as `project.json`, optionally trimmed to selected ProjectConfigs)
- `defaultProjectConfigName` or `defaultProjectConfigId` (optional)
- `recommendedImportName` (optional)

Import behavior:

- "Create ProjectConfig from template" duplicates ids to avoid collisions (same semantics as copy/paste where `asRef=false`).
- If the template includes multiple configs, the user chooses which configs to import (or imports all).

Asset packaging:

- For templates intended to move across workspaces, the exporter should copy referenced `artifacts/`, `json_sources/`, and `code/` files into the plugin (similar to share deployments) and rewrite paths inside the snapshot to be plugin-relative.
- For templates intended for the same workspace only, an MVP can skip copying assets and keep paths as-is (but the template is less portable).

### Exporting a project as a plugin from inside Setta

Add UI actions:

- "Export ProjectConfig As Plugin..."
- "Export Entire Project As Plugin..." (optional; can come later)

Flow (ProjectConfig export):

1. User selects a ProjectConfig to export.
2. Backend builds a portable snapshot for that config.
3. Setta writes a new plugin folder under `plugins/<pluginId>/`.
4. Setta writes `setta.plugin.json` and `content/project_templates/<name>.json`.
5. Optionally copies referenced assets into the plugin (portable mode).

The resulting plugin can be copied into another workspace and imported as a new ProjectConfig.

## Enable/Disable and Configuration

There are two separate concerns:

- Plugin installation (files exist in plugin directories).
- Plugin enablement (a workspace decides whether to load it).

Recommended initial model:

- Add a workspace-level file `<setta_files_root>/plugins_state.json` containing enable/disable state and per-plugin config (note `setta_files_root` can be local or global; see `docs/reference/setta-files.md`).
- Add a global defaults file `<setta_home>/plugins_global_state.json` to store enable defaults for globally installed plugins.
- Plugin install defaults to enabled (`enable=true`) unless explicitly disabled by `--no-enable` (CLI) or `enable=false` (API).
- Add an optional project-config override in `ProjectConfig` later if plugin enablement needs to vary by config.

State fields:

- `enabledPluginIds`: list of plugin ids explicitly enabled for this workspace.
- `disabledPluginIds`: list of plugin ids explicitly disabled for this workspace.
- `pluginConfigById`: dict of plugin id to arbitrary JSON config blob.

Global defaults fields (`<setta_home>/plugins_global_state.json`):

- `autoEnabledPluginIds`: list of globally-installed plugin ids enabled by default for workspaces.

Enablement resolution (normative MVP):

1. Resolve one active source per `pluginId` using scope precedence (`workspace > setta_files > global`).
2. Compute enabled state:
   - if `pluginId` in `disabledPluginIds`, plugin is disabled.
   - else if `pluginId` in `enabledPluginIds`, plugin is enabled.
   - else if active source scope is `global` and `pluginId` is in `autoEnabledPluginIds`, plugin is enabled.
   - else use `manifest.enabledByDefault`.
3. Apply compatibility checks (`settaVersionRange`, schema support).
4. Apply mode capability filtering to produce `effectiveCapabilities`.

This keeps behavior deterministic and explains "why disabled" cases in `/api/plugins/status`.

Rationale:

- It allows quick toggling without editing manifests.
- It keeps enablement local to a workspace, which matches Setta's "workspace server" model.

Implementation notes:

- Global install with default settings adds the plugin id to `autoEnabledPluginIds`, so users get "install once, works on next startup" behavior without per-workspace manual steps.
- Workspaces can still explicitly disable a globally auto-enabled plugin via their own `plugins_state.json`.
- Plugin status responses should include `sourceScope` and `sourcePath` so users can tell whether a plugin came from workspace/setta_files/global.

## Installation UX (CLI + Drop-in)

Minimum viable:

- Drop plugin folder into `plugins/` and restart Setta.
- For global install, drop plugin folder into `<setta_home>/plugins/` and restart Setta.
- A plugin debug pane shows load status and errors.

### In-app plugin installer (file browser modal + drag and drop)

Add a "Plugins" modal that reuses `FileBrowserPane`, pinned to the workspace `plugins/` folder.

MVP scope:

- This in-app installer is workspace-scoped. Global installs are CLI-only in the initial implementation.

Behavior:

- The file browser is read-only for non-plugin paths and cannot escape the workspace root.
- Drag-and-drop files onto the modal uploads them into `plugins/` (or the currently selected plugin folder).
- The modal can include view toggles, for example "Backend" and "Frontend", that jump into `plugins/<selectedPluginId>/backend/` and `plugins/<selectedPluginId>/frontend/` without changing the on-disk layout.
- The modal includes per-plugin actions: enable, disable, and uninstall for workspace-scoped plugins.

What to drop:

- Preferred: a single `.zip` plugin bundle containing `setta.plugin.json` at its root.
- Optional (Chrome-only): a folder drop, recursively uploaded while preserving relative paths.

Loading semantics (recommended MVP):

- Frontend plugins and content plugins can become available immediately after upload because the backend can rescan manifests on demand.
- Backend plugins require a backend restart to execute Python entrypoints and register routers/tools. The modal should show "restart required" when it detects a new or changed backend entrypoint.
- Backend plugin disable/enable changes are also restart-gated in MVP (to avoid hot-unload complexity).

Implementation note:

- `FileBrowserPane` currently has no upload surface. We would add a reusable drag-and-drop wrapper (and a fallback file input) that can be reused by Browser sections later if we want artifact uploads there too.
- The backend currently does not expose a safe "upload zip and extract under `<workspace>/plugins/...`" endpoint. The in-app installer needs a dedicated IDE-mode-only route/tool that enforces path traversal protections and write constraints.

### CLI plugin installer (install from path, URL, GitHub, or PyPI)

Add a CLI command (exact naming is flexible) that installs a plugin into either the workspace `plugins/` folder or the global plugin folder.

Examples:

```bash
setta plugins install https://example.com/my-plugin.zip
setta plugins install ./my-plugin.zip
setta plugins install ./path/to/plugin-folder
setta plugins install github:acme/setta-rust-tools
setta plugins install github:acme/setta-rust-tools#v0.2.0
setta plugins install pypi:setta-rust-tools
setta plugins install pypi:setta-rust-tools==0.2.0
setta plugins install --global https://example.com/my-plugin.zip
setta plugins install --global ./path/to/plugin-folder
```

Recommended behavior:

- The installer does not require the user to specify "frontend" vs "backend". It reads `setta.plugin.json` and infers:
  - frontend plugin if `frontend.entrypoint` exists
  - backend plugin if `backend.entrypoint` exists
  - content plugin if `content.*Dir` exists
- It prints a clear summary including `pluginId`, `version`, detected components, and whether a restart is required.
- Default install scope is workspace: `<workspace>/plugins/<pluginId>/`.
- `--global` installs into `<setta_home>/plugins/<pluginId>/` (using `resolve_setta_home()`, honoring `SETTA_HOME`).
- Output should include both install scope and target path.
- `install` enables the plugin by default in the target scope; `--no-enable` skips that.
- For global installs, default behavior also adds plugin id to `autoEnabledPluginIds`; `--no-enable` skips this.
- Source resolution is first-class in MVP:
  - `path:` or bare local path
  - `url:` or bare `https://...zip`
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- For source installs, include canonical source identity in output and status (for example `pypi:setta-rust-tools`, `github:acme/SettaRustTools`), alongside `pluginId`.
- For `github:` installs, derive `pluginId` from `[project].name` in `pyproject.toml` when present; fallback to a source-derived id (`gh.<owner>.<repo>`) when metadata is missing.
- For PyPI installs, derive `pluginId` from package metadata (`[project].name` or wheel metadata) and fallback to normalized package name.
- `setta plugins list` should show install scope (`workspace`, `setta_files`, `global`), active/shadowed state, and whether enablement comes from workspace override or global default.

Required lifecycle commands (normative MVP):

- `setta plugins list`
- `setta plugins install <sourceSpec> [--global|--setta-files] [--no-enable] [--force]`
- `setta plugins uninstall <pluginId> [--scope workspace|setta_files|global]`
- `setta plugins enable <pluginId>`
- `setta plugins disable <pluginId>`
- `setta plugins rescan`
- `setta plugins pack <plugin-folder> [--out <zip-path>]`

`pack` behavior:

- Validates `setta.plugin.json`.
- Produces a deterministic zip bundle `<pluginId>-<version>.setta-plugin.zip`.
- Preserves plugin-relative paths so users can install the zip via path, URL, GitHub release asset, or PyPI package contents.

Safety baseline (still assuming trusted plugins):

- Prevent zip-slip/path traversal by ensuring extracted files stay within the chosen target root (`<workspace>/plugins` or `<setta_home>/plugins`).
- Refuse to overwrite an existing plugin folder in the target scope unless `--force` is provided.

Atomic install semantics (normative MVP):

1. Download/copy source into a temp staging directory.
2. Extract/copy into a second temp "candidate root".
3. Validate `setta.plugin.json`, referenced paths, schema compatibility, and traversal safety.
4. If validation passes, atomically move candidate root to the target plugin folder.
5. If any step fails, abort and delete temp directories; do not modify existing installed plugin state.

Restart semantics:

- Installing/changing a backend plugin should be treated as "restart required" for deterministic behavior.
- Installing/changing a frontend/content plugin can be made available immediately by triggering a "rescan plugins" flow and reloading plugin JS on the frontend.

### Lifecycle semantics (normative MVP)

- `rescan_plugins` does not execute backend plugin entrypoints; it only refreshes discovery state, static asset availability, and content contributions.
- Transition rules:
  - frontend/content-only plugin install or update: active after successful rescan.
  - frontend/content-only plugin uninstall: removed after successful rescan.
  - backend plugin install/update/remove/enable/disable/uninstall: status becomes `pending_restart` until backend restart.
- On restart, backend plugin registry is rebuilt from scratch from the active discovered set. No incremental backend plugin unmounting is attempted in MVP.

### AI-driven plugin install ("install this plugin at this URL")

Because Setta already exposes privileged actions via MCP tools, the simplest path is:

- Implement the plugin installer in backend code once.
- Expose it as both:
  - a CLI command (`setta plugins install ...`), and
  - an MCP tool (for example `install_plugin`) so chat agents can invoke it.

Suggested MCP tool shape:

- `install_plugin({ sourceSpec: string, scope?: "workspace" | "setta_files" | "global", enable?: boolean, force?: boolean }) -> { pluginId, version, components, restartRequired, sourceScope, sourcePath }`
- `uninstall_plugin({ pluginId: string, scope?: "workspace" | "setta_files" | "global" }) -> { pluginId, removedFromScope, restartRequired }`
- `rescan_plugins() -> { installedPlugins, enabledPlugins }`

This lets a user say "install this plugin at this url please" in Project Chat, and the agent can call `install_plugin` and then `rescan_plugins` (and the UI can show "restart required" if needed).

CLI command set (MVP):

- `setta plugins list`
- `setta plugins enable <id>`
- `setta plugins disable <id>`
- `setta plugins install <sourceSpec>`
- `setta plugins uninstall <id>`
- `setta plugins pack <plugin-folder>`

## Versioning and Compatibility

Host needs to prevent hard-to-debug breakage:

- Enforce `settaVersionRange` in manifest.
- Keep a small "plugin API version" number for backend and frontend separately, exposed as `host.apiVersion`.
- Validate manifest and plugin-state schemas strictly.

Schema compatibility policy:

- Host supports one current schema version per document type (manifest/state/plugin-section payload).
- If incoming schema is older than current, run deterministic sequential migrations (for example `v1 -> v2 -> v3 -> v4`) before activation.
- If incoming schema is newer than host supports, reject with a clear error (`PLUGIN_MANIFEST_UNSUPPORTED_SCHEMA`).
- Migration of data shape is separate from API compatibility checks (`settaVersionRange`, `host.apiVersion`); migration cannot fix removed host APIs.

Data migrations:

- `PluginSectionImpl.data` should include `schemaVersion` to allow plugin-level data migrations over time.
- Add explicit migration registries/hooks once plugins persist richer state beyond section payloads.
- Optional follow-on: CLI command to rewrite files to current schemas (`setta plugins migrate --write`) for easier maintenance.

Migration execution rules (normative MVP):

- Migrations run during plugin discovery before activation.
- Migration failures are non-fatal to host startup: plugin is marked `invalid` with explicit migration error details.
- Automatic migrations are in-memory only in MVP. Persistent rewrites happen only via explicit write paths (for example a future `setta plugins migrate --write`).

## Error Handling and Observability

Plugin failures must be visible and actionable:

- Backend records plugin load events and errors, exposes them via `/api/plugins/status`.
- Frontend shows a "Plugins" pane with installed plugins, enabled plugins, load failures, and registered contributions (sections, panes, tools).
- Status should include mode-gating details per plugin:
  - `requestedCapabilities`
  - `effectiveCapabilities`
  - `blockedCapabilities` with reason
- Status should include source metadata (`pluginId`, canonical source key, source scope/path, shadowing details).

Guardrails:

- A missing plugin renderer must not break the whole UI.
- A plugin backend load failure must not prevent the core server from starting unless it is explicitly marked "required".
- Calling a blocked host API in Share/App should fail deterministically (`PLUGIN_CAPABILITY_DENIED`) instead of silently no-oping.

## Testing Strategy

Backend:

- Unit tests for manifest parsing and directory scanning using temp directories.
- Tests for loading a minimal backend plugin that registers one router and one MCP tool.
- Tests for deterministic load order and proper error reporting.
- Tests for mode capability gating (IDE vs Share/App) and blocked API errors.
- Tests for schema migration paths (for example v1 manifests/state accepted and migrated to current).
- Tests for uploading a plugin bundle and extracting it into `plugins/` (once the in-app installer exists).
- Tests for source-spec parsing and install behavior for `path:`, `url:`, `github:`, and `pypi:`.
- Tests for enablement resolution order (`disabledPluginIds`, `enabledPluginIds`, `enabledByDefault`).
- Tests for global auto-enable defaults (`plugins_global_state.json`) and workspace override precedence.
- Tests for `pending_restart` transitions after backend plugin install/enable/disable/update/uninstall.
- Tests for atomic installer rollback behavior (failed install leaves existing plugin unchanged).
- Tests for uninstall semantics (single-scope uninstall, multi-scope scope-required error).

Frontend:

- Playwright E2E with a fixture plugin under a test workspace that registers one section kind and one pane.
- Verify plugin list loads, plugin section renders, and disabling plugin yields fallback UI.
- Verify Share mode behavior for partially active plugins (allowed contributions render; blocked contributions show clear status).
- Add large-canvas performance coverage for plugin sections (for example 100+ sections, update fanout checks).
- Add coverage for the drag-and-drop install flow once the modal exists.
- Add coverage for fallback card reasons (`plugin_disabled`, `plugin_not_installed`, `frontend_load_failed`, `mode_blocked`).

## Implementation Phases

### Phase 1: Backend skeleton (discovery + static serving + registry endpoints)

- Create `backend/setta/plugins/` package with manifest types, plugin directory scanning, enablement state, and status reporting.
- Resolve `<setta_home>/plugins` using the same Setta-home logic as user config (`resolve_setta_home()`, `SETTA_HOME`) and include it in discovery.
- Add backend routes `GET /api/plugins/list`, `GET /api/plugins/status`, and management routes (`install`, `uninstall`, `enable`, `disable`, `rescan`) matching normative schemas in this document.
- Serve plugin static assets under `/plugins/<pluginId>/...` from the resolved active plugin source path (workspace/setta_files/global).
- Built-mode note: ensure `/plugins/...` mounts are registered before the SPA catch-all route (or move the catch-all route to the end after mounting), otherwise requests for plugin JS/CSS can be swallowed by the app's `index.html` handler.
- Implement enablement resolution (`disabledPluginIds`, `enabledPluginIds`, `autoEnabledPluginIds`, `enabledByDefault`) and `pending_restart` status semantics.

### Phase 2: Frontend loader + minimal extension points

- Add frontend plugin loader module and a global registry in `frontend/src/`.
- Load enabled plugins on app start (or on demand).
- Add minimal extension points: panes and commands.
- Add a "Plugins" modal with an embedded `FileBrowserPane` pinned to `plugins/`, plus drag-and-drop upload and "restart required" messaging.
- Add a stable fixture plugin starter in `tests/fixtures/plugins/` and a short authoring README so plugin authors have a live, tested reference.

### Phase 3: Plugin sections (core model + rendering)

- Add `SectionType.Plugin` and `PluginSectionImpl` to backend and frontend generated types.
- Add a `PluginArea` renderer to `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`.
- Add "Add" menu items for plugin section kinds.
- Add fallback UI when renderer is missing.
- Add a simple example plugin in `tests/fixtures/plugins/` to validate the pipeline.

### Phase 4: Content plugins + export-from-Setta (group and project)

- Add blueprint import UI and a "Blueprints" section in the Add menu.
- Add "Export Group As Plugin..." flow that writes to `plugins/`.
- Add "Export ProjectConfig As Plugin..." flow that writes to `plugins/` as a project template plugin.
- Optional: copy referenced artifacts into plugin content assets.

### Phase 5: Deeper integrations (language servers, external agents, codegen)

- Language servers: allow plugins to register new LSP server definitions and settings UI; later open up `CodeLanguage` to allow plugin-defined languages (likely via a "Custom language key" field rather than enum).
- AI: allow plugins to register external agent adapters and engine config templates; allow plugins to contribute MCP tools and prompt templates.
- Codegen: allow plugin-defined codegen targets in a registry, without hardcoding new discriminated union variants per plugin.

## Phase completion gates

- Phase 1 complete when `/api/plugins/list`, `/api/plugins/status`, and management routes (`install`, `uninstall`, `enable`, `disable`, `rescan`) are implemented with deterministic ordering, shadowing visibility, canonical source identity, schema validation error coverage, and explicit enablement/lifecycle status (`active`, `disabled`, `invalid`, `shadowed`, `pending_restart`).
- Phase 2 complete when a fixture frontend plugin registers a pane and command, loaded lazily, and Share-mode capability filtering is visible in UI/status.
- Phase 3 complete when `SectionType.Plugin` roundtrips through backend/frontend types, renders via registered plugin renderer, and missing renderer falls back without app instability.
- Phase 4 complete when "Export Group As Plugin..." and "Export ProjectConfig As Plugin..." create valid plugin folders/manifests and import roundtrip tests pass.
- Phase 5 complete when at least one deeper integration (for example language-server registration) works end-to-end with mode-aware capability gating and failure reporting.

## MVP Decisions (Resolved)

- Plugin enablement is resolved per workspace in MVP (no per-`ProjectConfig` enablement yet).
- Global plugins use `<setta_home>/plugins_global_state.json` for auto-enable defaults; workspace-level disable still overrides.
- Plugin packaging supports both folder installs and `.zip` bundles in MVP.
- `setta plugins install` supports `path`, `url`, `github`, and `pypi` source specs in MVP.
- Plugin install defaults to enabled unless `--no-enable` is explicitly provided.
- Frontend plugin loading uses native ESM `import()` only in MVP.
- Plugin-defined languages do not extend the core `CodeLanguage` enum in MVP. Language plugins register LSP/settings integrations only. Enum extension is deferred to Phase 5 follow-on design.
