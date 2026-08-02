# Setta 2 OSS Simplification and Release Plan

Date: 2026-08-03  
Status: Proposed execution plan  
Branch: `setta-2`  
Base: `go-rewrite` at `8f36f30b715bba979cf1cbbac113ede8e6c8b756`

## Executive Decision

Setta 2 will be an open-source, local-first desktop application that turns typed
Python functions into persistent visual control surfaces.

The release should do one job well:

> Open a Python project, select useful functions, arrange their generated
> controls on one canvas, connect compatible values, run the workflow locally,
> and inspect its outputs.

The current branch contains several adjacent products: a canvas IDE, an app
deployment system, an agent host, a plugin platform, a structured-file editor,
and a developer-to-operator handoff system. Those products make the primary
workflow difficult to explain, maintain, secure, and release. They are not part
of the Setta 2 release.

This is a direct redesign of an unreleased product. Superseded contracts and
implementations will be deleted rather than migrated or preserved behind
compatibility paths.

## Release Product Contract

### One-sentence description

Setta creates a visual, runnable control surface from ordinary Python
functions—without requiring the author to build a web UI.

### Canonical user

A Python developer, data practitioner, researcher, or technical operator who
has a useful script or library and wants a durable interface for running it.
The same person may both arrange and operate the canvas; Setta does not model
separate developer and end-user products.

### Golden workflow

1. Install and launch Setta without creating an account.
2. Open a local folder containing a Python project.
3. Select a top-level typed function discovered from that project.
4. Let Setta generate controls from its signature, type annotations, defaults,
   and docstring.
5. Arrange callable cards and controls on a single xy-flow canvas.
6. Connect a function output to a compatible downstream input when useful.
7. Run a callable or selected target; Setta evaluates any required upstream
   callables locally.
8. Inspect status, logs, scalar results, images, tables, and output files in a
   small, consistent result surface.
9. Save, close, and reopen the project with the same layout and bindings.

### Release promise

A new contributor should be able to build Setta from a clean clone, and a new
user should be able to install it and complete the documented example without
an account, hosted service, AI provider, plugin installation, or hand-edited
project JSON.

### Non-goals for the first OSS release

- A hosted service or multi-user collaboration product.
- Sharing, publishing, deployment, or operator-only application modes.
- A general-purpose IDE, Git client, terminal multiplexer, or remote workspace
  manager.
- A chat application, coding-agent control plane, MCP host, or AI app builder.
- A plugin marketplace or general extension host.
- A JSON, YAML, or TOML editor with live bidirectional file synchronization.
- A general visual-programming language with control-flow, agentic, or state
  machine edges.
- Multiple layouts, view modes, user tiers, or developer/user projections of a
  project.
- Multi-language callable discovery or code generation.
- Backward compatibility with any pre-release Setta project or settings file.

## Product Invariants

Every implementation decision should preserve these invariants:

1. **One project, one canvas.** A project has one ordered layout and one
   viewport. There is no active view, user tier, or hidden alternate layout.
2. **One local product mode.** The desktop application has no IDE/share/app/
   launcher policy matrix. The local user owns the project and can edit and run
   it.
3. **Python owns executable behavior.** Python source owns callable names,
   signatures, types, defaults, docstrings, and implementation.
4. **Setta owns the operating surface.** Setta owns layout, control
   presentation, value bindings, selected run inputs, and result presentation.
5. **Project state has one owner.** The Setta project document is canonical for
   Setta state. External JSON/YAML/TOML files are not live backing stores for
   portions of that state.
6. **Edges mean data.** A release edge connects a typed output to a compatible
   input. There are no styling-only, agentic, state-machine, or implicit
   routing edge families.
7. **Execution is explicit.** A user action starts a run. File changes may
   refresh callable metadata, but they do not silently execute workflows.
8. **Failures stay product-level.** Internal schema, projection, parsing, and
   protocol failures are repaired or reported as specific actionable product
   failures; raw implementation errors do not become UX.
9. **Go owns contracts.** Go owns validation, persistence contracts, endpoint
   shapes, runtime behavior, and generated TypeScript/Python surfaces.
