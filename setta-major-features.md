Ignoring documentation, Setta’s executable source describes a local-first, visual Python/AI application-development environment. It combines a node canvas, code generation, execution, agents, plugins, and deployment in one system.

I treated a feature as “major” when it has a backend model/API/CLI or a dedicated frontend workflow. Items labeled partial exist in source but are incomplete, disabled, or weakly surfaced.

## 1. Multiple product modes

- Local authenticated IDE for building and running projects.
- Share deployment mode for publishing an interactive project.
- App deployment mode for rendering a generated application UI.
- Launcher mode for selecting, creating, and reopening workspaces.
- Standalone routes for projects, chats, sections, saved views, and window spaces.
- Local-session discovery and browser authentication bootstrap.
- Remote workspace operation over SSH, including server startup/reuse and local port forwarding.
- Native desktop-launcher installation through macOS apps, Windows shortcuts/wrappers, and Linux desktop entries. This is OS integration rather than an Electron-style desktop app.

## 2. Visual project canvas

The central authoring surface is a zoomable, pannable node graph with:

- Drag-and-drop sections, multi-selection, grouping, ungrouping, copy/paste, linked “paste as reference,” locking, minimizing, resizing, colors, and automatic layout.
- A minimap, configurable grid, zoom controls, shortcuts, command palette, advanced search, and navigation.
- Data edges with typed ports.
- Agent-context edges between chats and sections, supporting reference-only, inline-text, and summary context.
- State-machine edges for workflow control.
- Per-section variants, including create, rename, select, sort, freeze, delete, and default-variant behavior.
- Variant-specific arguments, values, JSON sources, and layout.
- Multiple saved views with independent viewport, visibility, and layout.
- Multiple named window spaces.
- Undo/redo and project history.
- Standalone section and saved-view presentation routes.
- Project chat windows that can be docked, floating, maximized, minimized, or opened standalone.

## 3. Canvas section and control library

The source defines these major section families:

- Python callables.
- Arbitrary code editors.
- Generated Python code and generated metadata.
- Terminals.
- Dictionaries, lists, groups, global variables, and meta-controls.
- Prompts and text/Markdown blocks.
- Images, charts, and drawing canvases.
- Browser/file-browser sections.
- Spreadsheets.
- Task boards.
- Chats.
- State-machine start, gate, and end nodes.
- IFrames and social embeds.
- Plugin-defined custom sections.

The reusable control system includes:

- Code, text, multiline text, password, date, time, button, slider, rotary, switch, dropdown, color, and dropzone controls.
- Nested controls and structured arguments.
- Positional-only, keyword-only, and ordinary Python parameter passing.
- Annotations, defaults, current values, indentation, hiding, pinning, filtering, and reordering.
- Button actions that can call Setta APIs, websocket listener endpoints, or arbitrary HTTP methods.
- Stateful and stateless file dropzones.
- Rich date/time display and selection settings.

## 4. Dedicated content tools

Several section types are effectively small applications:

- Workspace browser with recursive search, type filters, saved searches, navigation history, breadcrumbs, list/grid layouts, media previews, and “open as” actions.
- Universal preview for text, images, PDFs, audio, and video.
- Spreadsheet editor for CSV, TSV, XLS, and XLSX with sheet selection, virtualized grids, editing, filtering, sorting, row density, column resizing, external-change detection, and conflict-aware saves.
- Task boards in list or Kanban form, including columns, lanes, colors, descriptions, completion state, drag-and-drop, due dates, times, and hourly/daily/weekday/month/year recurrence.
- Drawing canvas with layers, brushes, erasing, move/resize transforms, realtime updates, stroke artifacts, and rendered snapshots.
- Line and scatter charts backed by files or generated chart data.
- Markdown/plain-text blocks with edit/display modes and style controls.
- Prompt blocks using Jinja templates, input values, live rendering, and missing-variable errors.
- YouTube and Twitter embeds.
- IFrame sections for arbitrary embedded pages.
- Plugin sections with custom UI or a generic JSON fallback.

## 5. Python generation and IDE capabilities

- Canonical generation of a runnable `setta_gen.py`.
- Optional generated metadata in `setta_gen_meta.py`.
- Dependency-aware generation from graph edges, state references, parameters, callables, prompts, structured data, files, and outputs.
- User-editable generated-file prefix and suffix regions.
- Runtime-error mapping back to canvas sections and parameters.
- Plugin-defined multi-file code-generation targets.
- Automatic pruning and hashing of generated outputs.
- Ruff formatting, linting, and fixes.
- Rename refactoring for generated `state.*` references, with accept/decline behavior.
- Generated and bound virtual documents supplied to language servers.
- Completion in code editors, text fields, output expressions, and generated-code regions.
- Callable signature discovery through LSP, including automatic parameter creation and explicit refetching.
- Diagnostics, signature help, completion, restart, and type-check operations.
- Per-error muting and diagnostic suppression.
- Selectable first-party Python language servers: Basedpyright and Ty.
- Python interpreter discovery through configured environments, active virtual environments, ancestor `.venv` directories, and PATH.
- Installed-package inventory and Python-root discovery.

