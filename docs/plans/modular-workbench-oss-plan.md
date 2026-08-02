# Modular Open-Source Workbench Plan

## Objective

Salvage Setta's strongest and most differentiated work as a coherent open-source ecosystem rather than publishing the current monolith or scattering every feature into an unrelated repository.

The XYFlow, dnd-kit, section-design, and side-pane frontend become the shared Workbench platform. The remaining functionality is split into small, independently testable section packages, pane packages, capability providers, and standalone headless services. Every important operation must be controllable through both CLI and MCP, with the browser acting as a high-quality human frontend over the same canonical behavior.

The base must be a small workbench kernel, not merely a collection of React components and not a renamed copy of the current Setta application.

## Scope and terminology

This plan does not propose only two open-source projects. It distinguishes four different release units:

| Term | Meaning in this plan |
|---|---|
| Application/service | An independently useful installable product, such as Workbench, Agentd, App Runtime, or MCP Gateway |
| Repository | A maintenance and release boundary; several packages may initially share one repository |
| Package | An independently testable and publishable section, pane, provider, SDK, or backend library |
| Distribution | A preconfigured application assembled from packages, such as Blank Workbench or MCP Workbench |

The intended mature ecosystem is:

```text
Setta OSS Ecosystem
│
├── Workbench
│   ├── Canonical document kernel
│   ├── XYFlow + dnd-kit canvas
│   ├── Section chrome and control kit
│   ├── Left/right pane shell
│   ├── Extension SDK
│   ├── Persistence and realtime updates
│   ├── Generic CLI and MCP control
│   ├── Section and pane packages
│   └── Provider adapters
│
├── Agentd
│   ├── Codex adapter
│   └── Claude Code adapter
│
├── JSON App Runtime
│   ├── App specification
│   ├── Component catalog
│   └── Renderer and action runtime
│
├── MCP Gateway
│   ├── Multi-transport client/router
│   └── Aggregating CLI/server
│
└── Optional standalone services
    ├── Python runtime and Watch Code
    ├── Terminal/run service
    ├── Deployment host
    └── Transcription service
```

The first Workbench repository may produce two initial distributions, Blank Workbench and MCP Workbench, while still publishing many packages. Additional applications and services become separate repositories only after their contracts are stable.

## Base OSS project

The base project could be called something like `setta-workbench` or `setta-canvas`.

It should own only:

### Document kernel

- Sections with stable IDs.
- Section kind and schema-validated data.
- Position, size, minimized/locked state.
- Ports and edges.
- Selection.
- Viewport.
- Groups/nesting.
- Undo/redo.
- Atomic document patches.
- Local file persistence.
- Realtime document events.
- Revisions for conflict detection.

Semantic state and presentation state should remain separate.

### UI shell

- Vendored/adapted XYFlow canvas.
- dnd-kit integration.
- Zoom-aware dragging and collision handling.
- Section selection and multi-selection.
- Copy/paste.
- Resizing and grouping.
- Minimap and canvas controls.
- Section header/chrome.
- Generic parameter control components.
- Resizable left and right panes.
- Pane icon rails.
- Command palette and keyboard shortcuts.
- Light/dark appearance.

### Extension SDK

Only three extension types are initially necessary:

1. Section extensions.
2. Pane extensions.
3. Capability providers.

Avoid carrying over the current broad plugin system.

## Section extensions

A section package owns its data schema, canvas renderer, inspector, ports, and validation:

```ts
type SectionExtension<T> = {
  kind: string;
  schema: JSONSchema;
  createDefault(): T;
  validate(value: T): Diagnostic[];
  getPorts(value: T): PortDefinition[];
  Canvas: React.ComponentType<SectionCanvasProps<T>>;
  Inspector?: React.ComponentType<SectionInspectorProps<T>>;
};
```

Examples:

- `section-dict`
- `section-callable`
- `section-text`
- `section-terminal`
- `section-prompt`
- `section-chat`
- `section-file`
- `section-image`
- `section-spreadsheet`
- `section-taskboard`
- `section-drawing`