10. **Removal is complete.** Deleted features leave no dormant schemas, mode
    flags, compatibility aliases, generated fields, routes, or documentation.

## Target User Experience

### Home

The home screen contains only:

- Open Python project.
- Recent Setta projects.
- Open example.
- Preferences, Help, and About.

It does not contain launchers, deployments, remote machines, worktrees,
plugins, chats, or project templates for unrelated section families.

### Project

The project screen contains:

- A single canvas.
- A small add-function/discovery surface.
- A project/run toolbar.
- A contextual inspector for the selected callable, control, or edge.
- A run/results drawer or panel.

The toolbar may include **Lock layout** as an editing convenience. Locking the
layout disables movement and resizing only; it must not change routing,
permissions, visible content, persistence, or rendering. It is not a user
mode.

### Function-to-control mapping

The initial supported type surface should be deliberately small and
deterministic:

| Python shape | Default control |
| --- | --- |
| `bool` | Switch |
| `int` / `float` | Numeric input |
| `str` | Text input |
| `Literal[...]` / `Enum` | Select |
| `Path` | Local file or directory picker |
| `Optional[T]` | Nullable form of `T` |
| Supported `list[T]` | Reorderable list control |
| Supported typed object | Nested controls |

Slider ranges, multiline presentation, secret handling, and other control
metadata must come from an explicit typed metadata contract. Setta must not
guess semantics from parameter names or docstring keywords.

Unsupported types should be identified during discovery with an actionable
message. The application should not silently coerce them through a generic
JSON editor.

### Graph execution

- Only data dependencies are represented as graph edges.
- The graph is a DAG for the initial release; cycles are rejected at edit time.
- Running a target evaluates stale upstream dependencies in topological order.
- A project has at most one active run in the initial release.
- The user can cancel the active run.
- There is no queueing, steering, approvals, detached run, run-chain, or
  state-machine lifecycle.
- Run progress is pushed from the backend; the frontend does not poll.
- Each node exposes a clear pending/running/succeeded/failed/cancelled state.
- A failed node prevents dependent nodes from running and reports which
  callable failed, with captured Python diagnostics.

### Outputs

Use a small output model instead of many specialized canvas section types:

- scalar/text,
- structured table,
- image,
- local file,
- captured stdout/stderr,
- unsupported value with a clear type explanation.

The first release does not need browser, iframe, chat, spreadsheet editor,
draw, social, task-board, or plugin-provided output sections. If retained code
already has useful artifact normalization, preserve the narrow normalization
logic and remove the surrounding general artifact platform.

## Scope Decisions

### Retain and simplify

| Capability | Release shape |
| --- | --- |
| xy-flow | The single canvas, nodes, data edges, pan, zoom, and selection. |
| dnd-kit | Reordering nested/list controls and small palette interactions. |
| Python discovery | Top-level typed callable discovery for one local project. |
| Python execution | One local managed execution path with cancellation. |
| Callable controls | Primitive, enum, path, optional, list, and supported nested inputs. |
| Dict/List values | Normal structured function inputs owned by project state. |
| Persistence | One current project schema, written atomically. |
| Realtime updates | One push path for run and source-refresh events. |
| Basic artifacts | Text, table, image, file, and logs. |
| Preferences | A small dedicated form backed by typed Go settings. |
| Desktop packaging | A self-contained desktop distribution plus source build instructions. |

### Remove

