# Independent Open-Source Section Workspace Projects Plan

## Decision

Create one reusable section-workspace package and a small number of independent open-source applications built on it.

The flagship is more than a set of React components. It combines a headless, serializable structural workspace engine with Setta's React Flow, dnd-kit, section, control, and side-pane interaction model. Applications share that structural behavior without sharing application backends or domain models.

```text
@setta/section-workspace
├── Python Canvas
├── MCP Canvas
├── Agent Canvas
├── Data Canvas
└── Agent Signal Canvas
```

The dependency rules are:

- `@setta/section-workspace` has no dependency on any Setta application or backend.
- Each application may depend on `@setta/section-workspace`.
- No application may depend on another Setta application.
- Applications share only the package's structural workspace model and UI contracts.
- Applications do not share a required backend, domain model, database, CLI, MCP server, or application project format.
- Applications may interoperate through external standards such as MCP, ACP, HTTP, OpenAPI, files, or subprocess protocols.
- Internal modules are not published merely because they are testable.
- A public package or application is released only when it is useful independently.

Release decisions are based on technical distinctness, completeness, maintainability, testability, security, accessibility, and licensing. Popularity, market size, user demand, and startup potential are not criteria.

## Intended releases

| OSS project | Type | Independent purpose | Existing Setta work it can salvage | Status |
|---|---|---|---|---|
| `@setta/section-workspace` | TypeScript/React package | Add a serializable, recursively composable section workspace to any React application | Structural workspace model, operation/history behavior, XYFlow fork, dnd-kit integration, section design, controls, minimap, two side panes | Commit first |
| Python Canvas | Application with CLI/MCP | Reconcile Python source with a visual function graph, compile the graph deterministically, run it, and map diagnostics back to graph objects | Dict/Callable sections, signatures, Watch Code, LSP, Python execution, codegen, source maps, terminal, run plans | First application |
| MCP Canvas | Application with CLI/MCP | Build persistent visual boards of MCP tools, values, connections, calls, and outputs | MCP client/server, tool discovery, Dict/Callable UI, tool search, calls and results | Independent candidate |
| Agent Canvas | Application with CLI/MCP | Manage coding-agent sessions, prompts, context, approvals, tools, and outputs spatially | Codex, Claude, chats, attachments, profiles, agent runs, approvals and events | Independent candidate |
| Data Canvas | Application with CLI/MCP | Work with local files, spreadsheets, charts, images, and drawings on a spatial board | File browser, spreadsheet, chart, image, drawing and artifact systems | Independent candidate |
| Agent Signal Canvas | Application with CLI/MCP | Design and run explicit signal graphs that coordinate persistent agent chats through gates and observable state transitions | Start/gate/chat/end sections, agent signals, state-machine edges, child runs and run tracking | Independent candidate with high extraction cost |

Only the flagship package and Python Canvas are committed before an extraction spike. The other candidates are evaluated independently against the release criteria in this plan. Evaluation is about whether the resulting software is distinct and complete, not whether anyone has requested it.

## Extraction reality

This plan is not a mechanical repository split. It extracts substantial existing behavior, removes Setta-specific coupling, and adds the minimum contracts needed for independent use.

| Release | Mostly extract and prune | Material new work |
|---|---|---|
| Section Workspace | React Flow canvas, dnd-kit behavior, groups, sections, controls, panes, references, variants, views and layouts | Public generic state model, serialized operation schemas, revision conflicts, transaction planning, inverses, host boundary and documentation |
| Python Canvas | Watch Code, callable discovery, Dict/Callable behavior, LSP, code generation, diagnostic mapping, execution, terminals and runs | Python-Canvas-owned graph model, reviewable reconciliation plans, stable semantic source-map contract, independent file format and CLI/MCP surface |
| MCP Canvas | MCP connections, discovery, calls, results and structured controls | Independent board model, persistence, safe machine editing and complete standalone workflow |
| Agent Canvas | Codex/Claude adapters, chats, profiles, approvals, events and attachments | Independent durable session model, protocol boundary, workspace policy and object-attention integration |
| Data Canvas | File browser, preview, spreadsheet, charts, images, drawings and artifacts | Coherent independent file/artifact model and standalone security boundary |
| Agent Signal Canvas | Existing gates, signals, edges, chat actions and run tracking | Decoupled agent/runtime boundary, independent persistence, corrected execution invariants and complete standalone application |