An extension receives a narrow host API. It must not import the global store or mutate unrelated sections directly:

```ts
type SectionHost = {
  getSection(id: string): SectionDocument;
  patchSection(id: string, patch: JSONPatch[]): Promise<void>;
  getConnectedInputs(id: string): ValueBinding[];
  dispatch(command: WorkbenchCommand): Promise<CommandResult>;
  subscribe(listener: DocumentListener): () => void;
};
```

## Pane extensions

Pane packages contribute tabs to the left or right side:

```ts
type PaneExtension = {
  id: string;
  side: "left" | "right";
  label: string;
  icon: ReactNode;
  Component: React.ComponentType<PaneHostProps>;
};
```

Examples for the left pane:

- MCP servers and tool catalog.
- Workspace files.
- Run history.
- Agent sessions.
- Git.
- Artifacts.
- Extension catalog.

Examples for the right pane:

- Section inspector.
- Parameter configuration.
- Documentation/quick info.
- Named presets.
- Diagnostics.
- Edge inspector.

The bundled right inspector can dynamically host the inspector contributed by the selected section kind.

## Capability providers

Backend functionality should be separated from its visual section.

For example, “callable” should not mean “Python function.” A callable section consumes a generic capability:

```text
CallableProvider
├── list callables
├── search callables
├── get input/output schema
├── invoke
├── cancel
└── stream events
```

Independent providers could implement it:

- MCP tools.
- Local Python functions.
- HTTP endpoints.
- Shell commands.
- Coding agents.
- Remote Setta instances.

Other useful capabilities would be:

```text
ValueProvider
ArtifactProvider
RunnableProvider
ConversationProvider
FilesystemProvider
DiagnosticsProvider
TranscriptionProvider
LanguageServerProvider
TerminalProvider
DeploymentProvider
```

This avoids direct dependencies between frontend extensions.

For example:

```text
section-callable ──uses──> CallableProvider
                              ├── provider-mcp
                              ├── provider-python
                              ├── provider-http
                              └── provider-shell

section-chat ──────uses──> ConversationProvider
                              ├── provider-codex
                              ├── provider-claude
                              └── provider-managed-llm
```

The callable canvas design remains the same regardless of what supplies the callable.

## Generic AI control belongs in the base

The base MCP server should be schema-driven, so new section extensions automatically become controllable by agents.

Core MCP tools:

- `get_workbench`
- `list_sections`
- `get_section`
- `list_section_kinds`
- `get_section_kind_schema`
- `create_section`
- `patch_section`
- `delete_section`
- `move_section`
- `resize_section`
- `connect_sections`
- `disconnect_sections`
- `list_edges`
- `set_viewport`
- `auto_layout`
- `validate_workbench`
- `apply_workbench_patch`

The CLI should expose equivalent commands with stable JSON output:

```sh
workbench sections --json
workbench section add dict --data value.json
workbench section patch SECTION_ID --patch patch.json
workbench connect SOURCE_ID.output TARGET_ID.input
workbench layout --algorithm layered
workbench validate
workbench serve
```

Extension-specific commands can be registered separately:

```sh
workbench callable search filesystem
workbench callable invoke SECTION_ID
workbench terminal input SECTION_ID "pytest\n"
workbench chat send SECTION_ID "Review this result"
```

The generic document tools mean an agent can control newly installed section types without the base server hard-coding every type.

## Suggested package organization

Initially, keep this in one monorepo with independently testable and publishable packages:

```text
workbench/
├── cmd/
│   └── workbench/
├── internal/
│   ├── document/
│   ├── persistence/
│   ├── commands/
│   ├── mcpserver/
│   ├── websocket/
│   └── extensions/
├── packages/
│   ├── ui-shell/
│   ├── extension-sdk/
│   ├── section-kit/
│   ├── section-dict/
│   ├── section-callable/
│   ├── section-text/
│   ├── section-terminal/
│   ├── section-prompt/
│   ├── provider-mcp/
│   ├── provider-python/
│   └── test-harness/
└── apps/
    ├── blank-workbench/
    └── mcp-workbench/
```