| Product family | Removal boundary |
| --- | --- |
| Developer/user views | View modes, view tabs, user tiers, per-view layouts/viewports, presentation routing, and projection logic. |
| App/share/deployment modes | Deployment builds, sessions, auth, share routes, standalone app surfaces, policy flags, and mode-specific behavior. |
| JSON-source sections | Structured-file watchers, parsers, source keys, merge/writeback, missing-source state, and source-file actions. |
| Settings project | Settings canvas, settings view modes, project shell, materializer, and settings-project persistence. |
| AI and chat | Managed/scriptable chat, LLM configuration, transcripts, prompts, AI Follow, agent summaries, and chat windowing. |
| Agents and MCP | External agents, profiles, agent runs, MCP server/tools, agentic edges, and approval/steering surfaces. |
| Plugin platform | Plugin registry/install/update/authoring, plugin-owned routes/UI, marketplace concepts, and bundled first-party plugin packaging. |
| Multi-language/LSP platform | Language-server plugins, generalized LSP selection, completion infrastructure, and non-Python codegen targets. |
| State machines | Start/gate/end sections, run chains, signals, and control-flow edges. |
| IDE utilities | Git panes, general file browser, SSH, dev worktrees, remote launcher, and embedded terminal sections. |
| General app generation | JSON Render, AppSpec, app-subsystem providers, previews, themes, catalogs, and React export/deployment. |
| Specialized sections | Browser, iframe, chat, spreadsheet editor, draw, social, task board, prompt, and other non-core surfaces. |
| Variants/versions | Section/code-object variants and active-variant maps; a node has one current implementation. |
| Configurable internals | User-facing defaults for every section/control size, color, implementation, and internal policy. |
| Secret persistence | Password controls and project password files; v0.1 workflows receive secrets through their process environment. |

### Keep as implementation details, not product features

- JSON serialization for Setta project and preferences files.
- Normal Dict/List/nested parameter controls.
- Atomic persistence and backup primitives that remain useful after schema
  reduction.
- Internal typed messages used by the one retained push channel.
- Source file watching limited to refreshing the metadata of selected Python
  callables.

### Explicitly defer

The initial architecture must not contain empty extension points for these
possibilities, but they may be reconsidered after users validate the core:

- One-way import/export for structured config files.
- Saved input presets.
- Reusable layout templates.
- Remote runners.
- Sharing or publishing a frozen control surface.
- Additional languages.
- A documented plugin API.
- AI-assisted callable selection or layout.

## View-Mode Removal Design

The current project model stores view-mode definitions, an active view ID,
per-view layouts, and per-view viewports. It also carries related assumptions
through Settings and share/app routing.

Replace that model directly with one project-level canvas state:

```text
Project
├── metadata
├── workspace root and Python environment
├── nodes
├── data edges
├── layout
├── viewport
├── layoutLocked
└── latest run/results metadata
```

Required deletion work:

1. Remove `ViewMode`, active-view IDs, user tiers, view ordering, view-specific
   layout maps, and view-specific viewport maps from Go-owned project state.
2. Regenerate all affected HTTP and frontend contracts before cleanup.
3. Replace projection helpers with a single project-to-canvas projection.
4. Delete view tabs, view-mode drag-and-drop, view editors, and commands for
   adding, cloning, renaming, sorting, or deleting views.
5. Delete standalone/user-view renderers and route branches.
6. Move the remaining layout and viewport values to the project owner.
7. Retain a simple layout lock only if it has no alternate-state semantics.
8. Remove view documentation and settings instead of marking them deprecated.

Completion evidence:

- Searching owner-defined and generated contracts finds no view-mode or user-
  tier fields.
- Loading, editing, running, saving, and reopening all use the same canvas
  state.
- No route or component chooses a renderer based on a product/user mode.

## JSON-Source Removal Design

“JSON section” currently describes more than a syntax-highlighted code block.
A JSON-source Dict section can bind a subtree of project parameters to a JSON,
YAML, or TOML file and synchronize changes in both directions. That subsystem
requires file watchers, ordered parsers, merge-by-name behavior, source-key
paths, overlap precedence, missing-file state, feedback-loop suppression, and
special save cleanup.

Setta 2 removes the entire structured-file source-binding capability across all
three formats. Removing only the JSON extension would preserve nearly all of
the complexity.

Required deletion work:

1. Remove the `internal/jsonsourcewatch` package.
2. Remove `internal/projectstate/json_source_*` load, save, validation,
   refresh, watch, and persistence-cleanup paths.
3. Remove `isJsonSource`, `jsonSourceKeys`, `jsonSourceMissing`, and
   `AllowJSONSourceKeyEdits` from Go-owned state and generated contracts.