Editors understand Python, Bash, JavaScript, TypeScript, JSON, YAML, TOML, Markdown, and plain text. Actual execution currently supports Python and Bash only.

## 6. Watch Code synchronization

The first-party Watch Code plugin can:

- Watch selected Python files or directories, recursively or non-recursively.
- Parse functions, async functions, classes, constructors, signatures, defaults, and annotations.
- Create callable canvas sections from source.
- Update sections when signatures or bodies change.
- Preserve identities across file moves and callable renames.
- Remove sections when the source disappears.
- Synchronize bound code-file sections.
- Keep variants while source declarations evolve.
- Ignore common generated/build/state directories.

## 7. Execution, terminals, and runs

- Interactive PTY terminals with websocket input, resizing, history, reconnect, and reuse.
- Terminal sections and terminals attached to code/generated-entry sections.
- Execution of manual Python or Bash code.
- Execution of a project’s generated Python entry point.
- Runtime parameter and variant overrides.
- Drawing-state snapshots applied before execution.
- Snapshot policies for ephemeral, always-saved, and never-saved runs.
- Persisted detached jobs with queued, running, exited, failed, canceled, and lost states.
- Detached-run output logs, status checks, and cancellation.
- Python `SettaRunner` APIs for running projects and reading named outputs.
- Python `RunPlan` automation supporting:
  - Multiple project configurations.
  - Variant loops.
  - Cartesian parameter grids.
  - Zipped parameter sets.
  - Seeded random samples.
  - Repetition and tags.
- Run-capability calculation so unrunnable project entries can be disabled in the UI.

## 8. AI chat and agent engines

Setta has two main engine classes:

### Managed LLMs

- OpenAI.
- Anthropic.
- Gemini.
- Azure OpenAI.
- Configurable models, base URLs, environment-variable API keys, request parameters, and MCP servers.
- Streaming text, reasoning/thinking, usage, context-window metadata, tool calls, tool previews, and tool results.
- Provider-native reasoning paths for OpenAI Responses, Anthropic thinking, and Gemini thinking.
- Multi-round MCP tool execution.

### External agents

- Claude Code through its SDK.
- Codex through its app-server protocol.
- Thread resumption, cancellation, streamed thoughts, tool activity, questions, approval requests, and responses.
- Working-directory strategies using the project root, a temporary directory, or a custom directory.
- Managed runtime configuration, MCP import, environment checks, CLI/SDK preflight, and health status.

### Chat experience

- Project-level and section-level chats.
- Conversation branching.
- Editing a message to create a new branch.
- Switching between branches.
- Continuing a conversation with a different engine.
- Search and result highlighting.
- Attachments for text, image, audio, video, and PDF content.
- Dictation controls.
- Per-profile tool allowlists.
- Chat stopping and cancellation.
- Tool timing, thought, and activity displays.
- Frontend-affinity routing so agent actions can target the originating UI session.
- AI Follow, which highlights canvas objects referenced by agent tools.
- Persisted agent-run inputs, outputs, events, tool calls, cost, and status.
- Sequential run chains that pass one agent’s output into the next.
- Completion guards that can require an agent to call `report_completion_status`.

## 9. Agent profiles and agentic context

- Named profiles with descriptions, system prompts, engine selection, tool allowlists, memory scopes, and behavioral flags.
- Context edges connecting section content and chat histories to other chats.
- Context source extraction from canvas objects.
- Cached-summary status and cache-limit presentation.
- Per-project skills and MCP-server/tool viewers.
- Editable custom skills.
- Controls for which MCP tools a profile may use.

## 10. Scriptable chats

The Python API supports chats controlled by application code:

- Create, retrieve, enumerate, update, append to, and delete persistent chats.
- Bind a chat record to a canvas chat section.
- Stream message starts, text deltas, thinking, tool previews, tool results, stop events, and finalization.
- Persist partial output during cancellation or failure.
- Invoke MCP tools from Python.
- Synchronize Python-generated messages into the frontend.
- Use Setta’s provider streaming machinery through `ChatToolkit`.

## 11. State-machine workflows

Canvas workflows can combine start, gate, chat, and end nodes:

- AND, OR, and XOR gates.
- Edge triggers for successful runs, failed runs, or custom signals.
- Optional payload-field matching.
- Activation-count comparisons such as `<`, `<=`, `=`, `>=`, and `>`.
- Inline prompts, reusable prompt templates, or prompt-section inputs.
- Continue-current-thread or create-new-thread actions.
- Stop-before-restart behavior.
- Engine, profile, permission, and search overrides.
- Parallel launch of eligible chat groups.
- Tracking of child runs, activated edges, counts, gates, reached ends, blockage, signals, and events.
- Start, stop, reset, and latest-run APIs.
- Agent-emitted workflow signals through MCP.

## 12. MCP platform

Setta is both an MCP server and an MCP client:

- Connects to external MCP servers over stdio, SSE, and streamable HTTP.
- Supports environment/header interpolation, retries, reconnection, server status, tool discovery, and namespaced calls.
- Exposes its own MCP server through HTTP and a CLI stdio bridge.
- Built-in tools cover projects, graphs, sections, controls, variants, layout, code, diagnostics, terminals, Python packages, profiles, runs, plugins, MCP administration, UI settings, state-machine signals, and completion reporting.
- Agent-context scopes can restrict which objects an agent may mutate.
- Tool metadata includes access level, categories, tags, annotations, argument previews, and result filtering.
- CLI commands can list and call tools without using the web UI.

## 13. Plugin platform

- Strict plugin manifests, versions, capabilities, and path validation.
- Workspace, user-data, and global plugin scopes with deterministic shadowing.
- Enable, disable, install, update, pin, link, rescan, restart, uninstall, and rollback workflows.
- Lockfile creation/application for reproducible plugin sets.
- Install history, snapshots, digests, and unverified-source warnings.
- Dynamic frontend JavaScript, CSS, and static assets.
- Python backend workers, probes, and runtimes.
- JSON-schema-driven plugin configuration UI.
- Plugin-owned UI settings exposed through MCP.
- Extension points for section kinds, panes, commands, top navigation, canvas controls, MCP tools, language servers, code generators, HTTP routes, listener endpoints, static directories, app backends, Watch Code backends, and project-state subscriptions.
- Deployment captures plugin/provider state.

First-party plugins are:

- Basedpyright language server.
- Ty language server.
- Watch Code.
- JSON Render App Generation, disabled by default.

## 14. JSON-rendered app generation

This substantial feature is plugin-gated and disabled by default:

- A separate app specification stored alongside the project.
- Compare-and-swap editing, validation, live preview, and patch streaming.
- AI generation modes for plain JSON, JSON using an image reference, prompt building, and MCP-server workflows.
- Responsive layout properties across standard breakpoints.
- Light, dark, and automatic themes.
- Colors, fonts, typography scales, spacing, motion, shadows, component tokens, and CSS variables.
- Motion and stagger presets.
- Bindings to project parameters and outputs.
- Actions for run, reset, artifact download, binary download, and external links.
- App policies governing runs, parameter/variant changes, downloads, and external navigation.
- A component catalog containing stacks, boxes, grids, containers, cards, tabs, headings, text, parameter inputs, action buttons, text/image outputs, dividers, motion, stagger, and configuration scopes.
- Draft/live previews and an app-deployment modal.
- Versioned app deployments.
- A browser/editor for app-generation `SKILL.md` files in workspace and user skill roots.

## 15. Share and app deployment

- Named, versioned deployments.
- Separate share-project and generated-app deployment types.
- Captures the project, generated code, structured data, artifacts, listener entry point, policies, and plugin state.
- Removes stored password values from deployment snapshots.
- Per-visitor state overlays and artifact isolation.
- Per-session run counts and expiration.
- Optional Python listener processes for deployed projects.
- Live artifact overlays for images, chart data, drawings, binaries, and files.
- Policies for parameter changes, variant changes, layout changes, runs, LLM access, external links, downloads, multiple runs, and snapshot behavior.
- CLI serving of a chosen or latest deployment version.
- Share/app modes deliberately do not authenticate users, so they are intended for appropriately trusted exposure.

## 16. Files, artifacts, and Git

- Workspace-bounded file listing, search, stat, reading, writing, creation, copying, moving, and downloads.
- Create-only and expected-modification-time writes.
- Stable reads that detect concurrent file changes.
- Signed download URLs.
- Binary upload/download storage.
- Artifacts for images, chart data, drawing strokes/transforms, and files.
- Workspace artifact import with overwrite, skip, or backup behavior.
- Artifact cache/load/update/delete operations.
- Signed URLs for chat attachments.
- Read-only Git status, diff, log, commit details, and commit-file diffs.
- Paginated Git graph UI and worktree display.
- Reveal-in-system-file-browser functionality with root validation.

## 17. Project persistence and reusable resources