The boundary spike exists to determine whether the flagship's genericization is reasonably extractable. If it requires rebuilding the current UI or structural behavior from scratch, stop and narrow the public contract before committing to the later releases.

## Public package rule

A code boundary does not automatically justify a public package.

Publish something separately only if:

1. It can be installed and used without any sibling application.
2. Its purpose can be explained in one concrete sentence.
3. It owns everything required for that purpose, other than the shared flagship package and ordinary third-party dependencies.
4. It has its own tests, examples, release artifact, and security model.
5. If it is an application, its CLI and MCP server work without another Setta application. A library does not invent a process surface merely to satisfy this rule.
6. Removing every sibling application does not break it.
7. It is not a thin rebranding of an existing mature OSS project.
8. It is complete and maintainable enough to be useful as released.
9. Its license and dependency obligations are clear.

Internal libraries, sections, panes, providers, and test helpers remain inside the owning project unless they independently satisfy this rule.

## Flagship section-workspace package

### Package

`@setta/section-workspace` is one independently installable TypeScript/React package.

Its concrete purpose is:

> Add Setta's recursively composable infinite-canvas workspace to an unrelated React application, including structural drag-and-drop, nested sections, references, variants, saved views, undoable operations, and two side panes, without requiring a Setta backend.

A separate React application must be able to install the package, create an in-memory workspace, register its own sections and pane tabs, apply structural operations, and render a functioning canvas.

### What the package owns

#### Structural workspace model

The package owns the reusable spatial structure that made Setta's canvas difficult to reproduce correctly:

- Stable workspace, section, edge, view, variant, and reference IDs.
- Parent-child containment for recursively nested sections and groups.
- Section kind, opaque application data, position, size, minimized state, lock state, color, and other presentation metadata.
- Ports and graph edges without application-specific execution semantics.
- References that point at an existing section without duplicating its identity.
- Variants with stable IDs, names, ordering, default/selected/frozen presentation state, application-owned payloads, and independently stored layouts where applicable.
- Saved views with viewport, visibility, and layout state.
- Selection and multi-selection.
- Workspace revision.
- Undo and redo history derived from inverse operations.

The package distinguishes structural workspace state from application domain state. It may store opaque typed payloads supplied by an application, but it does not interpret Python functions, MCP tools, agent sessions, files, or other domain objects.

Applications may embed a serializable `WorkspaceSnapshot` inside their own project format. Sharing this structural snapshot contract does not require applications to share their complete project files.

#### Semantic structural operations

All structural changes use one public operation model rather than component-specific callbacks:

```ts
type WorkspaceOperation =
  | CreateSectionOperation
  | DeleteSectionsOperation
  | MoveSectionsOperation
  | ReparentSectionsOperation
  | GroupSectionsOperation
  | UngroupSectionsOperation
  | ResizeSectionOperation
  | SetSectionPresentationOperation
  | ConnectSectionsOperation
  | DisconnectSectionsOperation
  | CreateReferenceOperation
  | CreateVariantOperation
  | UpdateVariantOperation
  | DeleteVariantOperation
  | ReorderVariantsOperation
  | SelectVariantOperation
  | CreateViewOperation
  | UpdateViewOperation
  | DeleteViewOperation
  | ApplyLayoutOperation;
```

Each operation supports, where applicable:

- Stable object IDs.
- An expected workspace revision.
- Dry-run validation.
- Structured validation and conflict errors.
- Deterministic application.
- An inverse operation or inverse transaction for undo.
- JSON serialization.
- Atomic multi-operation transactions.
- Human-readable summaries suitable for approvals and history.

The public headless API includes concepts equivalent to:

```ts
validateOperation(snapshot, operation)
planTransaction(snapshot, operations)
applyOperation(snapshot, operation)
applyTransaction(snapshot, operations)
invertOperation(snapshot, operation)
```

The package exports operation schemas so consuming applications can expose the same operations through their own CLI and MCP tools. The package itself does not run a CLI or MCP server because it owns no process, persistence location, or application document.

#### Canvas

