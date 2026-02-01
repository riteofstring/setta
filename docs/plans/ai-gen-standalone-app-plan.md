# AI-Generated Standalone App Mode Plan

## Summary
Setta currently has IDE mode (full editor) and Share mode (snapshot + policy gates) but both render the same complex UI with the pan/zoom canvas and editor panes. This plan introduces a third runtime mode, App mode, that serves a standard web app surface built from a Setta project. The app can be minimal (a few inputs + Run button) or fully custom, and can be generated or modified via project chat.

## Goals
- Add a third runtime mode that serves an end-user web app without the IDE or canvas UI.
- Allow developers to define a custom app surface that is independent of the pan/zoom section graph.
- Support "public sharing" where users can update a limited set of params and run a selected code section.
- Enable AI-driven app generation from project chat with guardrails.
- Reuse as much of the existing share deployment/session machinery as possible.

## Non-Goals
- Replacing IDE mode or Share mode.
- Building a full WYSIWYG web builder in the first iteration.
- Allowing arbitrary code execution or file access from the app UI outside existing share policy gates.

## Current System Touchpoints
- Frontend routing and server-mode detection live in `frontend/src/components/Pages/router.tsx` and `frontend/src/state/definitions.ts`.
- IDE/Share UI are both rendered by `MainContainerCore` in `frontend/src/components/Pages/MainContainerCore.tsx`.
- Share deployments and sessions are implemented in `backend/setta/routers/share_deployments.py` and stored under `setta_files/share_deployments/`.
- View modes live in `ProjectConfig.viewModes` with `isUserFacing` for user-facing display (`docs/reference/view-modes.md`).
- MCP + project chat tooling are documented in `docs/reference/mcp-system-overview.md`.

## Proposed UX
- In IDE mode, add a new "App" configuration surface.
- Include an app preview for fast iteration.
- Add a "Generate App" entry that opens project chat with the app generator prompt.
- Add a "Publish App Deployment" flow similar to Share deployments.
- In App mode, the UI loads directly into a standard page layout that does not include Overview, UI Editor, or the ReactFlow canvas.
- App mode should allow minimal param editing and a single "Run" action out of the box, with richer customization via the app spec.

## App Mode Definition
- Introduce an `AppConfig` block on `ProjectConfig` or a sibling object in `project.json`.
- App spec is stored in json-render's UI tree format, not a custom schema.
- Suggested fields (draft, iterate as we implement).
- Field: `appSpecVersion` (string)
- Field: `uiTree` or `appUi` (json-render JSON UI definition)
- Field: `catalogId` (identifier for the UI component catalog)
- Field: `routes` (optional pages and path mapping)
- Field: `dataBindings` (mapping of data paths to Setta param ids or run outputs)
- Field: `actions` (named actions mapped to backend endpoints such as run, reset, export)
- Field: `theme` (colors, fonts, spacing, light/dark defaults)
- Field: `assets` (static file references)
- Store the json-render UI tree in a separate JSON file, referenced from `AppConfig`.

## Renderer Strategy (Recommended Baseline: JSON Render)
Use `json-render` to define a catalog of allowed components and let AI generate a JSON UI tree that is rendered by a dedicated App renderer.

- Catalog-driven guardrails define exactly which components and actions AI can output. This prevents arbitrary code generation and keeps app UIs safe and predictable.
- Map catalog component types to Setta's existing param and layout components, or wrap them in app-specific UI components.
- Map data paths to Setta state using JSON Pointer, then bind input components to those paths.
- Actions should be named and mapped to concrete backend handlers (run section, reset values, download artifact).
- Use explicit binding objects in the UI tree for params and actions, not implicit string conventions.

## Output Mapping (v1)
- Support TextBlock outputs by binding to a TextBlock section id.
- Support image artifact outputs by binding to a specific artifact id.
- Defer terminal outputs, arbitrary file downloads, and structured data tables to v2.

## AI Generation via Project Chat
- Add a project chat flow that can generate or update `AppConfig`.
- Add MCP tools to read/write the app spec.
- Tool: `get_app_spec`
- Tool: `set_app_spec`
- Tool: `update_app_spec`
- Tool: `list_app_components`
- Tool: `get_app_catalog`
- Generate the LLM system prompt from the catalog schema and include project context (available params, code sections, run targets).
- Provide a "Generate App" prompt template with guardrails.
- Guardrail: Allowed components only.
- Guardrail: All inputs must map to Setta params.
- Guardrail: Exactly one run action unless explicitly requested.
- Store generated app spec in the project state and include it in deployments.