- Create, load, save, save-as, rename, delete, search, preview, and default-project operations.
- Grid/list project home with favorites and multi-select deletion.
- Autosave and configurable rendered-value persistence.
- Scheduled retained backups.
- CLI backup listing and guarded restoration.
- Human-readable YAML state export.
- JSON-source-linked variants that write to files and update through file watching.
- Password values stored separately from ordinary project JSON.
- Filesystem-backed reusable prompt templates with descriptions, input schemas, metadata, live refreshing, and reference checks.
- Settings represented as a generated, canvas-like project of their own.

## 18. Python reactive automation SDK

`SettaListener` provides a reactive programming layer over project state:

- Subscribe by dependency name or stable structured ID.
- Always, realtime-only, and refresh-only dependency modes.
- Debounce, throttle, refresh callbacks, concurrency, and sync/async callbacks.
- Snapshot bootstrap and forced refresh.
- Ordered websocket events and binary frames.
- Callback access to values, changed dependencies, IDs, events, logging, frontend emitters, project management, and originating UI identity.
- Emit dependency-value and artifact updates back to the frontend.
- Invoke listener/router endpoints, including chat operations.
- Hot-reload callback modules with watched paths, globs, ignore patterns, and settle delays.
- Automatic local-session authentication and share-session scoping.
- Runtime/SDK compatibility handshakes.

## 19. Voice transcription

- Named transcription profiles.
- OpenAI Whisper default configuration.
- File/batch and realtime websocket transports.
- Automatic transport selection with supported fallback to file transcription.
- Language selection and configurable audio chunk size.
- Realtime mono PCM16/24 kHz streaming.
- Session start, append, stop, cancel, TTL, and capacity limits.
- Chat dictation using browser-native or provider-backed transcription.

## 20. Operational tooling

The CLI includes:

- IDE startup and backend reload watching.
- Version, path, status, authentication, and server-stop commands.
- Project-state export.
- Backup listing/restoration.
- Plugin lifecycle and lockfile commands.
- MCP tool listing/calling and stdio bridging.
- Launcher setup/status/repair/remove/update.
- Share and app servers.
- Local workspace launching/reuse.
- SSH remote connection and tunneling.
- Machine-readable bootstrap output for external launchers.

The UI also exposes backend logs, notifications, initialization state, version compatibility, server status, plugin restart state, and numerous appearance/shortcut/runtime settings.

## Important incomplete or constrained features

These exist in source but should not be mistaken for fully shipped behavior:

- JSON app generation is disabled by default and requires its plugin.
- Only Claude SDK and Codex app-server external-agent combinations are implemented, despite more generic configuration types.
- Generated plugin entry-point execution is explicitly unsupported.
- A CLI-output run type exists but is unsupported.
- Non-Python/Bash editors do not imply executable JavaScript/TypeScript/etc.
- Detached runs are unavailable in deployed projects.
- Git integration is read-only.
- There is no general workspace file-delete endpoint.
- Plugin context-menu registration and plugin artifact creation/opening currently throw “not implemented.”
- Plugin external-agent adapters are blocked by host policy.
- Plugin section reading/updating is restricted to plugin-owned sections.
- Async plugin registration is unsupported.
- Agent-profile background-summary and LLM-generated-title flags are stored but have no effective runtime consumer.
- Agentic summary-context source extraction and cache-status UI exist, but no complete summary-cache writer/generation path was found.
- State machines store `maxIterations`, but the runtime does not enforce it.
- Run-chain backend/API support exists, but there is little dedicated frontend workflow.
- Transcription has only an OpenAI provider implementation.
- Chart/image file-path workflows exist, but some direct drag-and-drop hooks are disabled.
- IFrame validation is only a lightweight unsafe-attribute check, not a comprehensive sandboxing system.
- Password values cannot be supplied as run overrides.
- A few frontend configuration/focus paths remain explicit TODOs.

Representative source landmarks include [runtime composition](/Users/kevin/Documents/AppDevelopment/setta/internal/app/app.go), [canvas contracts](/Users/kevin/Documents/AppDevelopment/setta/internal/projectstate/frontend_section_codeobj_contracts.go), [managed AI execution](/Users/kevin/Documents/AppDevelopment/setta/internal/managedllm/executor.go), [external-agent runtime](/Users/kevin/Documents/AppDevelopment/setta/internal/externalagents/runtime.go), [state machines](/Users/kevin/Documents/AppDevelopment/setta/internal/statemachineruns/runtime.go), [plugin capability resolution](/Users/kevin/Documents/AppDevelopment/setta/internal/plugins/capability_resolution.go), [Python listeners](/Users/kevin/Documents/AppDevelopment/setta/backend/setta/api/listener.py), and the [generated-app component registry](/Users/kevin/Documents/AppDevelopment/setta/plugins/setta-json-render-app-gen/frontend/src/components/App/appRegistry.tsx).