- Adapted XYFlow canvas.
- Pan and zoom.
- Viewport helpers.
- Background and grid.
- Minimap.
- Fit-to-view and centering.
- Selection and multi-selection.
- Node movement and resizing.
- Recursive grouping, nesting, and ungrouping.
- Copy, paste, and linked-reference creation.
- Coordinate-safe movement and reparenting across canvas, group, and nested-section spaces.
- Edges, ports, handles, and connection gestures.
- Saved-view selection and layout application.
- Undo and redo integration through structural operations.
- Automatic-layout integration points and the reusable existing layouts where extractable.
- Context-menu attachment points.
- Command-palette and advanced-search attachment points.
- Keyboard and pointer interaction.
- Large-canvas rendering behavior.

#### Drag and drop

- dnd-kit provider and adapters.
- Zoom-aware coordinates.
- Collision detection.
- Nested section and control sorting.
- Drag handles.
- Drag overlays.
- Auto-scroll behavior.
- Section palette drops.
- Reordering utilities.

#### Section UI

- Section frame and header.
- Title, icon, status, color, minimize, lock, resize, and selection states.
- Generic input/control layout.
- Nested parameter groups.
- Keyword-argument layout.
- Structured-value editor primitives.
- Schema-driven field rendering primitives.
- Generic Callable visual component driven entirely by props.
- Generic Dict visual component driven entirely by props.
- Loading, error, diagnostic, run-status, and output presentation primitives.

The generic Dict and Callable components are views. They do not define persistence, execution, provider, or backend semantics.

#### Pane shell

- Resizable left and right panes.
- Icon rails.
- Pane tab registration.
- Selected-section inspector routing.
- Pane visibility and width state hooks.
- Pane title and content shells.
- Floating panes or overlays where already reusable.
- Focus order and keyboard navigation.

#### Host and extension interfaces

The package can manage an in-memory workspace directly or receive persistence and domain behavior from a consuming application through a narrow host:

```ts
type SectionWorkspaceHost<SectionData, EdgeData> = {
  getSnapshot(): WorkspaceSnapshot<SectionData, EdgeData>;
  subscribe(listener: () => void): () => void;
  apply(
    transaction: WorkspaceTransaction,
  ): WorkspaceTransactionResult | Promise<WorkspaceTransactionResult>;
  dispatchPresentation(intent: WorkspacePresentationIntent): void;
};

type SectionViewDefinition<T> = {
  kind: string;
  Canvas: React.ComponentType<SectionCanvasProps<T>>;
  Inspector?: React.ComponentType<SectionInspectorProps<T>>;
};

type PaneViewDefinition = {
  id: string;
  side: "left" | "right";
  label: string;
  icon: React.ReactNode;
  Component: React.ComponentType<PaneProps>;
};
```

Canvas gestures produce the same serializable structural operations used by programmatic callers. Presentation-only intents cover behavior that should not mutate the workspace, including:

- Reveal objects.
- Focus objects.
- Select or temporarily highlight objects.
- Open a section, inspector, pane, or saved view.
- Present a structured operation approval.
- Associate visible activity with workspace objects.

The consuming application owns domain validation and persistence. The workspace package owns structural validation and deterministic application of valid structural operations.

#### Object attention and UI affinity

The package exports a compact, transport-neutral event schema for UI-session and object attention behavior:

- Optional originating frontend session identity.
- Workspace, view, section, edge, and other object references.
- Reveal, focus, highlight, select, and open intents.
- Approval presentation tied to an exact proposed transaction and expected revision.
- Activity records associated with stable workspace objects.

This is a module of `@setta/section-workspace`, not a separate SDK. The package defines event data and React handling hooks; consuming applications own WebSocket, HTTP, MCP, ACP, or other transport routing and any durable activity storage.

### What the package does not own

- Go code.
- Python code.
- An application server.
- Persistence.
- Authentication.
- A canonical application project format.
- Application domain models.
- Domain-specific validation.
- MCP connections or tools.
- Python functions.
- Agent sessions.
- Execution.
- Runs.
- Files or Git.
- A plugin manager.
- Application-specific section kinds.
- Application-specific CLI or MCP tools.

### Package exports

Prefer one public package with subpath exports rather than micro-packages:

```text
@setta/section-workspace
@setta/section-workspace/core
@setta/section-workspace/react
@setta/section-workspace/controls
@setta/section-workspace/testing
```