4. Remove source discovery, file ownership, overlap, missing-path, and
   autosave-ordering behavior.
5. Remove create-menu entries and configuration UI that expose file-backed
   JSON/YAML/TOML sections.
6. Remove delete-file/delete-variant modals and actions that exist for those
   sections.
7. Delete reference documentation for JSON-source formats and synchronization.
8. Preserve ordinary Dict/List/nested controls and verify that they no longer
   depend on file-source fields.
9. Keep JSON project persistence internal and never present it as a canvas
   section.

If structured config support is later validated, introduce it as an explicit
one-way **Import values** or **Export values** action. Do not restore live
bidirectional synchronization without a separate product decision.

## Settings Replacement

The current Settings route is a special Setta project. It converts the settings
document into JSON-source Dict sections, arranges them into Settings-specific
view modes, lets the user edit code objects on the canvas, and materializes the
result back into settings. This couples Settings to both systems being removed.

The existing settings runtime, load/save capability, and validation can be
reused only where they fit the smaller contract. The project shell and
materializer should not survive.

### Target settings architecture

```text
Go-owned Preferences struct and defaults
                 │
                 ├── atomic preferences store
                 ├── typed load/update endpoint contracts
                 └── generated TypeScript surface
                                  │
                                  └── dedicated Preferences form
```

### Initial preference surface

- Appearance: system/light/dark.
- Canvas: grid visibility and snap-to-grid.
- Saving: autosave and local backup policy.
- Python: default interpreter only when not overridden by the project.
- Runs: one or two behavior choices only if they represent meaningful user
  decisions.

Project-specific Python environment selection belongs in project configuration,
not global preferences. Keyboard shortcuts should initially be documented and
fixed. Section sizing, colors, implementation payloads, internal policies, and
defaults for deleted section types become owning-component constants or are
deleted.

### Replacement sequence

1. Define a small explicit Go `Preferences` contract instead of a generic
   `map[string]any` document.
2. Make the endpoint registry own typed load and update contracts and generate
   the frontend surface from them.
3. Persist preferences atomically with restrictive file permissions.
4. Build a normal, accessible Preferences page using toggle, select, numeric,
   and path controls.
5. Route `/settings` directly to that page.
6. Delete the Settings project runtime, shell builder, view-mode definitions,
   JSON-source materializer, backfill behavior, and reserved project identity.
7. Delete the hundreds of obsolete defaults instead of hiding them.
8. Remove the settings-project file and all special handling in project routes,
   websocket behavior, startup, and tests.

There must be no transitional dual-write or fallback to the Settings project.

## Target Runtime Architecture

```text
Electron desktop shell
        │
        ├── React UI
        │     ├── Home
        │     ├── Single xy-flow canvas
        │     ├── Inspector
        │     ├── Run/results panel
        │     └── Preferences
        │
        └── Go application
              ├── Project store
              ├── Python callable discovery
              ├── Graph validation/planning
              ├── Local Python process lifecycle
              ├── Result/artifact normalization
              ├── Preferences store
              └── One push event stream
                         │
                         └── Selected local Python interpreter
```

The desktop application binds backend services to loopback only. No route
family assumes an untrusted remote/browser client. The frontend still receives
only the minimum filesystem and process capabilities through production
Electron main/preload boundaries.

Python integration should use one deterministic, versioned process protocol.
If a Python helper package remains necessary, reduce it to discovery,
invocation, value encoding, and result encoding. Go owns lifecycle,
validation, persistence, and protocol contracts. Do not retain a generalized
Python SDK solely for deleted listeners, chat tools, plugins, or deployments.

## Project Model Reduction

Define a new schema from the release contract rather than editing the old
schema until it happens to work. At minimum, the owner model needs:

- project identity and workspace root,
- selected Python interpreter/environment,
- callable nodes and their source bindings,
- control presentation metadata,
- current input values,
- typed data edges,
- one layout and viewport,
- layout lock,
- minimal run/result references,
- schema version for the new current format.