Publishable artifacts might be:

- Go `workbench` binary.
- `@setta/workbench-react`
- `@setta/workbench-extension-sdk`
- `@setta/workbench-test-harness`
- `@setta/section-kit`
- `@setta/section-dict`
- `@setta/section-callable`
- `@setta/section-text`
- `@setta/section-terminal`
- `@setta/provider-mcp`
- `@setta/provider-python`

Do not begin with a separate Git repository for every section. Package isolation inside one repository gives cheap atomic changes and unified CI. Split repositories only when packages have genuinely independent maintainers or release cycles.

## Complete salvage map

| Existing functionality | New release unit | Form | Priority |
|---|---|---|---|
| XYFlow fork, dnd-kit integration, viewport, minimap, selection, copy/paste, grouping | Workbench core | UI package | Foundation |
| Left Overview pane, right inspector pane, pane rails and resizing | Workbench core | UI package | Foundation |
| Section header, sizing, selection, controls and parameter nesting | Section kit | UI package | Foundation |
| Canonical document, edges, ports, revisions, persistence, undo/redo | Workbench kernel | Go packages and generated contracts | Foundation |
| Generic document CLI/MCP tools and realtime updates | Workbench kernel | Binary/server | Foundation |
| Dict, group and structured-value sections | `section-dict` | Section package | Foundation |
| Callable section and schema-generated argument controls | `section-callable` | Section package | Foundation |
| Text and Markdown blocks | `section-text` | Section package | Foundation |
| MCP client, namespacing, search, status and invocation | MCP provider and MCP Gateway | Provider package plus standalone service | Foundation |
| Python signature parsing, Watch Code, interpreter detection and packages | Python provider/service | Provider package plus optional standalone CLI | Developer extensions |
| Basedpyright and Ty language-server integration | Language-server providers | Provider packages | Developer extensions |
| Terminal/PTTY, reconnect, resize and process state | Terminal section/service | Section package plus provider | Developer extensions |
| Runs, detached jobs, logs, cancellation and run plans | Run service | Provider package or standalone service | Developer extensions |
| Workspace files, preview, safe writes and path reveal | Filesystem provider and pane | Provider plus pane package | Developer extensions |
| Read-only Git status, diff, log and graph | Git provider and pane | Provider plus pane package | Developer extensions |
| Binary and artifact storage | Artifact provider | Backend package | Developer extensions |
| Jinja prompts and reusable prompt templates | Prompt section/provider | Section plus provider package | Developer extensions |
| Claude Code and Codex sessions | Agentd | Standalone service plus Workbench provider | Agent ecosystem |
| Managed OpenAI, Anthropic, Gemini and Azure chat | Managed LLM providers | Provider packages | Agent ecosystem |
| Chat UI, branches, attachments, search and streaming events | Chat section | Section package | Agent ecosystem |
| Agent profiles and tool allowlists | Agent configuration provider | Provider package | Agent ecosystem |
| Voice dictation and OpenAI transcription | Transcription provider/service | Provider package, optionally a service | Agent ecosystem |
| State-machine nodes, gates, signals and run tracking | Workflow extension | Section/pane packages consuming `RunnableProvider` | Workflows |
| Spreadsheet editor | `section-spreadsheet` | Section package | Rich sections |
| Task board and recurrence | `section-taskboard` | Section package | Rich sections |
| Drawing canvas and artifacts | `section-drawing` | Section package | Rich sections |
| Charts and images | Chart/image sections | Section packages | Rich sections |
| Browser/file preview section | Browser section | Section package | Rich sections |
| IFrame and social embeds | Embed sections | Section packages | Rich sections |
| JSON-rendered app specification, catalog, actions and themes | JSON App Runtime | Standalone application plus preview integration | Applications |
| Versioned share/app snapshots and visitor isolation | Deployment host | Standalone service | Publishing |
| Local/remote workspace launcher | Separate launcher or retirement | Standalone application only if demand exists | Defer |
| Current broad plugin manager | Do not port initially | Replace with ordinary packages and narrow extension contracts | Retire/defer |
| Existing Setta project schema | Do not make public | New Workbench document instead | Retire |