`core` contains the headless structural model, schemas, validation, transactions, inverses, and history. `react` contains the React Flow, dnd-kit, section, pane, and presentation bindings. These remain subpath exports from one package with one version.

The testing export includes an in-memory host, operation fixtures, interaction helpers, and conformance tests for section and pane renderers. It is not a separate public package unless it later becomes useful outside the flagship package.

### Package example

The repository includes a blank example application that:

- Stores a serializable workspace snapshot in memory.
- Registers two trivial example section kinds.
- Adds one left pane and one right inspector.
- Demonstrates selection, movement, resizing, recursive grouping, reparenting, references, variants, saved views, connections, history, and nested controls.
- Applies the same serialized operation from a UI gesture and a small programmatic example.
- Requires no backend.
- Contains no Python, MCP, or agent functionality.

The blank example proves independent usability but is not a separately branded application.

## Independent application contract

Every application built on `@setta/section-workspace` owns:

- Its domain model.
- Its canonical application file format, which may embed a workspace snapshot.
- Its persistence.
- Its backend.
- Its domain validation.
- Its application-specific section kinds.
- Its application-specific left and right panes.
- Its CLI.
- Its MCP server.
- Its execution and security model.
- Its release and tests.

An application may use the core's generic Dict or Callable views, but it supplies all values, callbacks, schemas, statuses, and outputs.

For structural changes, application UI gestures, CLI commands, and MCP tools all submit the flagship package's operation schema to the same application-owned workspace service. Domain commands may use application-specific schemas. CLI/MCP symmetry is required within an application, not across applications.

Applications may copy or port existing Setta code into their own repository. They do not expose legacy Setta internals as shared dependencies.

## Compatibility between projects

### Guaranteed compatibility

All applications use the same structural workspace and UI APIs while they support a compatible version of `@setta/section-workspace`.

This provides:

- Consistent canvas behavior.
- Consistent section framing.
- Consistent side panes.
- Consistent DnD behavior.
- Consistent structural operation, revision, transaction, and error shapes.
- Consistent object references and presentation intents.
- Reusable frontend knowledge.
- Shared accessibility and performance fixes.

### Explicitly not guaranteed

Applications do not need compatible:

- Project files.
- Section data schemas.
- Backend APIs.
- Databases.
- CLI commands.
- MCP tools.
- Domain revision models beyond the embedded workspace revision.
- Execution semantics.
- Release versions.

### Optional interoperability

Applications may communicate through standards rather than Setta-family imports:

- MCP for tool invocation.
- ACP or native agent protocols for coding agents.
- HTTP or OpenAPI.
- Files.
- Subprocess protocols.
- Import/export formats explicitly owned by one application.

For example, Agent Canvas may call an MCP server exposed by MCP Canvas, but neither application depends on the other's source package or file format.

## Python Canvas

### Concrete purpose

> Reconcile Python source with a visual function graph, configure and connect typed values, compile the graph into deterministic runnable Python, map diagnostics and tracebacks back to graph objects, and expose the same workflow through UI, CLI, and MCP.

This is the first application because it most closely matches Setta's original differentiated functionality and can reuse the most existing behavior.

The source reconciler, graph representation, compiler, and semantic source maps are internal modules of one Python Canvas project. They are not automatically separate public packages.

### User interface

#### Left pane

- Python workspaces and roots.
- Function and class catalog.
- Search.
- Files.
- Diagnostics.
- Environment and interpreter.
- Installed packages.
- Run history.
- Pending source-reconciliation plans.

#### Canvas

- Dict sections for structured values.
- Callable sections for Python functions and constructors.
- Text and Prompt sections where useful.
- Code sections.
- Terminal sections.
- Connections from values and outputs to arguments.

#### Right pane

- Function target and signature.
- Arguments and defaults.
- Type annotations.
- Passing styles.
- Ports and connections.
- Source location.
- Source-to-graph identity and reconciliation status.
- Diagnostics and documentation.
- Run configuration.
- Visual configuration.

### Backend ownership

Python Canvas owns:

- Its project file format.
- Python callable and class discovery.
- Source watching and reconciliation.
- Reviewable source-reconciliation plans before destructive graph changes.
- Identity preservation across supported callable renames and file moves.
- Basedpyright/Ty integration.
- Python interpreter resolution.
- Generated argument controls.
- A Python-Canvas-owned graph representation.
- Dependency-aware deterministic Python generation.
- Semantic source maps connecting graph objects, arguments, ports, source files, lines, and columns.
- Diagnostic and traceback mapping back to graph objects.
- Generated and bound virtual documents where retained.
- Source rename and dependency explanations where retained.
- Function execution.
- Terminals.
- Run history.
- Detached runs where retained.
- Run plans.
- Artifacts required by Python runs.
- Its CLI and MCP server.

### Example CLI

```sh
python-canvas open analysis.pycanvas.json
python-canvas functions list --json
python-canvas reconcile plan --json
python-canvas reconcile apply plan.json --json
python-canvas section add-function package.module:function --json
python-canvas section add-dict --value inputs.json --json
python-canvas connect inputs.path analyze.path --json
python-canvas compile --output generated.py --sourcemap generated.map.json
python-canvas run analyze --json
python-canvas output analyze --json
python-canvas serve
python-canvas mcp
```

### AI control

Its MCP server exposes Python Canvas concepts such as:

- List and inspect functions.
- Plan, inspect, and apply source reconciliation.
- Read the project.
- Create and update Dict/Callable sections.
- Connect values to arguments.
- Compile the graph and inspect dependency explanations.
- Read diagnostics.
- Map a diagnostic or traceback location to graph objects.
- Run a function or configured project entry.
- Read output and logs.
- Cancel a run.
- Reveal source.

It does not expose generic MCP Canvas or Agent Canvas concepts.

### Extraction approach

Prefer extraction and pruning:

- Reuse the existing Dict and Callable behavior.
- Reuse callable signature and refetch logic.
- Reuse Watch Code and LSP services.
- Reuse identity-preserving source reconciliation across supported renames and file moves.
- Reuse Python execution, terminal, code generation, virtual documents, diagnostic mapping, run plans, and tests where they fit.
- Replace frontend global-store dependencies with the section-workspace host interface and operations.
- Replace Setta-wide graph assumptions with a Python-Canvas-owned representation.
- Remove chat, app generation, plugin management, deployments, social embeds, and unrelated sections.
- Define a Python-Canvas-owned project format rather than supporting every existing Setta project.

### Python graph bridge publication rule

The source index, reconciler, graph representation, compiler, and semantic source-map code remain internal modules in this plan. A separate `python-graph-bridge` distribution is not one of the intended releases.

Reconsider that decision only if all of the following become true:

- It accepts and emits documented formats without requiring Python Canvas.
- Its library and CLI are useful from scripts, IDE integrations, or other graph tools on their own.
- It has a stable compatibility contract independent of the Python Canvas project format.
- A complete example demonstrates an independently useful workflow without Python Canvas or `@setta/section-workspace`.
- The release does not require splitting its internal modules into additional public micro-packages.

Publishing it would be a new architecture decision and would require updating this plan's dependency rules; do not create that release during the current extraction.

## MCP Canvas

### Concrete purpose

> Build a persistent visual board of MCP tools, structured inputs, connections, calls, and outputs that can also be edited through CLI or MCP.

### User interface

#### Left pane

- MCP servers.
- Connection status.
- Tool catalog and search.
- Tool schemas.
- Call history.

#### Canvas

- Dict sections.
- Text sections.
- MCP Tool sections using the core Callable view.
- Structured result sections where useful.
- Connections between value/output paths and tool arguments.

#### Right pane

- Server and tool target.
- Tool schema.
- Arguments.
- Connections.
- Invocation status.
- Structured result.
- Diagnostics and provider configuration.

### Backend ownership

MCP Canvas owns:

- Its board file format.
- MCP configuration.
- MCP connections.
- Tool discovery.
- Tool search.
- Calls, results, status, and cancellation where supported.
- Its domain revision behavior and persistence integration beyond the shared structural workspace revision.
- Its CLI.
- Its own MCP server for board automation.

It uses the official MCP SDK and existing gateways where appropriate. It does not publish a separate general-purpose gateway.

### Distinctness requirement

It must be more than MCP Inspector with nodes. The release must demonstrate:

- Persistent reusable boards.
- Connected structured values and outputs.
- Spatial organization that remains meaningful between sessions.
- Human and agent editing of the same board.
- Atomic or otherwise safe machine edits.
- A complete saved-board workflow rather than one-off tool testing.

