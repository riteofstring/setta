# Modular Open-Source Workbench Plan

The XYFlow, dnd-kit, section-design, and side-pane frontend can be the base open-source project, with the remaining functionality split into small, independently testable components that use the workbench as their frontend.

The base needs to be a small workbench kernel, not merely a collection of React components.

The model should be:

```text
Workbench Core
├── Canonical document model
├── XYFlow + dnd-kit canvas
├── Section chrome and control kit
├── Left/right pane shell
├── Extension SDK
├── Persistence and realtime updates
└── Generic CLI and MCP control
        │
        ├── Section extensions
        ├── Pane extensions
        └── Capability providers
```

A new installation could be a blank slate with JSON/text sections, while a bundled reference distribution adds dicts, callables, and MCP tools.

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
│   └── provider-mcp/
└── apps/
    ├── blank-workbench/
    └── mcp-workbench/
```

Publishable artifacts might be:

- Go `workbench` binary.
- `@setta/workbench-react`
- `@setta/workbench-extension-sdk`
- `@setta/section-dict`
- `@setta/section-callable`
- `@setta/provider-mcp`

Do not begin with a separate Git repository for every section. Package isolation inside one repository gives cheap atomic changes and unified CI. Split repositories only when packages have genuinely independent maintainers or release cycles.

## How existing functionality maps

| Existing functionality | New home |
|---|---|
| XYFlow/dnd-kit/panes | Workbench core |
| Section header, sizing, selection | Section kit |
| Dict section | `section-dict` |
| Callable section | `section-callable` |
| MCP client/router | `provider-mcp` |
| Python signatures and Watch Code | `provider-python` |
| Terminal/PTTY | `section-terminal` plus terminal provider |
| Prompt templates | `section-prompt` |
| Managed and external chat | `section-chat` plus conversation providers |
| Codex/Claude runtime | Independent agent provider/daemon |
| Files and Git | Pane/section extensions |
| Artifacts | Artifact provider |
| Spreadsheet/task board/drawing | Independent section extensions |
| State machines | Workflow extension consuming `RunnableProvider` |
| JSON-rendered apps | Separate application or preview pane extension |
| Deployment | Separate host service |
| Launcher | Separate application or retired |
| Current plugin manager | Do not port initially |

Not every feature should become a section. Deployment, authentication, launchers, and coding-agent daemons are services or applications that can integrate with the workbench.

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

This is a more coherent open-source shape than splitting all of Setta into unrelated repositories: one recognizable UI kernel, a small extension contract, and independently testable vertical components built on top.