Not every feature should become a separately branded repository. A feature becomes:

- A standalone application or service when it has a useful CLI/MCP story without Workbench.
- A publishable package when it is independently testable and installable but relies on Workbench as its frontend.
- An internal implementation detail when it has no stable external contract.
- A retirement candidate when its maintenance cost exceeds its standalone value.

## Standalone OSS applications and services

### Workbench

Workbench is the primary visual platform and the first release. It owns the document kernel, canvas, side panes, extension contracts, generic CLI/MCP editing and reference distributions. Its identity is a spatial workbench jointly editable by humans and agents, not a compatibility edition of the current Setta IDE.

### Agentd

Agentd is an independently useful daemon for starting, observing and controlling Codex and Claude Code sessions. It owns:

- Workspace policies.
- Session persistence.
- Normalized text, thinking, tool, approval and question events.
- Continue/resume behavior.
- Questions and approval responses.
- Cancellation and completion status.
- Environment and runtime preflight.
- CLI and MCP control.

Workbench consumes Agentd through `ConversationProvider`, `CallableProvider` and an optional agent-session pane. Agentd must remain usable from scripts, CI and other MCP clients without Workbench.

### JSON App Runtime

The App Runtime is an independently useful local server for AI-authored JSON applications. It owns:

- Versioned app specifications.
- Component schemas and catalog discovery.
- Validation and diagnostics.
- Atomic replacement and live patching.
- Responsive layout, themes and motion.
- Data bindings and MCP-backed actions.
- Assets and local serving.
- CLI and MCP editing.

Workbench may embed it as a preview pane, but the runtime must also operate independently.

### MCP Gateway

The MCP Gateway extracts the generally useful part of the current MCP implementation:

- Stdio, SSE and streamable HTTP transports.
- Multi-server configuration.
- Environment and header interpolation.
- Tool namespacing and discovery.
- Tool search and context reduction.
- Connection health, retries and reconnection.
- Structured calls and machine-readable diagnostics.
- Aggregated MCP serving and stdio/HTTP bridging.

Workbench, Agentd and App Runtime may use the gateway, but it remains a standalone CLI/server and Go package.

### Optional Python runtime

The Python runtime can combine callable discovery, Watch Code, language-server integration and process invocation behind a narrow `CallableProvider` and `DiagnosticsProvider`. It should expose a headless CLI/MCP surface and a Workbench adapter. It becomes a standalone service only if that headless workflow is compelling without Workbench.

### Optional terminal/run service

The existing PTY and run machinery can become a cross-platform process service with terminal attachment, detached runs, status, logs and cancellation. The terminal section is only its frontend.

### Optional deployment host

The deployment host can publish immutable Workbench or App Runtime snapshots with explicit policies and per-visitor isolation. It should be deferred until the new document and artifact contracts are stable.

## Component families

### Foundation packages

- Workbench document kernel.
- Generated frontend contracts.
- React UI shell.
- Extension SDK.
- Extension test harness.
- Section kit and generic controls.
- Dict, callable and text sections.
- MCP provider.

### Developer packages

- Python provider.
- Language-server providers.
- Terminal section and provider.
- Filesystem pane/provider.
- Git pane/provider.
- Artifact provider.
- Prompt section/provider.
- Run history pane.

### Agent packages

- Chat section.
- Agent-session pane.
- Managed LLM providers.
- Agentd provider.
- Agent configuration pane.
- Attachment provider.
- Transcription provider.

### Workflow and rich-section packages

- Workflow start/gate/end sections.
- Workflow edge inspector.
- Spreadsheet.
- Task board.
- Drawing.
- Chart.
- Image and media.
- Browser preview.
- Embed sections.

## Testing model

This architecture makes components testable without booting all of Setta.

### Core tests

- Document commands and invariants.
- Edge and port validation.
- Atomic patches.
- Undo/redo.
- Selection and layout.
- Persistence.
- MCP command parity.
- Websocket ordering.
- XYFlow/dnd-kit coordinate and collision behavior.