## Backend Plan
- Reuse Share deployments and runtime for App mode.
- Store the app UI tree as a separate JSON file in the deployment root.
- Snapshot: `project.json` with `AppConfig` referencing the app UI JSON.
- Add App runtime state and sessions.
- Consider reusing `ShareRuntimeState` with an `app_mode` flag and `app_policy`.
- Reuse share session headers and session lifecycle to avoid new auth machinery.
- Add App mode CLI entry: `setta app --deployment-name ... --version ...`.
- Add new endpoints under `/api` to fetch App deployment metadata.
- Add new endpoints under `/api` to create App sessions.
- Add new endpoints under `/api` to load App UI state (project + app spec + policy).

## Frontend Plan
- Extend `useServerMode` to track `ide | share | app`.
- Add a new App container component that replaces `MainContainerCore` when `app` mode is detected.
- Add an `AppRenderer` that loads `AppConfig` and `app_policy`.
- AppRenderer should set up data bindings to Setta params and run outputs.
- AppRenderer should implement action handlers to call existing endpoints (run code, reset params, download artifacts).
- Add “App Preview” in IDE mode so developers can iterate without publishing.
- Serve App mode as a single-page app at `/` on app deployments.

## Policies and Gating
- Base App gating on existing share policy rules.
- Gate: `allowParamChanges`
- Gate: `allowRun`
- Gate: `allowLLM`
- Add optional app-specific gates such as `allowExternalLinks`, `allowFileDownloads`, and `allowMultipleRuns`.
- Keep file access restricted to deployment roots, mirroring Share mode.

## Long-Term Architecture (Principled Path)
- Canonical runtime is a JSON UI spec rendered by a fixed, versioned renderer.
- The renderer is catalog-driven so components and actions are explicitly allowed and validated.
- AI writes or updates JSON specs only, never arbitrary runtime code.
- External design tools (Pencil, Figma, etc.) act as import sources that compile to the canonical JSON spec.
- The app spec remains the single source of truth for deployment and runtime.

## Escape Hatches (Power Users)
- Optional export to a standalone React project for full customization.
- Optional custom component bundles that are explicitly registered in the catalog.
- Any non-catalog code path is opt-in and clearly marked as unsupported by default policies.

## Pencil.dev Integration (Optional)
- Pencil uses `.pen` design files that are JSON-based, version-control friendly, and portable.
- Pencil exposes an MCP server so AI can read or modify `.pen` files.
- Pencil supports design-to-code workflows where AI generates React or Next.js components from designs.
- Potential integration path: store a `.pen` file alongside the Setta project and reference it in `AppConfig`.
- Potential integration path: add tooling to export Pencil designs to the App UI tree or to a static React bundle.
- Potential integration path: use Pencil MCP tools to let project chat modify the design file, then regenerate the App UI.

## json-render Integration Notes
- json-render catalogs define allowed components, actions, and validation, providing guardrails for AI-generated UIs.
- Components are registered in a React registry and can use data binding hooks to read or write JSON Pointer paths.
- Actions are named and handled by application code via an ActionProvider, so AI only declares intent.
- json-render supports streaming JSONL patches via `useUIStream`.
- json-render supports code export through `@json-render/codegen` utilities.

## Testing Strategy
- Backend tests for App deployment creation, policy enforcement, and session creation.
- Backend regression tests for share deployments to ensure no mode interference.
- Frontend Vitest coverage for App renderer data binding and action handlers.
- Frontend Playwright test for App mode load, param edits, and Run action.

## Phased Delivery
- Phase 0: Spike on App config schema, renderer choice, and deployment layout.
- Phase 1: App mode runtime using json-render with a fixed catalog and manual JSON spec editing.
- Phase 2: Project chat generation flow + MCP tools for app spec updates.
- Phase 3: Optional Pencil integration and static code export pipeline.

## Open Questions
- Do we support multiple app pages or only a single page in v1?
- Do we allow app mode LLM calls, or restrict LLM to IDE-only generation?

## Related Code
- `frontend/src/components/Pages/router.tsx`
- `frontend/src/components/Pages/MainContainerCore.tsx`
- `frontend/src/state/definitions.ts`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/server_state.py`
- `backend/setta/types/project_config.py`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `docs/reference/mcp-system-overview.md`
