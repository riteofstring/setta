# Setta 3 Stack Recommendation

This note consolidates the stack-research notes that previously lived in this
directory. The current product architecture source of truth remains
`docs/plans/setta-3-architecture-rewrite.md`; this file is the supporting stack
decision record.

## Decision Summary

| Area | Decision |
| --- | --- |
| Desktop shell | Use Electron with a Go backend. Prove the browser automation loop early. |
| Browser pane | Prefer Electron `WebContentsView` or another Chromium-backed Electron path. Use CEF/Energy only after a successful spike if Electron becomes unacceptable. |
| Renderer | React + Vite + TypeScript. Keep the renderer thin and generated-contract-driven. |
| App UI | Tailwind 4 + shadcn/ui/Radix for app chrome, panels, dialogs, settings, forms, and menus. |
| Canvas/nodes | Keep XYFlow node internals custom and lean. Mount expensive controls only in active/editing states. |
| Workbench layout | CSS grid/flex for the shell; shadcn `Resizable`/`react-resizable-panels` for real pane splits; Radix/shadcn primitives for sidebars and rails. |
| Chat core | Go owns durable conversations, messages, runs, tool invocations, artifacts, approvals, queueing, steering, cancellation, and replay/recovery. |
| Chat renderer | Render generated backend types through a custom projection. Use focused UI libraries only where they do not own durable state. |
| Local data plane | SQLite WAL, append-only event log, projection tables, hot caches, and push-based event replay. |
| Performance target | Routes open from local projected snapshots. Expensive hydration, parsing, highlighting, graph detail, and indexing happen after first interaction. |
| Future interop | Treat AG-UI, ACP, assistant-ui, LangGraph, Eino, OpenAI Agents SDK, OpenCode, and provider SDKs as adapters or future harnesses, not as the canonical Setta schema. |

## Core Rules

- Go owns durable product state, migrations, privileged workspace access,
  provider credentials, harness execution, MCP/tools, approvals, and generated
  TypeScript contracts.
- The Electron renderer owns presentation state: composer drafts, selection,
  scroll position, collapsed panels, hover state, and transient rendering state.
- UI libraries may render, project, virtualize, highlight, and compose. They must
  not become the durable chat/run model.
- Provider schemas are adapter formats. OpenAI, Anthropic, Vercel AI SDK,
  LangChain, Bot Framework, MCP, AG-UI, and ACP must not dictate the database
  model.
- The app should show the last known local projection immediately, then reconcile
  with the Go backend through ordered events.
- Do not load a full project graph, full transcript, all artifacts, all tool
  logs, full file indexes, or syntax-highlighted content before first
  interactive paint.

## Desktop Shell And Browser Pane

Choose **Electron + Go backend** unless there is a hard product reason to avoid
Electron.

Electron is the safest practical shell because Setta needs a predictable
Chromium surface for generated UI preview and verification: screenshots,
console/network capture, DOM inspection, click/type interaction, focus/resize
behavior, DevTools, and CDP/Playwright-style automation.

Before building major product features on top of the browser pane, prove:

- macOS and Windows packaging viability.
- Embedded browser pane layout inside the workbench.
- Screenshot capture.
- Click/type/scroll interaction.
- DOM inspection.
- Console and network capture.
- Focus, resize, DPI, and zoom correctness.
- A usable automation path through Playwright Electron support, CDP attachment,
  or Electron `webContents.debugger`.

**CEF/Energy** is the best non-Electron path, but only after a short spike proves
the same checklist. CEF still ships Chromium and moves more responsibility into
Setta: window/layout management, browser lifecycle, menus, modals, packaging,
code signing, updates, crash recovery, and cross-platform behavior.

Avoid **Wails, Tauri, and React Native** as the main shell if the browser pane is
core. They are reasonable only if the third pane is a simple iframe/local preview
or a streamed screenshot surface. A streamed Playwright viewport can be a useful
MVP for agent verification, but it is not a polished human browser: text
selection, scrolling, focus, drag/drop, IME, context menus, and accessibility
become custom work.