### Extension tests

Each extension gets a small test host:

```ts
const host = createExtensionTestHost({
  sections: [...],
  capabilities: {
    callable: fakeCallableProvider,
  },
});

render(<CallableSection host={host} sectionId="callable-1" />);
```

The harness can verify:

- Schema validity.
- Rendering.
- Inspector behavior.
- Commands dispatched.
- Port generation.
- Accessibility.
- Large-document performance.
- No access outside the extension’s section.
- Capability-provider conformance.

### Provider tests

Providers implement shared conformance suites:

```go
func TestCallableProviderContract(t *testing.T, provider CallableProvider)
```

The same suite can test MCP, Python, HTTP, and shell implementations.

Only a small number of browser tests should cover the integrated blank workbench and reference MCP workbench.

### Standalone service tests

Each standalone service must have:

- CLI/MCP parity tests for the same operation.
- Protocol fixture tests that do not require live provider credentials.
- Temporary-workspace integration tests.
- Event ordering, cancellation and restart tests.
- Path-scope and permission tests.
- Clean-install smoke tests with no Setta installation present.

Live provider tests may exist as explicit opt-in verification, but ordinary correctness must not depend on external accounts.

## Important constraints

This succeeds only if the new base avoids importing the current architecture’s complexity:

- No dependency on `projectstate`.
- No existing project-file compatibility requirement.
- No section-specific behavior in the core.
- No extensions reading singleton Zustand stores.
- No arbitrary access to other extensions’ internal data.
- No dynamic backend plugin workers initially.
- No enormous frontend SDK containing every application helper.
- No UI-only operations that lack CLI/MCP equivalents.
- No requirement to install Python just to open a blank canvas.

The XYFlow fork should sit behind a small adapter boundary. Preserve its license and attribution, and make it possible to rebase or replace later without changing extension APIs.

## Recommended distributions

The same base could ship in two forms:

### Blank Workbench

For developers:

- Canvas.
- Side panes.
- Dict and text sections.
- Extension registration.
- Local persistence.
- CLI/MCP document editing.
- Starter templates.

### MCP Workbench

For end users:

- Everything in Blank Workbench.
- Callable sections.
- MCP server catalog.
- Schema-generated controls.
- Tool invocation and outputs.
- Run history.
- Named argument presets.

The blank slate establishes the platform. The MCP Workbench proves that it is useful.

### Later reference distributions

The same packages can produce additional focused distributions without forking the Workbench implementation:

#### Python Workbench

- Dict, callable, text, terminal and prompt sections.
- Python and language-server providers.
- Watch Code.
- Files, Git, diagnostics and run history panes.

#### Agent Workbench

- Chat and callable sections.
- Agentd and managed LLM providers.
- Agent sessions, tools, approvals and run history panes.
- Prompt, artifact and transcription extensions.

#### Data Workbench

- Dict, file, spreadsheet, chart, image and drawing sections.
- Filesystem and artifact providers.
- Optional callable providers for transformations.

These are product configurations of one platform, not new implementations of the canvas.

## AI and CLI control requirements

Every application, service and extension must treat AI control as a first-class interface rather than an added checkbox:

- Every meaningful UI mutation has a CLI and MCP equivalent.
- CLI commands provide stable structured output and meaningful exit codes.
- MCP results use structured content and versioned schemas.
- Objects have stable IDs that do not depend on canvas position or display names.
- Mutations support validation before commit.
- Concurrent mutations use document revisions or compare-and-swap semantics.
- Agents can apply atomic batch patches instead of leaving invalid intermediate states.
- Long-running operations expose status, events and cancellation.
- Capabilities, section schemas and callable schemas are discoverable.
- Destructive operations resolve and report exact targets.
- No essential operation exists only as an opaque drag gesture or frontend callback.

## Security requirements