## Agent Canvas

### Concrete purpose

> Manage coding-agent sessions, prompts, context, approvals, tool activity, and outputs on a persistent spatial board.

### User interface

#### Left pane

- Agent configurations.
- Active and previous sessions.
- Tools.
- Skills.
- Run history.
- Environment and protocol status.

#### Canvas

- Agent session sections.
- Prompt sections.
- Context/file sections.
- Artifact/output sections.
- Optional explicit coordination or handoff sections.

#### Right pane

- Agent and model configuration.
- Workspace policy.
- Permission mode.
- Session status.
- Questions and approvals.
- Tools and MCP configuration.
- Context attachments.
- Logs and event details.

### Backend ownership

Agent Canvas owns:

- Its board and session formats.
- ACP and native protocol adapters.
- Durable session state.
- Event logs.
- Questions and approvals.
- Resume and cancellation.
- Workspace policy.
- Attachments.
- Routing from agent activity to the originating UI session.
- Binding tool activity and approvals to stable workspace objects.
- Its CLI and MCP automation server.

It does not depend on MCP Canvas or Python Canvas. It may invoke external tools through MCP as a protocol.

Agent Canvas uses the flagship package's presentation intents for AI Follow behavior, object reveal/focus/highlight, and transaction approvals. It owns session routing and durable activity records; those are not separate shared services.

### Distinctness requirement

It must contribute a complete spatial session/context interaction and durable lifecycle. Merely wrapping Codex and Claude behind another normalized API is insufficient.

## Data Canvas

### Concrete purpose

> Arrange local files, spreadsheets, charts, images, and drawings on a persistent board and manipulate the board through UI, CLI, or MCP.

### Possible scope

- Workspace file browser.
- Text and media preview.
- Spreadsheet editing.
- Charts.
- Images.
- Drawing.
- Artifact import/export.
- Connections representing explicit data sources or derived views.

### Independence requirement

Data Canvas must own a coherent file and artifact model and must be useful without Python Canvas, MCP Canvas, or Agent Canvas. A loose collection of existing rich sections is not sufficient.

## Agent Signal Canvas

### Concrete purpose

> Design and run explicit signal graphs that coordinate persistent agent chats through gates, success or failure edges, custom signals, and inspectable run state.

### Possible scope

- Start, gate, chat, and end sections.
- AND, OR, and XOR gates.
- Success, failure, and custom-signal edges.
- Optional signal-payload field matching.
- Activation-count conditions.
- Continue-current-thread and create-new-thread actions.
- Stop-before-restart behavior.
- Parallel launch of eligible chat groups.
- Agent-emitted signals through its MCP server.
- Visual inspection of active edges, blocked gates, child runs, activation counts, emitted signals, and reached ends.
- Persisted run events.
- Pause, reset, stop, and replay.

### Independence requirement

Agent Signal Canvas owns its graph format, execution engine, durable chat/run state, agent adapters, CLI, and MCP server. It cannot depend on Agent Canvas, Python Canvas, or another Setta application. It may use ACP, MCP, or native agent protocols as external standards.

The existing Setta state-machine runtime is tightly coupled to chats and agents. Extracting it into an independently installable application is therefore high-cost and not an initial commitment. The release must include a complete working vertical workflow rather than merely publishing the current graph types.

## Existing code disposition

| Existing Setta functionality | Target |
|---|---|
| Structural IDs, recursive containment, references, variants, saved views, layouts, revisions, history and inverse operations | `@setta/section-workspace/core` |
| XYFlow fork, dnd-kit adapters, section chrome, controls, panes, minimap | `@setta/section-workspace/react` and `controls` |
| Dict and Callable presentation components | Generic views in `@setta/section-workspace` where backend-neutral |
| UI-affinity events, AI Follow presentation and object-attention intents | Transport-neutral schemas/hooks in `@setta/section-workspace`; durable routing in Agent Canvas |
| Python callables, signatures, Watch Code, source reconciliation, LSP, codegen, semantic source maps, terminals and runs | Python Canvas internal modules |
| MCP client/server, tool discovery, search, calls and results | MCP Canvas |
| Codex, Claude, chat, profiles, approvals, attachments and agent runs | Agent Canvas |
| Files, spreadsheet, chart, image, drawing and artifacts | Data Canvas candidate |
| State-machine start/gate/chat/end sections, edges, signals and runtime | Agent Signal Canvas candidate |
| Prompt templates | Python Canvas or Agent Canvas internal feature as appropriate; not a separate package |
| Task board | No release unless it becomes part of a coherent independent application |
| Reactive Python workspace client behavior | An application-owned SDK only when an independently released application owns the matching server protocol; no standalone client project |
| Section packs | Examples or application-owned modules; no public pack family without independent usability |
| JSON App Runtime | No release in this family; use or contribute to existing standards if needed |
| MCP Gateway | No separate release |
| Deployment/share host | No initial release |
| Launcher | Retire |
| Current plugin system | Do not port |
| Existing project format | No cross-application compatibility requirement |
| Incomplete or unsupported modes | Retire |