Frontend protection should come from architecture, not obfuscation:

- Keep proprietary logic in Go/backend code.
- Keep renderer code thin.
- Disable production source maps.
- Use ASAR packaging and ASAR integrity.
- Flip Electron fuses to disable dev-oriented escape hatches.
- Sign and notarize builds.
- Optionally compile sensitive Electron main/preload code to V8 bytecode.

The goal is not to make the renderer impossible to inspect. The goal is that
copying the renderer does not give someone the product.

## UI And Workbench Stack

Use:

```txt
React + Vite + TypeScript
Tailwind 4
shadcn/ui and Radix primitives for app chrome
CSS variables for design tokens
CSS Modules/plain CSS only where hot paths benefit
custom lightweight XYFlow node internals
fine-grained renderer state subscriptions
```

The rule is **shadcn at the edges, custom lean components in the canvas**.

Tailwind mostly compiles to CSS and is not the main runtime risk. The bigger
risks are excessive DOM depth, broad state subscriptions, heavy paint styles,
always-mounted editors, hidden Radix primitives inside every node, and markdown
or code rendering in inactive nodes.

Use this pattern for canvas nodes:

```txt
Inactive node:
  shallow DOM
  static classes
  simple text/preview
  no mounted editor
  no hidden menus/popovers

Active node:
  richer controls
  mounted editor
  overlays/portals
  shadcn/Radix where useful
```

Use **CSS grid/flex** for the outer workbench. Use **shadcn `Resizable` /
`react-resizable-panels`** only for pane splits users actually resize, such as
sidebar/workbench/chat or nested vertical splits. Persist layout through Go-owned
settings/contracts instead of browser local storage.

Use **Radix/shadcn primitives** for sidebars, collapsible sections, toolbars,
toggle groups, and tooltips. Treat the activity rail as a controlled mode
selector, not as a docking framework.

Defer **Dockview**, FlexLayout, and IDE-style docking until users demonstrably
need rearrangeable panels. They add layout state, drag/drop, theming, and
accessibility work before the product needs it.

## Chat Renderer

Build Project Chat as a renderer projection over generated Go contracts.

Use now:

- `react-textarea-autosize` for the composer.
- Native form semantics.
- Enter sends, Shift+Enter inserts a newline, and IME composition is respected.
- Stop/cancel state while a backend run is active.
- `role="log"` / `aria-live="polite"` for transcript additions.
- A "jump to latest" control when the user scrolls away from the bottom.

Use only when needed:

- `react-markdown` if assistant output is Markdown.
- Lazy/fine-grained Shiki for code highlighting.
- `@tanstack/react-virtual` for long transcripts, prepending history, dynamic
  rows, and streamed assistant output.
- `cmdk` for slash commands, file/context pickers, or command palette behavior.
- `assistant-ui` only as a feature-flagged projection spike over Setta-owned
  state.

Do not adopt a full chat framework as the runtime/store. Vercel AI SDK UI,
CopilotKit, Bot Framework Web Chat, Chainlit, Deep Chat, NLUX, and JS local-first
databases are not good replacements for Go-owned durable chat/run state.

The first implementation can use a simple custom message list while histories
are short. The production long-history path should be designed for TanStack
Virtual-style end anchoring, stable keys, dynamic row measurement, prepend
anchor preservation, and "follow only when pinned" behavior.

Virtualizer rules:

- Key rows by backend message IDs, never array index.
- Store estimated and measured row heights in Go/SQLite projections.
- Preserve the visible anchor when older messages are prepended.
- Follow new tokens only when the user is near the bottom.
- Buffer streaming deltas and commit on `requestAnimationFrame` or another
  bounded cadence.
- Split active streaming row state from the full timeline array so a token does
  not recreate the entire list.
- Render plain text first; parse markdown after idle, after completion, or in a
  worker.