- Network listeners bind to loopback by default.
- Remote access requires authentication.
- Filesystem providers are restricted to explicit workspace roots.
- Shell and Python execution require explicit provider installation and policy.
- Agent approvals and questions are represented as typed events.
- Secrets are stored outside ordinary Workbench documents and are never returned through generic document tools.
- External links, downloads and arbitrary HTTP access are explicit capabilities.
- Extensions cannot read or mutate unrelated section state without declared host capabilities.
- MCP tool metadata identifies read-only, mutating and destructive operations.

## Repository and publishing strategy

### Initial repository boundaries

Start with one Workbench monorepo containing the kernel, UI shell, extension SDK, test harness, first-party section packages and reference distributions. This supports atomic changes while the contracts are still evolving.

Agentd, JSON App Runtime and MCP Gateway may begin in the same development workspace, but each must build and test without importing Workbench internals. Move them to separate repositories once their public contracts stabilize and they have an independent release cadence.

Do not create a separate repository for every section. Publish sections and providers as packages from the Workbench monorepo unless they have independent maintainers or a substantial non-Workbench user base.

### Contract ownership

- Go owns the canonical Workbench document, command, event and provider contracts.
- TypeScript and Python surfaces are generated from the owner-defined contracts where needed.
- Frontend-only presentation state remains TypeScript-owned and must not leak into semantic backend contracts.
- Cross-project integration uses versioned protocols, preferably MCP or generated HTTP/event contracts, rather than shared internal models.
- Avoid a broad common package that gradually recreates the monolith.

### Publishable output

The ecosystem may eventually include four primary repositories, several installable binaries and fifteen or more independently published packages. Repository count is not the measure of how much functionality was salvaged; coherent contracts, independent testing and useful installation units are.

## Extraction strategy

### 1. Establish the new boundary

- Create the new Workbench document and command model without importing `projectstate`.
- Add import-boundary enforcement preventing new packages from reaching Setta internals.
- Capture representative visual and interaction behavior from the existing canvas as extraction fixtures.
- Audit the XYFlow fork, dnd-kit dependencies, fonts, icons and other assets for license and attribution requirements.
- Define extension and provider conformance tests before porting feature implementations.

### 2. Extract the UI shell

- Isolate the XYFlow fork behind a Workbench canvas adapter.
- Isolate the dnd-kit integration behind drag, drop, collision and coordinate APIs.
- Replace direct global Zustand reads with an injected Workbench host/store interface.
- Extract pane containers, icon rails, section chrome, selection, resizing, minimap and shortcuts.
- Preserve visual behavior while deleting Setta-specific chat, plugin, deployment and project-state dependencies.

### 3. Build the document kernel and generic control plane

- Implement canonical document persistence, validation, revisions and atomic commands in Go.
- Generate required frontend contracts.
- Add websocket document events.
- Expose generic CLI and MCP document operations.
- Verify that a blank Workbench can be installed and run without Python or legacy Setta state.

### 4. Port one vertical slice

Port dict, callable and MCP functionality as the first complete slice:

- Dict section and inspector.
- Callable section and schema-derived controls.
- MCP provider.
- MCP server/tool pane.
- Invocation, output and run-history behavior.
- Live synchronization of CLI/MCP edits into the canvas.

This slice becomes MCP Workbench and validates the extension architecture.

### 5. Port components independently

Each subsequent feature is ported as a new package against public Workbench contracts. Do not move a component until it can be tested without starting legacy Setta. Delete or leave behind obsolete coupling rather than adding a permanent compatibility layer.

### 6. Extract standalone services

For Agentd, App Runtime and MCP Gateway:

- First define their independent domain and protocol.
- Replace Setta dependencies with narrow interfaces.
- Add standalone CLI/MCP acceptance tests.
- Make legacy Setta or Workbench consume the new service only after it operates independently.
- Publish separately when the service has its own users and release lifecycle.

### 7. Retire the legacy host deliberately

Legacy Setta may remain a behavioral reference and temporary integration host during extraction. It must not become a runtime dependency of the new projects. Once valuable components have moved, choose explicitly whether to archive the remaining monolith, publish it as experimental software, or retain a minimal compatibility-free maintenance branch.

