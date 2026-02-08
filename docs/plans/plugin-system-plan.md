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
  com.example.rust-tools/
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
  "id": "com.example.rust-tools",
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
- `id`: stable plugin id (string). Recommended: reverse domain.
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

### BackendPluginContext (host API)

The context object should be the only stable surface plugins need. It should expose:

- `plugin_id` and `plugin_root`.
- `server_mode` (one of `ide | share | app`) and/or `deployment_mode` flag.
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

- Plugin discovery and execution is IDE-mode-only in the MVP.
- In Share/App (deployment modes), plugins are disabled by default (no scanning workspace plugins, no executing backend plugin code).
- Follow-on: allow content-only plugins that are packaged into the deployment root as read-only assets, with explicit capability gating.

Rationale:

- Share/App are intentionally constrained runtimes (limited filesystem writes, different session model, no auth); executing arbitrary plugin backend code increases risk and makes deployments less predictable.

## Frontend Plugins

### Load model

Frontend plugins are loaded by the UI based on a backend-provided registry:

- Backend exposes `/api/plugins/list` returning enabled plugins and their frontend entrypoints (and optional CSS).
- Frontend lazy-loads plugin JS via dynamic import or module script injection.
- Dev vs built note: in dev mode the frontend origin (Vite) differs from the backend origin, so plugin entrypoints should be expressed in a way the frontend can resolve against the backend origin (for example absolute URLs, or backend-relative paths that the loader prefixes with the backend origin).

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

- The plugin frontend entrypoint should be a standards-compliant ES module (ESM) so the host can load it via `import()` or `<script type="module">` without bundler-specific loaders.

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
- Encourage plugins to scope styles under a root attribute, for example `[data-setta-plugin-root="com.example.rust-tools"]`.
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
- Add an optional project-config override in `ProjectConfig` later if plugin enablement needs to vary by config.
- Keep enablement workspace-local even for globally installed plugins (global install controls availability, not automatic enablement everywhere).

State fields:

- `enabledPluginIds`: list of plugin ids enabled for this workspace.
- `pluginConfigById`: dict of plugin id to arbitrary JSON config blob.

Rationale:

- It allows quick toggling without editing manifests.
- It keeps enablement local to a workspace, which matches Setta's "workspace server" model.

Implementation notes:

- A globally installed plugin is only active in a workspace if that workspace enables the plugin id in its own `plugins_state.json` (or if first-discovery defaults choose enabled behavior).
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

What to drop:

- Preferred: a single `.zip` plugin bundle containing `setta.plugin.json` at its root.
- Optional (Chrome-only): a folder drop, recursively uploaded while preserving relative paths.

Loading semantics (recommended MVP):

- Frontend plugins and content plugins can become available immediately after upload because the backend can rescan manifests on demand.
- Backend plugins require a backend restart to execute Python entrypoints and register routers/tools. The modal should show "restart required" when it detects a new or changed backend entrypoint.

Implementation note:

- `FileBrowserPane` currently has no upload surface. We would add a reusable drag-and-drop wrapper (and a fallback file input) that can be reused by Browser sections later if we want artifact uploads there too.
- The backend currently does not expose a safe "upload zip and extract under `<workspace>/plugins/...`" endpoint. The in-app installer needs a dedicated IDE-mode-only route/tool that enforces path traversal protections and write constraints.

### CLI plugin installer (install from URL or path)

Add a CLI command (exact naming is flexible) that installs a plugin into either the workspace `plugins/` folder or the global plugin folder.

Examples:

```bash
setta plugins install https://example.com/my-plugin.zip
setta plugins install ./my-plugin.zip
setta plugins install ./path/to/plugin-folder
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
- For URL installs, start with `.zip` bundles. Later, add Git URLs and/or a simple registry format.
- `setta plugins list` should show scope and whether the plugin is active or shadowed by a higher-precedence scope.

Safety baseline (still assuming trusted plugins):

- Prevent zip-slip/path traversal by ensuring extracted files stay within the chosen target root (`<workspace>/plugins` or `<setta_home>/plugins`).
- Refuse to overwrite an existing plugin folder in the target scope unless `--force` is provided.

Restart semantics:

- Installing/changing a backend plugin should be treated as "restart required" for deterministic behavior.
- Installing/changing a frontend/content plugin can be made available immediately by triggering a "rescan plugins" flow and reloading plugin JS on the frontend.

### AI-driven plugin install ("install this plugin at this URL")

Because Setta already exposes privileged actions via MCP tools, the simplest path is:

- Implement the plugin installer in backend code once.
- Expose it as both:
  - a CLI command (`setta plugins install ...`), and
  - an MCP tool (for example `install_plugin`) so chat agents can invoke it.

Suggested MCP tool shape:

- `install_plugin({ sourceUrl?: string, sourcePath?: string, scope?: "workspace" | "global", enable?: boolean, force?: boolean }) -> { pluginId, version, components, restartRequired, sourceScope, sourcePath }`
- `rescan_plugins() -> { installedPlugins, enabledPlugins }`

This lets a user say "install this plugin at this url please" in Project Chat, and the agent can call `install_plugin` and then `rescan_plugins` (and the UI can show "restart required" if needed).

Follow-on CLI commands:

- `setta plugins list`
- `setta plugins enable <id>`
- `setta plugins disable <id>`
- `setta plugins install <path-or-url>`

`install` can initially just copy a folder into `plugins/`.

## Versioning and Compatibility

Host needs to prevent hard-to-debug breakage:

- Enforce `settaVersionRange` in manifest.
- Require `schemaVersion` and reject unknown versions.
- Keep a small "plugin API version" number for backend and frontend separately, exposed as `host.apiVersion`.

Data migrations:

- For `PluginSectionImpl.data`, include `schemaVersion` to allow plugin-level migrations.
- Provide backend hook `register_migrations(...)` as a later addition once plugins store persistent data beyond sections.

## Error Handling and Observability

Plugin failures must be visible and actionable:

- Backend records plugin load events and errors, exposes them via `/api/plugins/status`.
- Frontend shows a "Plugins" pane with installed plugins, enabled plugins, load failures, and registered contributions (sections, panes, tools).

Guardrails:

- A missing plugin renderer must not break the whole UI.
- A plugin backend load failure must not prevent the core server from starting unless it is explicitly marked "required".

## Testing Strategy

Backend:

- Unit tests for manifest parsing and directory scanning using temp directories.
- Tests for loading a minimal backend plugin that registers one router and one MCP tool.
- Tests for deterministic load order and proper error reporting.
- Tests for uploading a plugin bundle and extracting it into `plugins/` (once the in-app installer exists).

Frontend:

- Playwright E2E with a fixture plugin under a test workspace that registers one section kind and one pane.
- Verify plugin list loads, plugin section renders, and disabling plugin yields fallback UI.
- Add coverage for the drag-and-drop install flow once the modal exists.

## Implementation Phases

### Phase 1: Backend skeleton (discovery + static serving + registry endpoints)

- Create `backend/setta/plugins/` package with manifest types, plugin directory scanning, enablement state, and status reporting.
- Resolve `<setta_home>/plugins` using the same Setta-home logic as user config (`resolve_setta_home()`, `SETTA_HOME`) and include it in discovery.
- Add backend routes `GET /api/plugins/list` and `GET /api/plugins/status`.
- Serve plugin static assets under `/plugins/<pluginId>/...` from the resolved active plugin source path (workspace/setta_files/global).
- Built-mode note: ensure `/plugins/...` mounts are registered before the SPA catch-all route (or move the catch-all route to the end after mounting), otherwise requests for plugin JS/CSS can be swallowed by the app's `index.html` handler.

### Phase 2: Frontend loader + minimal extension points

- Add frontend plugin loader module and a global registry in `frontend/src/`.
- Load enabled plugins on app start (or on demand).
- Add minimal extension points: panes, commands, and "Add" menu items for plugin section kinds.
- Add a "Plugins" modal with an embedded `FileBrowserPane` pinned to `plugins/`, plus drag-and-drop upload and "restart required" messaging.

### Phase 3: Plugin sections (core model + rendering)

- Add `SectionType.Plugin` and `PluginSectionImpl` to backend and frontend generated types.
- Add a `PluginArea` renderer to `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`.
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

## Open Questions

- Should plugin enablement be per workspace only, or per `ProjectConfig` as well?
- Should we support optional global enable defaults (for example `<setta_home>/plugins_state.json`) so newly opened workspaces auto-enable selected global plugins?
- Do we want to allow any plugin behavior in deployment modes (share/app) at all, or only packaged read-only content assets?
- For plugin section rendering, should the MVP be imperative mount/unmount (recommended) or a constrained React-based API?
- How do we want plugin-defined "language" to interact with existing `CodeLanguage` enum and file extension logic (`CODE_LANGUAGE_EXTENSIONS`)?
- Do we want to support plugin packaging as a single zip file in addition to folders?