- Collapse tool logs, diffs, artifacts, stack traces, and run events by default.

## Chat, Runs, And Data Model

Use a small application-owned durable schema:

```txt
Conversation
  -> ChatMessage[]
      -> MessagePart[]
  -> Run[]
      -> RunEvent[]
      -> ToolInvocation[]
      -> Artifact[]
```

Messages should have stable backend IDs, deterministic ordinals, timestamps,
status, visibility, role, typed parts, and provider references. Do not use
provider IDs as primary keys and do not rely on timestamps alone for ordering.

Recommended roles:

```txt
system
developer
user
assistant
tool
```

Recommended message statuses:

```txt
pending
streaming
complete
incomplete
cancelled
error
```

Recommended part types:

```txt
text
attachment
tool-call
tool-result
reasoning
error
status
data
```

Keep transcript and operational run state separate:

- The transcript contains stable user-facing messages and parts.
- Runs contain execution status, trigger/response message IDs, model metadata,
  usage, cancellation/failure details, and provider references.
- Tool invocations are first-class rows because tools can edit files, run shell
  commands, inspect the workspace, call MCP servers, generate artifacts, fail,
  be cancelled, or require approval.
- Run events are append-only operational facts: model requests/responses,
  stream deltas, tool lifecycle events, terminal output, artifacts, retries,
  approvals, cancellations, errors, and completion.

Persist durably by default:

- Conversations, messages, and final parts.
- Runs.
- Tool invocations.
- Final tool inputs/outputs.
- Artifacts and artifact metadata.
- Redacted final provider request/response envelopes when useful for debugging.
- Usage, cost, stop reasons, and other audit metadata.

Treat as ephemeral, TTL, or debug-only:

- Token-by-token deltas.
- UI spinner/progress text.
- Optimistic frontend-only draft messages before backend acknowledgement.
- Partial invalid tool JSON, except for failure diagnostics.
- Raw unredacted provider payloads.

Do not embed blobs or base64 payloads in message JSON. Store files,
screenshots, images, patches, logs, webpages, datasets, and generated outputs as
artifacts. Message parts should reference artifact IDs.

Provider mapping rules:

- OpenAI Responses: map app messages/parts to typed input/output items; keep
  response IDs, conversation IDs, file IDs, output item IDs, and raw envelopes as
  provider references.
- Anthropic: map tool calls to `tool_use` blocks and tool results to adjacent
  `tool_result` blocks in the adapter. Do not make Anthropic's user-message tool
  result convention the app model.
- Vercel AI SDK: borrow the UI-message/model-message separation concept, but
  keep Setta's Go schema canonical.
- MCP: use MCP schemas at the tool/resource boundary. Do not make MCP the chat
  transcript model.
- LangGraph/LangChain: borrow checkpoint, content-block, tool-call, artifact,
  and metadata ideas only when useful. Do not adopt their internal state unless
  that runtime is the harness.

Reasoning/thinking should be summaries or opaque provider-required state, not
normal transcript text. Keep raw hidden reasoning private and adapter-controlled.

## Harnesses, Protocols, And Adapters

Keep the initial harness path narrow:

```txt
Go canonical event model
  -> Codex harness
  -> generated TypeScript contracts
  -> renderer projection
```

Future harnesses and protocols should sit behind the same boundary:

```txt
Harness interface
  -> Codex
  -> LangGraph
  -> Eino
  -> OpenAI Agents SDK
  -> Google ADK
  -> Mastra
  -> OpenCode/ACP
```

AG-UI can be useful as a derived UI projection protocol. ACP is strategically
interesting for coding-agent/editor interoperability because it models prompt
turns, streamed chunks, plans, tool calls, permissions, cancellation, diffs,
terminal output, and file operations. Neither should replace Setta's durable
schema.

Golden trace fixtures should cover:

- Reload mid-assistant stream.
- Reload while approval is pending.
- Approval after restart.
- Cancel while a command/tool is running.
- Queued user message while a run is active.
- Steering an active run.
- Large tool output.
- File diff and terminal output in the same run.
- Provider error mid-stream.
- Harness process restart.
- Event replay from persisted state.