## Release sequence and readiness gates

### Phase 0: Boundary and audit

Deliverables:

- New repository/package skeleton.
- Canonical document proposal.
- Extension and provider interfaces.
- Import-boundary enforcement.
- License and asset audit.
- Canvas interaction baseline.

Readiness gate: the new core has no imports from legacy Setta application packages.

### Phase 1: Workbench foundation

Deliverables:

- Canvas, side panes and section kit.
- Document kernel and persistence.
- CLI/MCP document operations.
- Dict and text sections.
- Blank Workbench distribution.

Readiness gate: a clean installation can create, edit, persist and reopen a document through UI, CLI and MCP.

### Phase 2: MCP and developer extensions

Deliverables:

- Callable section.
- MCP provider and tool pane.
- MCP Workbench distribution.
- Python/Watch Code and language-server providers.
- Terminal, filesystem, Git, artifact and prompt packages.

Readiness gate: MCP Workbench provides an end-to-end human/agent workflow, and each extension passes the shared test harness independently.

### Phase 3: Agent ecosystem

Deliverables:

- Agentd with Codex and Claude Code adapters.
- Chat section and agent-session pane.
- Managed LLM providers.
- Attachments and transcription provider.
- Agent Workbench distribution.

Readiness gate: an external MCP client can start, observe, answer, approve, resume and cancel an agent session without Workbench.

### Phase 4: Workflows and rich sections

Deliverables:

- Workflow/state-machine extension.
- Run service and run plans.
- Spreadsheet, task-board, drawing, chart, image, browser and embed sections.
- Data Workbench distribution.

Readiness gate: workflow packages operate only through declared capabilities and rich sections remain independently testable.

### Phase 5: Applications and publishing

Deliverables:

- JSON App Runtime.
- Workbench app-preview integration.
- Optional deployment host.
- Versioned snapshot and artifact protocols.

Readiness gate: App Runtime and deployment host can be installed, controlled and tested without legacy Setta.

## Definition of done for a salvaged component

A component is not considered salvaged merely because its files were moved. It must:

- Build without legacy Setta application imports.
- Have a narrow documented public contract.
- Be testable without booting the full Workbench unless it is the Workbench shell itself.
- Include conformance or integration tests appropriate to its extension/provider type.
- Expose all meaningful operations through CLI/MCP when it has backend behavior.
- Use generated or owner-defined contracts rather than copied type mirrors.
- Include a minimal example or fixture demonstrating independent value.
- Declare license, attribution and security expectations.
- Have an explicit owner and release path.

## Prioritization and retirement rules

Prioritize functionality that has at least one of:

- A distinctive user experience.
- A clean current code seam.
- Independent CLI/MCP value.
- Reuse across several applications.
- Strong test coverage that can anchor extraction.

Defer or retire functionality that:

- Exists only as incomplete UI scaffolding.
- Has no coherent use outside the legacy project model.
- Duplicates a mature external project without meaningful differentiation.
- Requires preserving the existing Setta project format.
- Would force the broad plugin system into the new kernel.
- Cannot justify an ongoing maintainer.

Likely initial retirement or deferral candidates are the current plugin manager, legacy launcher behavior, compatibility with existing project files, unsupported run modes and incomplete configuration surfaces. Their useful underlying pieces can still be ported if a later package demonstrates demand.

## Success criteria

The plan succeeds when:

- The Workbench UI retains the distinctive canvas, section and side-pane experience.
- A developer can build a custom section without importing Workbench internals.
- An AI can discover and control the same document operations available to a human.
- MCP Workbench is useful on its own with no Python installation.
- Agentd, App Runtime and MCP Gateway are independently installable and useful.
- Major Setta functionality has an explicit package, service, defer or retire destination.
- New packages can be tested without starting the legacy monolith.
- The number of repositories remains manageable even as the number of reusable packages grows.

This is a more coherent open-source shape than either publishing the current monolith or splitting all of Setta into unrelated repositories: one recognizable UI platform, several independently useful headless services, and many small, independently testable vertical components built on explicit contracts.