## Repository strategy

### Flagship repository

One repository publishes one npm package with subpath exports:

```text
section-workspace/
├── src/
│   ├── core/
│   │   ├── model/
│   │   ├── operations/
│   │   ├── validation/
│   │   ├── history/
│   │   └── attention/
│   ├── react/
│   │   ├── canvas/
│   │   ├── sections/
│   │   └── panes/
│   ├── dnd/
│   ├── controls/
│   └── testing/
├── examples/
│   └── blank-section-workspace/
└── package.json
```

Do not publish `core`, React Flow, dnd-kit, panes, controls, object attention, or testing as separately versioned packages. They are implementation boundaries and subpath exports of one coherent product.

The standalone/offline React requirement is the reason the extracted structural engine is TypeScript-owned. During work in the current Setta repository, Go remains authoritative until a behavior is deliberately moved into the extracted package. Do not maintain competing Go and TypeScript implementations. Any application that needs server-side structural mutation must invoke the same package implementation or follow a separately approved generated-contract design rather than hand-copying the algorithms.

### Application repositories

Each application receives its own repository only when work begins on that extraction:

```text
python-canvas/
mcp-canvas/
agent-canvas/
data-canvas/
agent-signal-canvas/
```

A repository may contain multiple internal Go, Python, or frontend packages for testability. Those internal packages are not necessarily public releases.

Python Canvas may initially contain internal directories such as `source-index`, `source-reconcile`, `graph-model`, `python-compiler`, and `semantic-sourcemap`. Internal separation does not imply separate publication.

## Testing strategy

### Section Workspace

- Render with an in-memory host and no backend.
- Serialize and deserialize workspace snapshots and every public operation.
- Reject stale expected revisions with structured conflicts.
- Verify dry-run planning does not mutate state.
- Verify failed transactions are atomic.
- Verify applying an operation and its inverse restores the original structural state.
- Selection and multi-selection.
- Move, resize, recursively group, ungroup, and connect.
- Coordinate-safe reparenting between canvas, group, and nested-section spaces.
- References, variants, saved views, independent layouts, and history.
- Zoom-aware DnD.
- Nested control sorting.
- Left/right pane registration and resizing.
- Inspector routing.
- Object reveal, focus, highlight, approval, and originating-session intents.
- Keyboard navigation and accessibility.
- Large-canvas performance.
- Host subscription cleanup.
- Consumer example built outside package internals.
- Import-boundary tests preventing application dependencies.

### Every independent application

- Clean installation with only `@setta/section-workspace` as a Setta-family dependency.
- Temporary workspaces.
- Production backend paths rather than mocks for application integration.
- UI, CLI, and MCP parity for structural operations.
- Application-specific CLI/MCP parity for meaningful domain operations.
- Application-specific file round trips.
- Application-specific security boundaries.
- Browser verification of the complete UI.
- No imports from sibling applications.
- No reliance on sibling services.
- License and attribution verification.

## Extraction sequence

### Phase 0: Structural boundary spike

Prove the flagship can own reusable structural behavior without importing application state:

- Extract a minimal serializable workspace snapshot with stable IDs, recursive containment, edges, references, variants, and one saved view.
- Apply revision-checked create, move, reparent, group, ungroup, connect, and view operations through the headless API.
- Generate and apply inverse operations.
- Render the resulting workspace with an in-memory host.
- Render generic Dict and Callable views through props.
- Open both side panes.
- Select, move, resize, reparent, connect, undo, and reorder nested controls.
- Invoke one identical serialized operation through a UI gesture and a programmatic caller.
- Demonstrate object reveal, focus, and highlight intents without an application transport.
- Build the blank example outside the current Setta frontend aliases.
- Audit XYFlow and asset licensing.