It does not need:

- section or code-object variants,
- default/active variant maps,
- view modes or user tiers,
- deployment/auth/session state,
- plugin payloads,
- JSON-source metadata,
- AI/chat/state-machine metadata,
- general section implementation blobs for removed types.

Prefer explicit discriminated Go types for retained node, control, edge, run,
and result variants. Generate exhaustive TypeScript unions and use `never`
assertions in renderer switches. Do not preserve an untyped payload-bag model
just because it is already present.

## Execution Phases

Each phase must leave the branch internally coherent. Do not retain old and new
systems in parallel. A phase may temporarily fail the not-yet-authorized test
suite during implementation, but generated outputs must be refreshed when
their owners change, and changed files should be formatted before handoff.

### Phase 0 — Freeze the product contract and baseline

Deliverables:

- Adopt this document as the scope authority for `setta-2`.
- Add one canonical example Python project that exercises primitive controls,
  enum selection, a path, a list/nested value, two connected callables, an
  image or table result, and an output file.
- Write the expected golden workflow independently of current implementation
  details.
- Inventory current packages, routes, websocket messages, generated contracts,
  settings, section types, and docs into **retain**, **replace**, and **delete**
  ownership lists.
- Record current package/bundle size, cold start, representative canvas DOM
  size, interaction latency, and run latency under
  `docs/reports/performance/` before performance-relevant changes.
- Record current source and packaged dependency/license inventories.

Exit criteria:

- Every top-level package and user-visible feature has an explicit disposition.
- The golden workflow and example do not rely on a feature marked for removal.
- No implementation expands scope beyond this release contract.

### Phase 1 — Replace Settings

Deliverables:

- Small Go-owned typed Preferences contract.
- Typed load/update routes and regenerated frontend clients/types.
- Dedicated Preferences UI.
- Direct persistence with strict validation and permissions.
- Complete deletion of the Settings project, shell, materializer, views, and
  special routes.

Exit criteria:

- Preferences can load, change, persist, and reload without opening or mutating
  project state.
- The application has no reserved Settings project ID/name.
- No settings value is represented as a section, variant, or code object.

### Phase 2 — Collapse to one canvas and one local mode

Deliverables:

- One project-level layout and viewport.
- One project renderer and route.
- Optional layout lock with no mode semantics.
- Deletion of view modes, user tiers, view UI, alternate project surfaces, and
  their contracts.
- Deletion of share/app/deployment/launcher/auth/session mode families and
  mode-policy branches.

Exit criteria:

- Every project route resolves to the same canvas model.
- The same visible nodes are edited and run; there is no projection boundary.
- There are no product-mode permission checks because there is only the local
  desktop product.

### Phase 3 — Remove JSON-source and structured-file sections

Deliverables:

- Delete watchers, format adapters, merge/writeback, source keys, missing state,
  source cleanup, routes, UI, and documentation.
- Remove all source-specific fields from owner models and regenerated outputs.
- Retain and simplify ordinary Dict/List/nested controls.

Exit criteria:

- No canvas section reads from or writes to a JSON/YAML/TOML source file.
- Project save has one persistence path and no source-synchronization ordering.
- A structured Python input remains editable without a JSON-source dependency.

### Phase 4 — Remove non-core product families

Delete in ownership order so routes and generated surfaces do not outlive their
owners:

1. App generation, deployments, sharing, auth, and sessions not already removed
   with modes.
2. AI/chat/LLM/transcription families.
3. Agent/MCP/profile/run families and agentic edges.
4. State machines, run chains, listeners, and signals.
5. Plugin authoring/runtime/registry and first-party plugin packaging.
6. General LSP/multi-language/codegen-target infrastructure.
7. Git, SSH, worktree, launcher, file-browser, and terminal product surfaces.
8. Specialized section families and their artifacts/settings.
9. Password controls and file-based password stores.

For retained Python discovery currently supplied by Watch Code or an LSP
plugin, move only the minimum deterministic behavior into a focused core Go/
Python boundary. Do not retain a plugin framework to host one built-in feature.