Every renderer adapter and future harness implementation should pass the same
traces.

## Local-First Performance Architecture

"Blazing fast" for Setta means every project/chat route opens from a local,
already-projected cache. Expensive truth-building happens behind it.

Recommended backend shape:

```txt
Go backend
  -> SQLite WAL store
  -> append-only event log
  -> materialized projection tables
  -> hot in-memory cache for recent projects/threads
  -> streaming updates over WS/SSE/local socket
  -> background indexers/layout/search/diff jobs
```

Recommended renderer shape:

```txt
React/Vite renderer
  -> route shell from bootstrap snapshot
  -> TanStack Query/Zustand hot cache
  -> virtualized chat timeline when histories are large
  -> lazy project graph details
  -> workers for markdown/diffs/highlighting/layout
  -> performance instrumentation around scroll/input/route-open
```

Add a bounded bootstrap endpoint:

```txt
GET /bootstrap
```

It should return only what is needed for first interactive paint:

```ts
type BootstrapPayload = {
  userSettings: SmallSettings;
  recentProjects: ProjectSidebarSummary[];
  activeProject?: ProjectOpenSummary;
  activeThread?: {
    threadId: string;
    latestMessages: MessageSummary[];
    scrollAnchor: ScrollAnchor | null;
    hasOlder: boolean;
  };
  uiState: {
    lastRoute: string;
    sidebarExpanded: boolean;
    selectedProjectId?: string;
    selectedThreadId?: string;
  };
  eventCursor: string;
};
```

The route should read projection tables, not raw event history. Event history is
for correctness, replay, auditing, and streaming updates. Projection tables are
for instant paint.

Recommended projection tables:

```txt
events
projects
project_open_cache
chat_threads
messages
message_parts
artifacts
graph_nodes
graph_edges
fts_messages
fts_projects
fts_artifacts
```

Renderer event subscription:

```txt
WS /events?cursor=<last_seen_cursor>
```

On resume, replay from the last cursor. The UI already has a local projection,
so reconnection should be catch-up instead of a global loading state.

## Project And XYFlow Loading

Opening a project should show quickly:

```txt
Project name
Last active chat/thread
Canvas shell
Previously visible graph viewport
Sidebar summaries
Indexing/background status
```

Everything else should appear progressively.

Use this pipeline:

```txt
User clicks project
  -> renderer switches route and shows cached project shell
  -> Go returns ProjectOpenSummary from SQLite projection
  -> renderer paints sidebar + last viewport + skeleton graph nodes
  -> Go starts background warmers
  -> events stream in and upgrade the UI
```

XYFlow rules:

- Define or memoize `nodeTypes` and `edgeTypes`; never pass freshly allocated
  values into `<ReactFlow />`.
- Separate canvas state from app/chat/agent state.
- Render summary nodes first and lazy-load details for visible/selected nodes.
- Persist viewport snapshots: x, y, zoom, visible node IDs, selected node IDs.
- Precompute large layout in Go, or use a worker if layout must run client-side.
- Use level-of-detail rendering at low zoom.
- Avoid full graph JSON payloads. Prefer summary, viewport, node IDs, and node
  detail endpoints.

## Electron Startup And Main Thread Budget

Startup rules:

- Show a native-colored window immediately when waiting for `ready-to-show`
  would make startup feel slow.
- Start the Go backend before the renderer asks for data.
- Keep preload tiny.
- Use IPC for desktop capabilities; use local HTTP/WebSocket/local socket for
  bulk app data and streams.
- Lazy-load heavy renderer chunks: settings, artifact viewers, markdown,
  highlighting, project search, graph panels, and optional integrations.
- Cache the first route payload on clean shutdown so the next launch can paint a
  stale-marked shell immediately and reconcile.

Instrument:

```txt
route_open_start -> first_shell_paint
thread_click -> first_message_visible
project_click -> canvas_shell_visible
scroll_frame_drops
timeline_row_rerenders
active_message_token_rate
SQL query duration
Go projection duration
payload byte size
JSON parse time
markdown parse time
syntax highlight time
XYFlow node count rendered
long animation frames
```

Budgets:

| Flow | Good target | Hard failure |
| --- | ---: | ---: |
| Electron warm launch to visible shell | <300 ms | >800 ms |
| Cold launch to visible shell | <800 ms | >1500 ms |
| Open recent project shell | <100 ms | >300 ms |
| Open cold project shell | <300 ms | >800 ms |
| Open recent chat thread | <50 ms | >150 ms |
| First visible chat messages | <1 frame after data | blank/loading screen |
| Scroll | no blanking, no visible jumps | dropped-anchor prepend |
| Long animation frames while scrolling | 0 expected | repeated >50 ms frames |
| Streaming token update | active row only | full timeline rerender |

## Highest-Leverage Backlog

P0 - create the fast path:

1. Implement `GET /bootstrap`.
2. Add Go-side hot caches for recent project summaries and thread first pages.
3. Add ordered event replay by cursor.
4. Persist chat row `estimated_height` and `measured_height`.
5. Prepare the transcript for end-anchored virtualization.

P1 - remove renderer hot-path work:

1. Workerize markdown, syntax highlighting, diff rendering, and large artifact
   previews.
2. Render plain text first and enrich later.
3. Split streaming state from timeline state.
4. Collapse tool logs/artifacts by default.
5. Batch token and event commits.

P2 - project/XYFlow performance:

1. Persist project viewport snapshots.
2. Load graph summaries first, details second.
3. Memoize all XYFlow props and custom node/edge components.
4. Stop chat/agent events from invalidating the canvas tree.
5. Add viewport-based graph data loading for large projects.

P3 - make it provable:

1. Add performance traces to dev builds.
2. Add a synthetic 10k-message chat benchmark.
3. Add a 5k-node/10k-edge project benchmark.
4. Fail CI on obvious regressions: bundle size, route-open timing, timeline
   rerender count, and long-frame count.
5. Add a debug overlay showing bootstrap age, event cursor lag, visible DOM row
   count, rendered XYFlow node count, and the last long animation frame.

## Deferred Or Avoided

Use later only with a concrete product need:

- `@tanstack/react-virtual` if short histories are still the first target, but
  keep the row model compatible with it from the start.
- `react-markdown` and Shiki when assistant output and code blocks require them.
- `cmdk` for slash commands and context pickers.
- `assistant-ui` as a projection spike only.
- AG-UI as a derived external UI protocol.
- ACP as a coding-agent/editor interop bridge.
- LangGraph, Eino, OpenAI Agents SDK, Google ADK, Mastra, and OpenCode as future
  harness implementations behind Setta's interface.
- LiteLLM/OpenRouter as backend-only provider breadth options after privacy,
  key handling, latency, and offline requirements are evaluated.

Avoid for the Setta 3 core:

- Wails/Tauri/React Native shell if the browser pane is first-class.
- Dockview/FlexLayout before users need true docking.
- Full Vercel AI SDK UI adoption as the chat runtime/store.
- CopilotKit full-stack as the Setta runtime.
- Bot Framework Web Chat as the transcript model.
- Chainlit, Deep Chat, and NLUX as the main UI/runtime stack.
- Renderer-owned local-first databases replacing Go persistence.
- Provider-owned conversation state as the source of truth.

## Still Open

- Exact proof path for Electron browser automation: Playwright Electron support,
  CDP attachment, `webContents.debugger`, or a hybrid.
- Whether XYFlow is the final graph interaction layer or still a research
  assumption.
- Exact v0 chat pagination and virtualization threshold.
- Exact canonical Go event types and payload versions.
- Whether AG-UI or ACP should be exposed externally in the first public
  developer-facing release.

