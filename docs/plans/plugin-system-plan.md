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

## DX/UX Bar (MVP)

This plan is considered successful only if it satisfies all of the following:

- DX: A developer can ask a modern LLM to generate a plugin from official Setta templates/contracts, with minimal manual fixes.
- DX: A developer can add custom backend logic, frontend UI/styling, and content assets without editing Setta core.
- DX: A developer can publish a plugin to PyPI/GitHub, and users can install it via one command.
- DX: Teams using package managers (`uv`, `pip`, Poetry, etc.) can have Setta discover/manage plugins without forcing a specific installer.
- DX: Plugin packaging, install, update, and rollback flows are deterministic and documented.
- UX: Users can install/uninstall plugins with clear scope choices (`workspace`, `environment`, `global`).
- UX: Users can easily see installed plugins, active plugin source/scope, and shadowing status.
- UX: A plugin installed in the chosen scope should work after Setta restart with no additional manual wiring.
- UX: If restart is required (backend plugin change), the UI should present a one-click restart flow (or exact fallback command).

## Non-goals (Initial)

- Marketplace, search, auto-updates, ratings, or centralized trust verification service.
- Cryptographic signature verification in MVP.
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

User-facing terminology:

- UI/CLI should label `setta_files` as `environment` so users see: `workspace | environment | global`.
- Backend API payloads may continue to use `setta_files` as the canonical enum value in MVP, but CLI should accept both `--scope setta_files` and `--scope environment`.

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
- "Drop-in" install stays simple: copy one folder into `plugins/`.

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
  "configSchemaPath": "content/config/schema.json",
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
- `configSchemaPath`: optional JSON Schema path for plugin config validation and settings UI generation.
- `capabilities`: future-facing allowlist for permissions and UI messaging.

### Capability vocabulary (normative MVP)

To keep mode-gating and plugin host behavior deterministic, `capabilities` is a closed string set in MVP:

- `registerSectionKinds`
- `registerPane`
- `registerCommand`
- `registerTopNavBarItem`
- `registerContextMenu`
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
- Ship an official JSON Schema for `setta.plugin.json` and use the same schema in CLI/backend validation paths.
- Add `setta plugins validate <plugin-folder>` so plugin authors (and LLM-generated outputs) can be checked before publish/install.

### Plugin identity and uniqueness

Use a Python-ecosystem-friendly ID policy while keeping source identity explicit:

- `id` in the manifest is the plugin's package-style identifier (for example `setta-rust-tools`).
- Global uniqueness is not guaranteed without a central registry, so the host should track a canonical source key in plugin status/state:
  - `pypi:setta-rust-tools`
  - `github:acme/SettaRustTools`
- For GitHub installs, derive the plugin id from `pyproject.toml` `[project].name` when available; fallback to a source-derived id like `gh.acme.setta-rust-tools` when metadata is missing.
- Status/installer output should include both `id` (human-facing plugin identity) and canonical source key (provenance identity).

## Plugin Authoring SDK and Templates (normative MVP)

To make plugin authoring LLM-friendly and low-friction, ship a first-party starter flow:

- `setta plugins init <plugin-id> [--template backend|frontend|full|content] [--out <dir>]`.
- Generates:
  - `setta.plugin.json` (validated against the official schema).
  - Minimal backend/frontend/content entrypoints for the selected template.
  - A publish-ready `pyproject.toml` with `[project].name` and `[project].version` aligned to `setta.plugin.json` (`id` and `version`).
  - Packaging include rules so `setta.plugin.json`, `frontend/dist/*`, and `content/**` are present in wheel/sdist outputs.
  - A tiny `README.md` with local build/test/publish instructions.
  - A minimal release/publish workflow example (GitHub release asset + PyPI publish path).
  - Optional starter Playwright/Vitest fixture hook for local verification.
- `setta plugins init` should prefer explicit, readable files over magic so generated code is easy for humans and LLMs to modify safely.

Publish-ready starter contract (normative MVP):

- A freshly generated template must be installable with no manual packaging edits:
  - `setta plugins validate <plugin-folder>` succeeds.
  - `python -m build` produces wheel/sdist with plugin files included.
- `setta plugins validate` checks metadata consistency between package metadata and manifest values when both are present.

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

### Backend execution and dependency model (normative MVP)

- Backend plugins run in plugin-scoped worker processes launched by the host (one worker per active backend plugin).
- Installer resolves and installs plugin Python dependencies at install/update time into a plugin-scoped runtime environment keyed by `(pluginId, version, sourceDigestSha256)`.
- Backend activation must not perform dependency installation. If runtime dependencies are missing, activation fails with `PLUGIN_BACKEND_DEPENDENCY_INSTALL_FAILED`.
- Worker boot loads `backend.entrypoint` by file path from the plugin root and calls `register(...)`.
- Worker/host communication uses JSON-RPC 2.0 over stdio in MVP.
- Worker/host RPC must include a startup handshake with:
  - plugin id/version
  - backend plugin API version
  - supported RPC method list