Readiness gate: the package builds and runs without any Go server, Setta project state, MCP, Python, or agent code; it preserves coordinate correctness, transaction atomicity, and undo for the spike operations.

### Phase 1: Section Workspace release

- Extract and document the headless structural and React APIs.
- Complete the operation, validation, transaction, revision, history, reference, variant, saved-view, and layout contracts.
- Add testing exports.
- Add the blank example.
- Preserve interaction quality, accessibility, and large-DOM performance.
- Publish `@setta/section-workspace` as one package with subpath exports.

### Phase 2: Python Canvas extraction

- Build Python Canvas on the published section-workspace API.
- Port and prune Python-specific backend and frontend behavior.
- Extract internal source-index, reconciliation, graph-model, compiler, and semantic-source-map modules.
- Demonstrate identity-preserving source changes and traceback-to-graph mapping.
- Add Python Canvas CLI and MCP control.
- Remove unrelated Setta features and dependencies.
- Verify clean installation and independent tests.
- Release Python Canvas.

### Independent later tracks

Evaluate MCP Canvas, Agent Canvas, Data Canvas, and Agent Signal Canvas separately. They do not form sequential layers and none is required by another.

For each track:

1. Define its complete one-sentence purpose.
2. Identify the existing code that belongs exclusively to it.
3. Build a vertical slice using only `@setta/section-workspace` from the Setta OSS family.
4. Compare it with existing OSS to ensure it is not merely identical.
5. Verify independent installation, CLI/MCP operation, tests, security, and licensing.
6. Release it or do not release it based on technical merit and completeness.

## Definition of done

### Section Workspace

- Installs into an unrelated React application.
- Renders with an in-memory host.
- Has no dependency on Setta backends or applications.
- Provides a serializable structural snapshot with stable IDs, recursive containment, edges, references, variants, and saved views.
- Provides deterministic revision-checked operations, dry-run planning, structured errors, atomic transactions, inverses, and history.
- Exposes stable section and pane composition APIs.
- Preserves coordinate-safe canvas, DnD, grouping, reparenting, section, and pane behavior.
- Exposes transport-neutral object-attention and approval-presentation intents.
- Includes accessibility and performance verification.
- Includes license and attribution material.
- Includes a complete blank example.

### Independent application

- Can be installed without sibling applications.
- Has a concrete purpose and complete primary workflow.
- Uses only `@setta/section-workspace` from the Setta OSS family.
- Owns its backend, storage, file format, CLI, MCP server, tests, and security.
- Does not require another application's runtime.
- Is not a thin duplicate of existing OSS.
- Uses existing Setta code through extraction and pruning where practical.
- Documents exactly what is retained, omitted, and newly implemented.

## Non-goals

- One universal Setta application or domain kernel.
- A separately released agent-operable workspace kernel.
- A separately released UI-affinity SDK.
- A separately released reactive workspace client without an independently useful server contract.
- Public section-pack families whose members are not independently useful.
- A shared backend across applications.
- A shared project file format.
- Cross-application internal imports.
- Publishing every internal module.
- Publishing every existing section.
- Creating packages solely to increase package count.
- Preserving the current plugin manager.
- Maintaining compatibility with existing Setta projects.
- Releasing a generic MCP gateway.
- Defining a new JSON UI standard.
- Using popularity or demand as a release criterion.

## Success criteria

- `@setta/section-workspace` is genuinely usable by an unrelated React application without a backend.
- The flagship preserves Setta's structural workspace behavior rather than reducing it to presentation components.
- Python Canvas is a complete independent application rather than a thin demo.
- Python Canvas reconciles source and graph identities and maps generated-code failures back to graph objects.
- Applications share visual quality without sharing backend coupling.
- Each released application can be removed without breaking any sibling.
- Every application owns its CLI and MCP interface.
- Existing Setta functionality has a clear independent destination or an explicit decision not to release it.
- Additional applications are released only when technically distinct, complete, maintainable, secure, tested, accessible, and correctly licensed.