Exit criteria:

- Startup constructs only services used by the golden workflow.
- The route registry, push-message catalog, generated frontend surface, and
  menus expose only retained capabilities.
- Removed packages are deleted, not left unreachable or disabled.

### Phase 5 — Replace the project model and execution core

Deliverables:

- Explicit new project schema with no variants or generic removed-feature
  payloads.
- Deterministic Python discovery protocol.
- Supported type/metadata contract and generated UI mapping.
- Data-only graph validation and DAG planner.
- One local run lifecycle with cancellation and pushed progress.
- Small result/artifact normalization model.
- Atomic project persistence and reopen behavior.

Exit criteria:

- The canonical example completes entirely through the new owner model.
- Unsupported Python types fail discovery specifically.
- Invalid edges and cycles are rejected before execution.
- Restarting the app preserves project inputs, layout, viewport, and bindings.

### Phase 6 — Rebuild the release UX around the golden path

Deliverables:

- Focused home/open-project onboarding.
- Callable picker with deterministic source location and signature information.
- Clear empty, loading, refresh, run, cancellation, failure, and result states.
- Small inspector and results surface.
- Keyboard and screen-reader support for all non-canvas operations, with
  documented canvas accessibility constraints and equivalent commands where
  needed.
- Efficient rendering for large callable/control sets.

Performance work must baseline first and record before/after results as
append-only reports under `docs/reports/performance/`.

Exit criteria:

- A first-time user can complete the canonical example from UI labels and the
  short quickstart alone.
- Internal protocol/schema errors never appear as user instructions to retry
  implementation machinery.
- Large projects do not create avoidable full-canvas rerenders or unbounded DOM
  growth.

### Phase 7 — Security, privacy, and supply-chain hardening

Deliverables:

- Loopback-only backend binding and explicit Electron navigation/window-open
  policy.
- Strict main/preload/renderer capability boundary and content security policy.
- Workspace path confinement for discovery, execution, file pickers, and
  artifacts.
- Argument-safe subprocess execution; no shell interpolation of project data.
- Atomic files with restrictive permissions for settings and sensitive local
  state.
- No persisted password values; document environment-based secret injection.
- No telemetry, analytics, remote calls, or update checks unless explicitly
  documented and opt-in.
- Dependency and transitive-license review.
- Preserve the upstream MIT notices for the forks under
  `frontend/src/forks/xyflow` and `frontend/src/forks/dnd-kit` and add a complete
  third-party notice file.
- Review the Apache-2.0 project license against every retained dependency,
  bundled binary, font, icon, and asset.
- Pin every checked-in direct dependency exactly and produce lockfiles only via
  the repository dependency update workflow.
- Produce checksums and an SBOM for release artifacts.

Exit criteria:

- A documented threat model covers untrusted Python projects and local browser
  clients.
- No deleted auth/deployment code is being relied on as accidental local
  security.
- Every shipped third-party work has compatible licensing and required notice
  text.

### Phase 8 — OSS repository and distribution readiness

Deliverables:

- Rewrite the root README around the one-sentence description and golden
  workflow.
- Include screenshots or a short recording of the canonical example.
- Add a concise architecture document for the retained Go/React/Python
  boundaries.
- Rewrite clean-clone development, build, and packaging instructions.
- Add `CONTRIBUTING.md`, `SECURITY.md`, support policy,
  issue templates, and release process.
- Replace or delete all docs that describe removed behavior.
- Publish the canonical example with pinned dependencies and sample data.
- Ensure the application contains About, version, license, and diagnostics
  information useful for issue reports.
- Define the supported OS/architecture matrix from environments that can run
  the production golden workflow. Mark unverified builds experimental rather
  than claiming support.
- Configure reproducible CI builds and release artifacts without repository or
  developer-machine secrets.

Exit criteria:

- A clean clone has one obvious setup path.
- The README never requires understanding removed product history.
- Installation and first run require no private package, private service, or
  undocumented credential.
- The repository contains no stale screenshots, plans presented as current
  behavior, or links to deleted features.