- Required host->worker methods in MVP:
  - `plugin.initialize`
  - `plugin.register`
  - `plugin.shutdown`
- Required worker->host methods in MVP:
  - `host.register_router`
  - `host.register_static_dir`
  - `host.register_mcp_tool`
  - `host.register_language_server`
  - `host.register_external_agent_adapter`
  - `host.register_codegen_target`
- RPC calls must be timeout-bounded with deterministic failure codes:
  - startup timeout -> `PLUGIN_BACKEND_STARTUP_TIMEOUT`
  - register timeout -> `PLUGIN_BACKEND_REGISTER_TIMEOUT`
  - transport loss -> `PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR`
- RPC contract changes require explicit backend plugin API version bumps.
- Import/load failures (for example missing module, syntax error, missing symbol) mark the plugin `invalid` with error code `PLUGIN_BACKEND_IMPORT_FAILED`; host startup continues.
- Dependency version conflicts between plugin runtime and host runtime should be isolated by default via worker execution. If isolation cannot be established, mark plugin `invalid` with `PLUGIN_BACKEND_DEPENDENCY_CONFLICT`.
- Plugins must not run runtime dependency installers (`pip install`, `uv pip`, etc.) during `register(...)`.

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
- In the current backend, `SettaFastMCP` registers tools during construction. So backend plugin workers that provide MCP tools must finish registration before the MCP server is created.

### Suggested backend extension points (first-class registries)

Make these registries explicit, owned by the host:

- MCP tools registry (plugin id, tool name, callable, schema annotations).
- External agent adapter registry (new run modes, config UI hooks).
- Language server registry (language key to server implementation and settings).
- Codegen registry (codegen target providers, config models, generation hooks).

This makes plugin impact discoverable, testable, and debuggable.

### Routers and endpoints

Backend plugins should be able to add HTTP endpoints, but to reduce collisions:

- Expose plugin HTTP namespaces under `/api/plugins/<pluginId>/...`.
- Provide a small helper in the context for building a pre-configured router with Setta auth and logging dependencies attached.
- In isolated worker mode, plugin routers are mounted in the worker app and proxied by the host under `/api/plugins/<pluginId>/...`.
- Note: plugin endpoints will not be part of Setta's core `Route` enum, so plugin routers should use a plain `fastapi.APIRouter` with string paths.

Generated frontend endpoints:

- Initial implementation can avoid integrating plugin endpoints into `pnpm generate` by requiring plugin frontends to use a generic fetch helper for `/api/plugins/...`.
- Later, extend `pnpm generate` to optionally generate plugin endpoints into a plugin-local `generatedEndpoints.ts` that ships with the plugin frontend.

### Deployment modes (share/app) behavior

Default policy:

- Plugin discovery runs in all modes (`ide`, `share`, `app`) so status/debug surfaces are consistent.
- Plugin activation runs in all modes, but effective capabilities are filtered by mode policy.
- Plugin management writes (install/uninstall/update/rollback) are IDE-only by default in MVP; Share/App are read-only unless explicitly enabled by product policy.
- Capability filtering should be deterministic and visible in both backend status and frontend plugin UI.

Recommended mode policy (initial):

- `ide`: allow all declared capabilities that pass normal compatibility checks.
- `share`: allow UI/content-focused capabilities (`registerSectionKinds`, `registerPane`, `registerCommand`, `registerTopNavBarItem`, `registerContextMenu`, content template/blueprint access).
- `share`: block infrastructure/power capabilities (`registerMcpTools`, `registerLanguageServer`, `registerExternalAgentAdapter`, `registerCodegenTarget`, `registerRouter`, `registerStaticDir`, `writeWorkspacePlugins`).
- `app`: same as `share` for MVP, with room to tighten later if needed.

Mode matrix (normative MVP):

| Capability | ide | share | app |
| --- | --- | --- | --- |
| `registerSectionKinds` | allow | allow | allow |
| `registerPane` | allow | allow | allow |
| `registerCommand` | allow | allow | allow |
| `registerTopNavBarItem` | allow | allow | allow |
| `registerContextMenu` | allow | allow | allow |
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
- `restartCapability`: `{ mode: "programmatic" | "manual", command?: string, reason?: string }`.
- `plugins`: list of active plugin descriptors sorted by `pluginId` ascending.

Plugin descriptor fields:

- `pluginId`, `name`, `version`.
- `sourceScope`: `workspace | setta_files | global`.
- `sourceScopeLabel`: `workspace | environment | global` (user-facing alias of `sourceScope`).
- `canonicalSourceKey`.
- `sourceDigestSha256`: optional string for installed source provenance display.
- `frontend`: `{ entrypointUrl?: string, styleUrl?: string }` where URLs are same-origin backend URLs and include digest cache-busting (`?v=<sourceDigestSha256>`) when digest is available.
- `content`: `{ hasBlueprints: boolean, hasProjectTemplates: boolean, hasPrompts: boolean }`.
- `config`: `{ hasSchema: boolean, schemaJson?: object }`.
- `effectiveCapabilities`: `string[]`.
- `restartRequired`: boolean.

`GET /api/plugins/status` (debug/observability, all discovered plugins including inactive/broken/shadowed):

- `schemaVersion`: integer (`1` for MVP).
- `serverMode`: `ide | share | app`.
- `restartCapability`: `{ mode: "programmatic" | "manual", command?: string, reason?: string }`.
- `plugins`: list sorted by:
  - `pluginId` ascending.
  - scope precedence (`workspace`, `setta_files`, `global`).
  - `sourcePath` ascending.

Status entry fields:

- `pluginId`, `name`, `version`.
- `state`: `active | disabled | invalid | shadowed | pending_restart`.
- `sourceScope`, `sourceScopeLabel`, `sourcePath`, `canonicalSourceKey`, `sourceDigestSha256`.
- `shadowedBySourcePath`: optional string.
- `requestedCapabilities`, `effectiveCapabilities`.
- `blockedCapabilities`: `[{ capability: string, reason: "mode_policy" | "host_policy" | "manifest_invalid" }]`.
- `restartRequired`: boolean.
- `errors`: list of `{ code: string, message: string }`.

### Plugin management APIs (normative MVP)

Lock core install/update/restart contracts in MVP so frontend, CLI, and MCP integrations all call the same backend operations.

`POST /api/plugins/install`:

- request: `{ sourceSpec: string, scope?: "workspace" | "setta_files" | "environment" | "global", enable?: boolean, force?: boolean }`
- source spec formats:
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- unsupported schemes fail with `PLUGIN_SOURCE_SCHEME_UNSUPPORTED`.
- response: `{ pluginId, version, sourceScope, sourceScopeLabel, sourcePath, canonicalSourceKey, sourceDigestSha256, components, state, restartRequired }`

`POST /api/plugins/uninstall`:

- request: `{ pluginId: string, scope?: "workspace" | "setta_files" | "environment" | "global" }`
- if `scope` is omitted and the plugin exists in multiple scopes, return `PLUGIN_UNINSTALL_SCOPE_REQUIRED`.
- response: `{ pluginId, removedFromScope, restartRequired }`

`POST /api/plugins/link` (dev-only):

- request: `{ localPluginRoot: string, scope?: "workspace" | "setta_files" | "environment" | "global", enable?: boolean, force?: boolean }`
- behavior: validate plugin root manifest, then create filesystem link at `<scope-root>/plugins/<pluginId>`.
- response: `{ pluginId, version, sourceScope, sourceScopeLabel, sourcePath, canonicalSourceKey, components, state, restartRequired }`
- availability: IDE mode only; not exposed in end-user UI.

`POST /api/plugins/unlink` (dev-only):

- request: `{ pluginId: string, scope?: "workspace" | "setta_files" | "environment" | "global" }`
- if `scope` is omitted and the plugin exists in multiple scopes, return `PLUGIN_UNINSTALL_SCOPE_REQUIRED`.
- response: `{ pluginId, removedFromScope, restartRequired }`
- availability: IDE mode only; not exposed in end-user UI.

`POST /api/plugins/enable`:

- request: `{ pluginId: string }`
- response: `{ pluginId, state, restartRequired }`

`POST /api/plugins/disable`:

- request: `{ pluginId: string }`
- response: `{ pluginId, state, restartRequired }`

`POST /api/plugins/config`:

- request: `{ pluginId: string, config: object }`
- response: `{ pluginId, config, validation: { ok: boolean, errors?: string[] } }`
- validation: if plugin manifest includes `configSchemaPath`, reject invalid config with `PLUGIN_CONFIG_INVALID`.

`POST /api/plugins/update`:

- request: `{ pluginId: string, scope?: "workspace" | "setta_files" | "environment" | "global", to?: string }`
- response: `{ pluginId, fromVersion, toVersion, sourceDigestSha256, restartRequired }`

`POST /api/plugins/rollback`:

- request: `{ pluginId: string, scope?: "workspace" | "setta_files" | "environment" | "global" }`
- response: `{ pluginId, restoredVersion, sourceDigestSha256, restartRequired }`
- if no rollback history exists, return `PLUGIN_ROLLBACK_UNAVAILABLE`.

`POST /api/plugins/rescan`:

- request: `{}`
- response: `{ schemaVersion, serverMode, installedPlugins, activePlugins }`

`GET /api/plugins/restart-capability`:

- response: `{ mode: "programmatic" | "manual", command?: string, reason?: string }`

`POST /api/plugins/restart`:

- request: `{}`
- response: `{ accepted: boolean, mode: "programmatic" | "manual", command?: string, reason?: string }`
- if restart cannot be performed programmatically in the current runtime, return `accepted=false` with `mode="manual"` and an exact fallback command.

Lockfile routes (implemented):

- `POST /api/plugins/lock/write`
- `POST /api/plugins/lock/apply`

## Frontend Plugins

### Load model

Frontend plugins are loaded by the UI based on a backend-provided registry:

- Backend exposes `/api/plugins/list` returning enabled plugins and their frontend entrypoints (and optional CSS).
- Frontend lazy-loads plugin JS with native ESM `import()` only (no script-injection path in MVP).
- `/api/plugins/list` returns same-origin backend URLs for `frontend.entrypointUrl` and `frontend.styleUrl`, so loader behavior is identical in dev and built modes.
- Plugin asset URLs are protected by normal Setta auth/session middleware and must satisfy Setta CSP rules for dynamic `import()`.
- Frontend cache behavior is digest-driven: loader treats URL query `v=<sourceDigestSha256>` as the cache key and reload trigger.

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
- `registerTopNavBarItem(def)`.
- `registerContextMenu(def)`.
- `getProjectContext()` and `subscribeProjectContext(...)`.
- `readSection(sectionId)` and `updateSection(sectionId, patch)`.
- `openArtifact(artifactId)` and `createArtifact(...)`.
- `apiFetch(path, init)` scoped to `/api/plugins/<pluginId>/...`.
- `serverMode` and `effectiveCapabilities` for mode-aware plugin behavior.

SDK and contract requirements (normative MVP):

- Ship a versioned frontend SDK package for plugin authors that exports `SettaPluginHost`, all `register*` payload types, and plugin error code enums.
- Every `register*` call must have:
  - compile-time type safety via SDK TypeScript types
  - runtime schema validation in host code before registration
- Invalid registration payloads fail deterministically with `PLUGIN_FRONTEND_REGISTRATION_INVALID`.
- Host API compatibility is explicit: plugin frontend API version mismatch fails plugin activation with `PLUGIN_FRONTEND_API_VERSION_MISMATCH`.

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

- Canvas node overlays, edge layers, richer context-menu surfaces beyond plugin-owned sections.

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

- Prompt templates, agent profiles, engine configs, and external agent configs already have first-class models and persistence under `<setta_files_root>/` with watcher-driven updates. In MVP, content plugins are treated as read-only template sources. Users explicitly import/copy plugin content into mutable workspace stores; plugin updates never silently mutate previously imported user content.

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
- `pluginConfigById`: dict of plugin id to JSON config object.

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

Plugin config contract (normative MVP):

- If `configSchemaPath` exists in a plugin manifest, Setta validates `pluginConfigById[pluginId]` against that schema at config-write time and plugin activation time.
- Invalid config blocks plugin activation with `PLUGIN_CONFIG_INVALID` (plugin remains discoverable in status).
- Frontend plugin UI should render schema-driven plugin config forms in the Settings Project UX from `/api/plugins/list` without plugin-specific hardcoding.
- Do not add a plugin-frontend `registerSettingsPanel` host API in MVP; plugin settings remain schema/data-driven via `pluginConfigById`.

Implementation notes:

- Global install with default settings adds the plugin id to `autoEnabledPluginIds`, so users get "install once, works on next startup" behavior without per-workspace manual steps.
- Workspaces can still explicitly disable a globally auto-enabled plugin via their own `plugins_state.json`.
- Plugin status responses should include `sourceScope` and `sourcePath` so users can tell whether a plugin came from workspace/setta_files/global.

### Package manager integration (normative MVP)

Setta should lean on Python package managers for package resolution/download while keeping plugin runtime semantics in Setta.

- Setta must not require `uv`.
- Setta should support package-manager-managed plugin installs from active environments (`uv`, `pip`, Poetry, and similar workflows).
- If a plugin package is managed externally, Setta treats it as environment-scoped plugin source and keeps enable/disable/status/restart semantics in Setta.
- In UI/CLI, externally managed plugins should show clear hints for update/uninstall via the user’s package manager.

Installer backend selection for source-based install commands:

- Add installer backend selection: `auto | pip | uv`.
- `auto` prefers `uv` when available, otherwise falls back to `pip`.
- If the user explicitly requests `uv` or `pip` and that backend is unavailable, fail with deterministic installer-backend errors.
- Backend choice affects source fetch/build steps only; plugin activation/runtime behavior stays the same.

## Installation UX (CLI + Drop-in)

Minimum viable:

- Drop plugin folder into `plugins/` and restart Setta.
- For global install, drop plugin folder into `<setta_home>/plugins/` and restart Setta.
- A plugin debug pane shows load status and errors.