### Phase 9 — Merge verification and v0.1 release

This phase starts only when the branch is otherwise ready to merge and the
user explicitly requests verification. Automated tests and broad verification
gates must not be run earlier merely because implementation is underway.

Verification order:

1. Inspect the complete diff and removal inventory.
2. Regenerate affected outputs and inspect owner/generated boundaries.
3. Run the narrowest checks for Preferences, project persistence, discovery,
   graph validation, execution, and results.
4. Run deterministic end-to-end desktop workflows through production Electron
   main/preload/renderer, HTTP/push transport, Go stores, and the Python process
   protocol using temporary app and project data.
5. Cover open project, discover callable, add controls, arrange/connect, save,
   run, stream output, cancel/fail, reload, and run again.
6. Run frontend performance scenarios against the recorded baseline and append
   final results.
7. Run the broader quality and supply-chain gates only after focused failures
   are resolved.
8. Build release artifacts in every claimed supported environment.
9. Install each artifact into a clean environment and complete the canonical
   example without source-checkout assumptions.
10. Perform final accessibility, visual, license, security, SBOM, checksum, and
    documentation review.

All tests must use temporary directories and disposable Python projects. They
must not mutate this repository's real Git history or developer application
data.

## Release Acceptance Criteria

The first OSS release is ready only when all of the following are true:

### Product

- Setta has one clear description and one primary workflow.
- The canonical example can be completed from installation through persisted
  rerun.
- One canvas is the only project representation.
- Normal Python Dict/List/nested inputs work without structured-file sources.
- Preferences are a normal form, not a Setta project.
- Runs are local, explicit, cancellable, and visibly stateful.

### Removal

- No view modes, user tiers, share/app/deployment modes, or alternate project
  renderers remain.
- No JSON/YAML/TOML source synchronization remains.
- No Settings project or settings materializer remains.
- No AI/chat/agent/MCP/plugin/state-machine product surface remains.
- No removed feature survives as an ignored schema field, route, message,
  generated declaration, menu item, setting, test fixture, or current doc.
- There are no compatibility shims for old project/settings formats.

### Engineering

- Go owns the retained contracts and generated frontend/Python surfaces.
- Direct dependency versions are exact.
- Persistence is atomic and permissions are appropriate.
- Push events replace polling for source/run updates.
- Large canvases meet the recorded interaction-performance target.
- Production-path end-to-end coverage exercises the complete golden workflow.

### OSS and security

- Clean-clone build and packaged install instructions are reproducible.
- Apache-2.0 licensing and all third-party notices are complete.
- Release artifacts have checksums and an SBOM.
- The local attack surface and untrusted-project risks are documented.
- No account, cloud service, private dependency, API key, or telemetry consent
  is required for the core workflow.
- Every platform advertised as supported has completed the packaged golden
  workflow.

## Execution Guardrails

- Delete by owner boundary, then regenerate consumers; do not manually patch
  generated outputs.
- HTTP endpoint contracts remain owned by the endpoint registry.
- Run Go commands through `./scripts/go.sh` and dependency changes through
  `./update_dependencies.sh`.
- Use `./scripts/format.sh` where available.
- Do not introduce compatibility layers while removing pre-release behavior.
- Do not replace typed metadata with keyword heuristics.
- Do not retain generalized frameworks for a single built-in use case.
- Do not count deleted lines as success by itself; success is a complete golden
  workflow with fewer concepts and ownership paths.
- Keep a removal ledger during implementation with columns for old owner,
  replacement owner, deleted routes/messages/contracts, and documentation.
- When a phase reveals that a retained core behavior depends on a deleted
  framework, extract the smallest explicit behavior into the new core rather
  than preserving the framework.

## Final Release Narrative

The release should be explainable without reference to what Setta used to be:

> Setta is an open-source desktop app for turning Python functions into visual
> control surfaces. Open a project, choose functions, arrange and connect them,
> run locally, and keep the resulting interface with the code.

Anything that does not reinforce that narrative should be removed from the
first release or deferred until real users demonstrate that it belongs.