### In-app plugin installer (source-based modal)

Add a "Plugins" modal with source install controls and plugin status rows. `FileBrowserPane` can still be embedded for viewing installed plugin files by scope.

MVP scope:

- In-app installer supports `workspace`, `environment` (`setta_files`), and `global` install scopes via an explicit scope selector.
- In Share/App modes, install/uninstall controls are read-only unless explicitly enabled by product policy.

Behavior:

- Install form accepts:
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- The install form normalizes and previews source + scope before submit.
- Package-manager-managed (environment) plugins appear in the same plugin rows, with Setta controls for enable/disable/config and package-manager guidance for install/update/uninstall.
- The modal can include view toggles, for example "Backend" and "Frontend", that jump into `plugins/<selectedPluginId>/backend/` and `plugins/<selectedPluginId>/frontend/` without changing the on-disk layout.
- The modal includes per-plugin actions: enable, disable, uninstall, update, and rollback.
- The modal must show `sourceScopeLabel` (`workspace | environment | global`) and canonical source identity for every plugin.
- No drag-and-drop zip/folder upload in MVP.

Loading semantics (recommended MVP):

- Frontend plugins and content plugins can become available immediately after install because the backend can rescan manifests on demand.
- Backend plugins require a backend restart to execute Python entrypoints and register routers/tools. The modal should show "restart required" when it detects a new or changed backend entrypoint.
- Backend plugin disable/enable changes are also restart-gated in MVP (to avoid hot-unload complexity).
- When restart is required, modal should expose `Restart Setta` action. If programmatic restart is unavailable for the current runtime, the modal must display the exact command/instructions.

Implementation note:

- The in-app installer calls the same backend install/update APIs as CLI (`POST /api/plugins/install`, `POST /api/plugins/update`) so behavior is identical across UI/CLI/MCP.

### CLI plugin installer (install from GitHub or PyPI)

Add a CLI command (exact naming is flexible) that installs a plugin into workspace, environment (`setta_files`), or global scope.

Examples:

```bash
setta plugins install github:acme/setta-rust-tools
setta plugins install github:acme/setta-rust-tools#v0.2.0
setta plugins install pypi:setta-rust-tools
setta plugins install pypi:setta-rust-tools==0.2.0
setta plugins install --global github:acme/setta-rust-tools
setta plugins install --global pypi:setta-rust-tools==0.2.0
setta plugins install --installer auto pypi:setta-rust-tools==0.2.0
setta plugins install --installer uv github:acme/setta-rust-tools#v0.2.0
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
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- Source installer backend is selectable (`--installer auto|pip|uv`) and does not change plugin runtime semantics.
- For source installs, include canonical source identity in output and status (for example `pypi:setta-rust-tools`, `github:acme/SettaRustTools`), alongside `pluginId`.
- For `github:` installs, derive `pluginId` from `[project].name` in `pyproject.toml` when present; fallback to a source-derived id (`gh.<owner>.<repo>`) when metadata is missing.
- For PyPI installs, derive `pluginId` from package metadata (`[project].name` or wheel metadata) and fallback to normalized package name.
- `setta plugins list` should show canonical scope and user-facing scope label (`workspace`, `environment`, `global`), active/shadowed state, and whether enablement comes from workspace override or global default.

### Developer local iteration workflow (dev-only)

To keep local plugin authoring/debug loops fast without exposing filesystem source schemes in end-user install UX, add explicit dev-only link commands:

- `setta plugins link <local-plugin-root> [--scope workspace|setta_files|environment|global] [--no-enable] [--force]`
- `setta plugins unlink <pluginId> [--scope workspace|setta_files|environment|global]`

Behavior:

- `link` validates `setta.plugin.json` at `<local-plugin-root>`, then creates a filesystem link at the target scope path (`<scope-root>/plugins/<pluginId>`) pointing to the local plugin root.
- `link`/`unlink` use the same enablement, status, and restart semantics as install/uninstall:
  - frontend/content changes activate on rescan
  - backend changes become `pending_restart` until backend restart
- `link`/`unlink` are IDE-mode dev workflows and should not be shown in end-user docs/help or in-app installer UI.
- Local path inputs are accepted only by `link`; `install` remains source-scheme-driven (`github:`/`pypi:`).

Source package contract (normative MVP):

- Supported user-facing source schemes:
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- Local filesystem paths are not valid `install` source schemes in MVP. Local development paths are handled by `setta plugins link`.
- Every source must resolve to exactly one plugin root containing `setta.plugin.json`.
- Setta source installs delegate download/build work to the selected installer backend (`auto|pip|uv`), but Setta never requires `uv`.
- GitHub source rule in MVP: resolved repository root must contain `setta.plugin.json`. Missing root manifest fails with `PLUGIN_SOURCE_MANIFEST_NOT_FOUND`.
- For PyPI artifacts, installer scans wheel/sdist payload for a single `setta.plugin.json`; multiple candidates fail with `PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT`.
- Install fails fast with explicit errors for missing manifest (`PLUGIN_SOURCE_MANIFEST_NOT_FOUND`) or ambiguous roots (`PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT`).

Artifact identity invariants (normative MVP):

- `setta.plugin.json` `id` and `version` are the canonical plugin identity.
- When package metadata is present (`pyproject.toml`, wheel metadata), metadata name/version must match manifest id/version.
- For GitHub/PyPI sources, any mismatch between resolved package metadata and manifest identity fails install with deterministic errors (`PLUGIN_SOURCE_IDENTITY_MISMATCH`, `PLUGIN_SOURCE_VERSION_MISMATCH`).

Required lifecycle commands (normative MVP):

- `setta plugins list`
- `setta plugins install <sourceSpec> [--global|--setta-files|--environment] [--no-enable] [--force]`
- `setta plugins uninstall <pluginId> [--scope workspace|setta_files|environment|global]`
- `setta plugins enable <pluginId>`
- `setta plugins disable <pluginId>`
- `setta plugins rescan`
- `setta plugins update <pluginId> [--scope workspace|setta_files|environment|global] [--to <version-or-ref>]`
- `setta plugins pin <pluginId> <sourceSpec-or-version>`
- `setta plugins rollback <pluginId> [--scope workspace|setta_files|environment|global]`
- `setta plugins restart`
- `setta plugins restart-required`
- `setta plugins link <local-plugin-root> [--scope workspace|setta_files|environment|global] [--no-enable] [--force]` (dev-only)
- `setta plugins unlink <pluginId> [--scope workspace|setta_files|environment|global]` (dev-only)

Safety baseline (still assuming trusted plugins):

- Prevent path traversal by ensuring all resolved/copy paths stay within the chosen target root (`<workspace>/plugins` or `<setta_home>/plugins`).
- Refuse to overwrite an existing plugin folder in the target scope unless `--force` is provided.

Atomic install semantics (normative MVP):

1. Resolve source into a temp staging directory (git clone or artifact download).
2. Materialize a temp "candidate root" containing exactly one plugin root.
3. Validate `setta.plugin.json`, referenced paths, schema compatibility, and traversal safety.
4. If validation passes, atomically move candidate root to the target plugin folder.
5. If any step fails, abort and delete temp directories; do not modify existing installed plugin state.

Restart semantics:

- Installing/changing a backend plugin should be treated as "restart required" for deterministic behavior.
- Installing/changing a frontend/content plugin can be made available immediately by triggering a "rescan plugins" flow and reloading plugin JS on the frontend.
- CLI should include `setta plugins restart-required` to list pending restart plugins and show exact restart command for the current runtime.
- Restart availability/behavior must come from `GET /api/plugins/restart-capability`, and `setta plugins restart` should call `POST /api/plugins/restart` with deterministic manual fallback output.

### Lifecycle semantics (normative MVP)

- `rescan_plugins` does not execute backend plugin entrypoints; it only refreshes discovery state, static asset availability, and content contributions.
- Transition rules:
  - frontend/content-only plugin install or update: active after successful rescan.
  - frontend/content-only plugin uninstall: removed after successful rescan.
  - backend plugin install/update/remove/enable/disable/uninstall: status becomes `pending_restart` until backend restart.
- On restart, backend plugin registry is rebuilt from scratch from the active discovered set. No incremental backend plugin unmounting is attempted in MVP.

Rollback semantics (normative MVP):

- `rollback` restores the previous installed version/ref from installer history metadata when available; otherwise returns deterministic error (`PLUGIN_ROLLBACK_UNAVAILABLE`).

Setta plugin lockfile (implemented):

- Setta writes `<workspace>/plugins/plugins.lock.json` as a Setta-specific reproducibility layer.
- Package-manager lockfiles (`uv.lock`, Poetry lock, pinned requirements, etc.) still remain the source of truth for Python dependency reproducibility.
- Setta lockfile focuses on Setta runtime state (scope/source/provenance) and does not replace package-manager dependency resolution.

### AI-driven plugin install ("install this plugin source")

Because Setta already exposes privileged actions via MCP tools, the simplest path is:

- Implement the plugin installer in backend code once.
- Expose it as both:
  - a CLI command (`setta plugins install ...`), and
  - an MCP tool (for example `install_plugin`) so chat agents can invoke it.

Suggested MCP tool shape:

- `install_plugin({ sourceSpec: string, scope?: "workspace" | "setta_files" | "environment" | "global", enable?: boolean, force?: boolean }) -> { pluginId, version, components, restartRequired, sourceScope, sourcePath }`
- `uninstall_plugin({ pluginId: string, scope?: "workspace" | "setta_files" | "environment" | "global" }) -> { pluginId, removedFromScope, restartRequired }`
- `rescan_plugins() -> { installedPlugins, enabledPlugins }`
- `update_plugin({ pluginId: string, scope?: "workspace" | "setta_files" | "environment" | "global", to?: string }) -> { pluginId, version, restartRequired }`
- `rollback_plugin({ pluginId: string, scope?: "workspace" | "setta_files" | "environment" | "global" }) -> { pluginId, version, restartRequired }`

This lets a user say "install this plugin from GitHub/PyPI please" in Project Chat, and the agent can call `install_plugin` and then `rescan_plugins` (and the UI can show "restart required" if needed).

CLI command set (MVP):

- `setta plugins init <plugin-id>`
- `setta plugins validate <plugin-folder>`
- `setta plugins list`
- `setta plugins enable <id>`
- `setta plugins disable <id>`
- `setta plugins install <sourceSpec>`
- `setta plugins uninstall <id>`
- `setta plugins update <id>`
- `setta plugins pin <id> <sourceSpec-or-version>`
- `setta plugins rollback <id>`
- `setta plugins restart`
- `setta plugins restart-required`
- `setta plugins link <local-plugin-root>` (dev-only)
- `setta plugins unlink <id>` (dev-only)

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

Provenance and trust messaging baseline (MVP):

- On install, show a confirmation summary with `pluginId`, canonical source key, requested capabilities, and scope.
- Persist and display `sourceDigestSha256` for installed plugin payloads when available.
- Show a clear warning when installing from unsigned/unverified sources (expected in MVP), without blocking install.
- Trust messaging is informational in MVP; no signature verification gate is enforced.

Guardrails:

- A missing plugin renderer must not break the whole UI.
- A plugin backend load failure must not prevent the core server from starting unless it is explicitly marked "required".
- Calling a blocked host API in Share/App should fail deterministically (`PLUGIN_CAPABILITY_DENIED`) instead of silently no-oping.

## Testing Strategy

Status snapshot (February 14, 2026):

Implemented coverage:

- Backend unit/integration coverage for discovery, manifest validation, scopes and precedence, shadowing, enablement and `pending_restart` lifecycle semantics.
- Backend coverage for install/update/rollback/link/unlink, installer backend selection (`auto|pip|uv`), package-manager-managed discovery, worker handshake and timeout mapping, and restart capability endpoints.
- Backend golden-path fixture coverage for source-driven install flows (`github:` and `pypi:`), plus publish-ready template initialization and validation.
- Frontend unit coverage for runtime registration validation (`PLUGIN_FRONTEND_REGISTRATION_INVALID`, `PLUGIN_FRONTEND_API_VERSION_MISMATCH`), fallback reasons, and restart helpers.
- Playwright coverage for plugin pane/command/section rendering, disabled fallback UI, install flow scope/backend UX, package-manager guidance UX, restart-required UX, and Share-mode capability visibility.
- Playwright coverage for deeper integrations: language-server plugin registration, plugin external agent adapters, and plugin codegen target visibility.
- First-party fixture suite and golden-path authoring documentation are in place.

Coverage still planned is consolidated in `Future Work`.

## Implementation Status (Updated February 14, 2026)

### Phase 0: Authoring baseline (Complete)

- Manifest schema and config schema validation surfaces are published.
- `setta plugins init` and `setta plugins validate` are implemented with publish-ready scaffolds.
- Canonical fixture plugins and fixture documentation exist under `tests/fixtures/plugins/`.
- Golden-path authoring docs are published.

### Phase 1: Backend skeleton (Complete)

- Plugin discovery, status/list APIs, management APIs, restart contract APIs, and static asset serving are implemented.
- Scope precedence and aliasing (`environment` -> `setta_files`) are implemented.
- Provenance metadata (`canonicalSourceKey`, `sourceDigestSha256`, scope/path) and shadowing visibility are implemented.
- Worker RPC contract, handshake validation, timeout/error mapping, and backend dependency runtime orchestration are implemented.
- Package-manager-managed plugin discovery is implemented.

### Phase 2: Frontend loader + minimal extension points (Complete)

- Frontend runtime loader and plugin registry are implemented with lazy ESM loading.
- Pane/command/top-nav extension points and runtime registration validation are implemented.
- Plugins UI includes source-based install controls, scope selector, package-manager guidance, restart-required UX, and provenance/capability summaries.
- Share/App mode capability filtering is surfaced in status/UI.

### Phase 3: Plugin sections (Complete)

- `SectionType.Plugin` and `PluginSectionImpl` are implemented in backend/frontend types.
- `PluginArea` renderer integration and create-menu registration are implemented.
- Missing-renderer fallback UI is implemented and tested.

### Phase 4: Content plugins + export-from-Setta (Not implemented)

- Core runtime MVP shipped without this phase.
- Remaining work is listed in `Future Work`.

### Phase 5: Deeper integrations (Complete for MVP scope)

- Language-server registration works end-to-end with mode-aware capability gating and failure reporting.
- External agent adapter registration works end-to-end with mode-aware capability gating and failure reporting.
- Plugin codegen target registration works end-to-end with mode-aware capability gating and failure reporting.
- Follow-on Phase 5 enhancements are listed in `Future Work`.

## Phase completion gates (status)

- Phase 0: complete.
- Phase 1: complete.
- Phase 2: complete.
- Phase 3: complete.
- Phase 4: open (future milestone).
- Phase 5: complete for MVP scope (follow-on enhancements remain).

## Future Work

**Content plugin import/export UX**

- Add blueprint import UI and a "Blueprints" section in the Add menu.
- Add "Export Group As Plugin..." flow that writes plugin folders/manifests under `plugins/`.
- Add "Export ProjectConfig As Plugin..." flow that writes plugin folders/manifests under `plugins/` as project template plugins.
- Add import roundtrip coverage for blueprint and project template plugin payloads.
- Optional: copy referenced artifacts into plugin content assets during export.

**Frontend plugin host parity**

- Implement `registerContextMenu` host support (currently not implemented).
- Add optional `FileBrowserPane` inspection view in the Plugins UI for plugin frontend/backend/content files.

**Additional coverage and hardening**

- Add large-canvas performance coverage for plugin sections (for example 100+ sections and update fanout assertions).
- Add coverage for digest cache-busting behavior when `sourceDigestSha256` changes plugin frontend asset URLs.
- Add backend tests that explicitly assert artifact identity mismatch errors (`PLUGIN_SOURCE_IDENTITY_MISMATCH`, `PLUGIN_SOURCE_VERSION_MISMATCH`) in source install paths.
- Add explicit schema migration framework coverage (vN->vN+1 migration tests) when migration hooks are introduced beyond unsupported-schema rejection.
- Add explicit dependency-conflict invalidation behavior (`PLUGIN_BACKEND_DEPENDENCY_CONFLICT`) if runtime isolation cannot be established.

**Phase 5 follow-ons**

- Allow plugins to contribute prompt templates and engine config templates.
- Consider optional plugin-defined language enum extension design beyond current LSP/settings-only integration.

## MVP Decisions (Resolved)

- Plugin enablement is resolved per workspace in MVP (no per-`ProjectConfig` enablement yet).
- Global plugins use `<setta_home>/plugins_global_state.json` for auto-enable defaults; workspace-level disable still overrides.
- Plugin packaging/install is source-driven in MVP: `setta plugins install` supports only `github` and `pypi` source specs, and all other schemes fail with `PLUGIN_SOURCE_SCHEME_UNSUPPORTED`.
- Setta must not require `uv`; source installs support installer backend selection (`auto|pip|uv`) with deterministic fallback/error behavior.
- Package-manager-managed plugins from active Python environments are first-class in MVP and appear as environment-scoped plugin sources.
- Local plugin iteration in MVP uses explicit dev-only link commands (`setta plugins link` / `setta plugins unlink`) instead of `install path:` source schemes.
- Plugin install defaults to enabled unless `--no-enable` is explicitly provided.
- User-facing scope language is `workspace | environment | global` (`environment` maps to canonical `setta_files` scope).
- In-app installer supports `workspace`, `environment`, and `global` scopes in MVP.
- Plugin authoring ships with first-party starter/validation commands: `setta plugins init` and `setta plugins validate`.
- `setta plugins init` generates publish-ready templates by default (aligned package metadata, packaging includes, and release/publish guidance).
- Plugin identity invariants are strict in MVP: manifest `id/version` must match package metadata when metadata is present.
- Plugin config supports optional schema-based validation via `configSchemaPath`.
- Installer lifecycle includes update/pin/rollback in MVP.
- Setta plugin lockfile workflows are implemented via `setta plugins lock write` and `setta plugins lock apply`; package-manager lockfiles still handle package dependency reproducibility.
- Backend plugin changes remain restart-gated, but restart-required UX is first-class (button or exact fallback command).
- Backend plugin execution uses plugin-scoped worker runtimes with install-time dependency resolution.
- Content plugins are read-only template sources in MVP; users import/copy into mutable workspace stores explicitly.
- Restart behavior is exposed via explicit backend restart capability/action contracts so UI and CLI share the same deterministic fallback behavior.
- MVP includes provenance visibility (canonical source key, scope/path, source digest) and warning-only trust messaging.
- Frontend plugin loading uses native ESM `import()` only in MVP.
- Plugin-defined languages do not extend the core `CodeLanguage` enum in MVP. Language plugins register LSP/settings integrations only; optional enum extension follow-on is tracked in `Future Work`.
