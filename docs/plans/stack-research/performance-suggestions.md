## Main conclusion

For Setta, “blazing fast” should mean:

**Every project/chat route opens from a local, already-projected cache; expensive truth-building happens behind it.**
The frontend should never wait on full project hydration, full transcript hydration, full XYFlow graph rendering, markdown parsing, syntax highlighting, tool-log expansion, or filesystem/index work before showing an interactive view.

The winning architecture is:

```text
Electron main
  ├─ starts Go backend early
  ├─ opens BrowserWindow immediately with native-looking shell
  └─ keeps preload/IPC minimal

Go backend, local data plane
  ├─ SQLite WAL store
  ├─ append-only event log
  ├─ materialized projection tables
  ├─ hot in-memory cache for recent projects/threads
  ├─ streaming updates over WS/SSE/local socket
  └─ background indexers/layout/search/diff jobs

React/Vite renderer
  ├─ route shell from bootstrap snapshot
  ├─ TanStack Query/Zustand hot cache
  ├─ virtualized chat timeline with stable anchors
  ├─ lazy project graph details
  ├─ workers for markdown/diffs/highlighting/layout
  └─ performance instrumentation around scroll/input/route-open
```

## What I found from T3 Code / T3 Chat

T3 Code is actually useful to study because it is public, current, and close to Setta’s product class: a TypeScript-heavy app with web, desktop, and server packages; the repo describes it as a minimal web GUI for coding agents, and its desktop package uses Electron. ([GitHub][1])

The interesting bit is not one magic library. T3 Code’s frontend stack includes React 19, Vite, TanStack Query, TanStack Router, Zustand, React Compiler, TanStack Pacer, and Legend List; its server package uses SQLite through Effect’s SQLite layer and has agent/provider/runtime concerns separated from the UI. ([GitHub][2])

The performance work visible in releases is very aligned with what Setta needs: recent T3 Code release notes explicitly mention “Optimize VCS diff loading to be up to 98% faster,” “Reduce chat timeline activity rerenders,” and “Extract collection performance refactors from mobile stack.” ([GitHub][3])

One especially relevant code comment: T3 Code prewarms visible sidebar rows into a thread-detail cache so opening a nearby thread can reuse an already-hot subscription. That is exactly the kind of “zero perceived latency” trick Setta should copy: **predict the next likely navigation and make it hot before the user clicks.** ([GitHub][4])

For T3 Chat, I found strong public performance claims and local-first positioning, but I did not find a clearly official open-source T3 Chat source repo to audit. Theo’s public post claims T3 Chat stored everything locally and avoided loading screens; Hacker News discussion around the launch also frames the speed as primarily UX/local-first work rather than model magic. Treat T3 Chat as a design case study, not source-code proof. ([LinkedIn][5])

## The Setta-specific architecture shift

Setta already has the right shape: Electron, Go backend, React/Vite/TypeScript frontend, and XYFlow. The important decision is to make the **Go backend the local performance engine**, not just an API server.

### 1. Add a “bootstrap snapshot” endpoint

On app launch or project switch, the renderer should call one tiny, bounded endpoint:

```text
GET /bootstrap
```

It should return only what is needed for the first interactive paint:

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

Do **not** include full project graphs, all chat history, all artifacts, all tool runs, all message parts, full file indexes, or syntax-highlighted markdown.

This is the pattern behind local-first performance: keep work local, immediately available, and sync/enrich in the background. Local-first literature describes “no spinners” and optional network as core ideals, while systems like Replicache describe instantaneous UI by taking the server round trip off the critical path. ([Ink & Switch][6])

For Setta, the “server round trip” is not the internet; it is also the Go backend, SQLite, filesystem, git, indexing, and model/tool state. The renderer should not wait on any of those unless the user directly asks for the result.

### 2. Use SQLite as the local projection store

In the Go backend, use SQLite as the durable local source of truth and projection engine. SQLite is small, fast, self-contained, and widely embedded; WAL mode is usually faster and allows readers and writers to proceed concurrently; FTS5 gives efficient local full-text search over large document/message collections. ([SQLite][7])

Recommended shape:

```text
events
  id, cursor, project_id, thread_id, type, payload_json, created_at

projects
  id, name, path, last_opened_at, status, summary_json

project_open_cache
  project_id, last_route, viewport_json, hot_node_ids_json,
  graph_snapshot_version, updated_at

chat_threads
  id, project_id, title, last_message_at, status,
  last_read_message_id, message_count, summary_text

messages
  id, thread_id, role, created_at, status,
  preview_text, estimated_height, measured_height,
  part_count, has_artifacts, has_tool_logs

message_parts
  id, message_id, kind, ordinal, small_preview,
  payload_ref, payload_inline_json, byte_size

artifacts
  id, message_id, kind, title, payload_ref, preview_ref

graph_nodes
  id, project_id, type, x, y, width, height,
  summary_json, detail_ref, updated_at

graph_edges
  id, project_id, source, target, type, summary_json

fts_messages
fts_projects
fts_artifacts
```

Key principle: **the route reads projection tables, not raw event history.**
Event history is for correctness, replay, and streaming updates. Projection tables are for instant paint.

### 3. Keep an append-only event stream

Every backend change should produce an ordered event cursor:

```text
project.updated
thread.created
message.created
message.part.appended
message.height.measured
run.started
tool_invocation.updated
artifact.created
graph.node.changed
index.progress
```

The renderer subscribes once:

```text
WS /events?cursor=<last_seen_cursor>
```

On resume, it replays from the last cursor. This avoids “loading” after sleep/wake or temporary backend disconnects. The UI already has a local projection, so reconnection is just catch-up.

## Project loading strategy

Setta should avoid treating “open project” as “hydrate entire project.”

### Target behavior

Opening a project should show, within one frame after local data arrives:

```text
Project name
Last active chat/thread
Canvas shell
Previously visible graph viewport
Sidebar summaries
Indexing/background status
```

Everything else can appear progressively.

### Project-open pipeline

```text
User clicks project
  ↓
Renderer immediately switches route and shows cached project shell
  ↓
Go returns ProjectOpenSummary from SQLite projection
  ↓
Renderer paints sidebar + last viewport + skeleton graph nodes
  ↓
Go starts background warmers:
    - visible node details
    - adjacent threads
    - file tree summaries
    - search index state
    - git/diff status
    - artifact previews
  ↓
Events stream in and upgrade the UI
```

### XYFlow-specific rules

XYFlow/React Flow performance problems are usually unnecessary rerenders. The React Flow docs explicitly call out memoizing custom nodes/edges, memoizing functions/objects passed to `<ReactFlow />`, and avoiding direct `nodes` / `edges` access in components that rerender during drag, pan, and zoom. ([React Flow][8])

For Setta:

1. **Never pass freshly allocated nodeTypes/edgeTypes.** Define them outside the component or memoize them. React Flow’s custom-node docs specifically recommend defining `nodeTypes` outside the component to prevent rerendering. ([React Flow][9])

2. **Separate canvas state from app state.** Chat updates, agent status, tool events, and artifact updates should not cause the XYFlow canvas to rerender.

3. **Use summary nodes first.** Render cheap node shells from `graph_nodes.summary_json`; lazy-load expensive details only for visible/selected nodes.

4. **Maintain a persisted viewport snapshot.** Store `{x, y, zoom, visibleNodeIds, selectedNodeIds}` in `project_open_cache`.

5. **Precompute layout in Go.** Do not run large layout algorithms on the renderer thread. If layout must run client-side, use a Web Worker.

6. **Use level-of-detail rendering.** At low zoom, render simplified nodes: title, status, tiny badges. At high zoom or selection, render full node content.

7. **Avoid full graph JSON payloads.** Use endpoints like:

```text
GET /projects/:id/open-summary
GET /projects/:id/graph/viewport?x=&y=&w=&h=&zoom=
GET /projects/:id/nodes?ids=a,b,c
GET /projects/:id/node/:id/detail
```

## Chat loading strategy

Setta’s current data model should lean into message parts:

```text
Conversation → ChatMessage → MessagePart → Run → ToolInvocation → Artifact → RunEvents
```

That is good for performance because the visible chat row does not need every tool log, artifact payload, run event, or attachment immediately.

### Initial thread open

Do not load the whole transcript. Load:

```text
latest 30–80 messages
message ids
role/status/timestamps
preview text
part summaries
estimated/measured heights
last read anchor
hasOlder/hasNewer
```

Then lazy-load:

```text
full markdown body
tool logs
artifact previews
code block highlighting
diffs
images
large attachments
run event timelines
```

### Message row model

Use a cheap row by default:

```ts
type MessageRowInitial = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  status: "streaming" | "complete" | "error";
  previewText: string;
  partSummaries: PartSummary[];
  estimatedHeight: number;
  measuredHeight?: number;
};
```

Then promote visible rows:

```text
preview row → markdown row → highlighted/enriched row → expanded artifact/tool row
```

A long chat should feel instant because most rows are inert summaries until they are visible.

### Optimistic chat actions

New messages, thread creation, title edits, and pin/archive actions should update the UI immediately with client-generated IDs, then reconcile with Go. TanStack DB’s mutation model describes this pattern directly: local optimistic state is applied immediately, persisted to the backend, and then replaced by confirmed server state. ([TanStack][10])

Setta can implement this without adopting TanStack DB fully:

```text
client creates optimistic event
  ↓
renderer updates local cache immediately
  ↓
Go writes event + projection
  ↓
Go emits confirmed event cursor
  ↓
renderer reconciles optimistic id/status
```

## Zero perceived latency chat scrolling

The cutting edge changed very recently. TanStack published a May 25, 2026 post specifically about chat virtualization: chats are not normal lists because they append at the end, prepend history at the start, stream-grow the last message token by token, and should only auto-follow when the user is already near the bottom. Their new virtualizer APIs include end anchoring, follow-on-append, stable prepend handling, and pinned streaming growth. ([TanStack][11])

That maps almost perfectly to Setta.

### Recommendation

Use **TanStack Virtual’s new chat/end-anchoring primitives** unless you want a more batteries-included commercial component. TanStack Virtual is headless and gives full markup control, while its docs position it as a utility for virtualizing long lists across React and other frameworks. ([TanStack][12])

Alternative: **Virtuoso Message List**. It is built specifically for human/chatbot conversations and includes virtualized rendering, declarative scroll control, auto-scroll behavior, and loading indicators, but the dedicated message-list package is commercial. ([Virtuoso][13])

Legend List is also relevant because T3 Code already has it in its frontend dependencies, and Legend List v3 explicitly advertises chat/AI chat, bidirectional infinite lists, scroll anchoring, `initialScrollAtEnd`, and visible-content-position maintenance. ([GitHub][2])

### Setta chat virtualizer rules

Use:

```ts
useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollRef.current,
  getItemKey: index => messages[index].id,
  estimateSize: index => messages[index].estimatedHeight ?? 96,
  anchorTo: "end",
  followOnAppend: true,
  scrollEndThreshold: 80,
});
```

Important details:

1. **Stable keys are mandatory.** Do not key by array index. Prepending old messages changes indices and breaks scroll stability.

2. **Persist height measurements.** Store `measured_height` back to Go/SQLite. Next time the thread opens, the list starts with realistic heights.

3. **Use conservative estimates.** TanStack Virtual recommends estimating the largest comfortable item size when dynamically measuring elements to improve initial positioning. ([TanStack][14])

4. **Preserve anchor on prepend.** When loading older messages, the same visible message should stay in the same visual position.

5. **Only follow new tokens when pinned.** If the user scrolled up, do not yank them to the bottom.

6. **Batch streaming tokens.** Do not rerender the whole timeline per token. Buffer tokens and commit to the visible streaming row on `requestAnimationFrame`, or at 30–60 Hz.

7. **Split the streaming row out of the list state.** The active assistant message can subscribe to a small external stream store. The virtualized list array should not be recreated on every token.

8. **Markdown later.** First paint streaming text as plain text. Parse markdown after idle, after completion, or in a worker.

9. **Syntax highlight in a worker.** Large code blocks should not block scroll.

10. **Collapse expensive parts by default.** Tool logs, diffs, artifacts, stack traces, and run events should render as cheap expandable summaries.

## Electron startup

Electron performance should be treated as part of product UX, not packaging. Electron’s own performance docs frame the goal as reducing memory/CPU/disk use while keeping the app responsive to input and operations fast. ([Electron][15])

For Setta:

1. **Show a native-colored window immediately.** Electron’s BrowserWindow docs say `ready-to-show` avoids visual flash, but for complex apps it may be too late and make the app feel slow; in that case, show immediately with a matching `backgroundColor`. ([Electron][16])

2. **Start Go before renderer asks for data.** Electron main should spawn or connect to the Go backend as early as possible.

3. **Keep preload tiny.** No database logic, no heavy imports, no markdown tooling, no indexing.

4. **Avoid large IPC payloads.** Use IPC for desktop capabilities; use local HTTP/WebSocket/Unix socket for bulk app data and event streams.

5. **Lazy-load heavy renderer chunks.** Vite supports lazy-loaded dynamic imports that split into separate chunks during build. Use that for settings, artifact viewers, markdown/highlighting, project search, advanced graph panels, and large optional integrations. ([vitejs][17])

6. **Cache the first route payload.** On clean shutdown, write the last `BootstrapPayload` to disk. On next launch, the renderer can paint stale-but-marked data immediately, then reconcile with Go.

## Main-thread budget

For scrolling and perceived latency, the enemy is not just “slow fetches.” It is long main-thread work.

INP measures responsiveness across click, tap, and keyboard interactions; web.dev’s long-task guidance says the browser cannot respond to interactions while a task is running and recommends breaking long tasks into smaller tasks. Chrome’s Long Animation Frames API measures frames delayed beyond 50 ms and can be observed with `PerformanceObserver`. ([web.dev][18])

Setta should instrument:

```ts
new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    // send to Go/dev telemetry:
    // route, activeThreadId, activeProjectId, duration, scripts, renderStart
  }
}).observe({ type: "long-animation-frame", buffered: true });
```

Also track:

```text
route_open_start → first_shell_paint
thread_click → first_message_visible
project_click → canvas_shell_visible
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
```

## Concrete performance budgets

Use budgets like these in CI/dev builds:

| Flow                                  |                   Good target |               Hard failure |
| ------------------------------------- | ----------------------------: | -------------------------: |
| Electron warm launch to visible shell |                       <300 ms |                    >800 ms |
| Cold launch to visible shell          |                       <800 ms |                   >1500 ms |
| Open recent project shell             |                       <100 ms |                    >300 ms |
| Open cold project shell               |                       <300 ms |                    >800 ms |
| Open recent chat thread               |                        <50 ms |                    >150 ms |
| First visible chat messages           |           <1 frame after data |       blank/loading screen |
| Scroll                                | no blanking, no visible jumps | any dropped-anchor prepend |
| Long animation frames while scrolling |                    0 expected |     repeated >50 ms frames |
| Streaming token update                |               active row only |     full timeline rerender |

## Highest-leverage Setta backlog

### P0 — create the fast path

1. **Implement `GET /bootstrap`.** Return only sidebar summaries, active project summary, active thread first page, scroll anchor, and event cursor.

2. **Add Go-side hot caches.** Keep last N project summaries and last N thread first pages in memory.

3. **Add event replay.** Renderer reconnects with cursor and never shows global loading just because it missed events.

4. **Persist chat row heights.** Add `estimated_height` and `measured_height` to messages.

5. **Move chat to end-anchored virtualization.** TanStack Virtual’s new chat primitives are the best current fit.

### P1 — remove renderer hot-path work

6. **Workerize markdown, syntax highlighting, diff rendering, and large artifact previews.**

7. **Render plain text first, enrich later.** This matters especially for streaming AI output.

8. **Split streaming state from timeline state.** Token events update only the active row.

9. **Collapse tool logs/artifacts by default.** Render summaries, lazy-load details.

10. **Batch token and event commits.** Use `requestAnimationFrame`, throttling, or a small scheduler. TanStack Pacer is relevant here because it provides debouncing, throttling, queuing, rate limiting, and batching utilities. ([GitHub][19])

### P2 — project/XYFlow performance

11. **Persist project viewport snapshots.**

12. **Load graph summaries first, details second.**

13. **Memoize all XYFlow props and custom node/edge components.**

14. **Stop chat/agent events from invalidating the canvas tree.**

15. **Add viewport-based graph data loading for large projects.**

### P3 — make it provable

16. **Add performance traces to dev builds.**

17. **Add a synthetic 10k-message chat benchmark.**

18. **Add a 5k-node/10k-edge project benchmark.**

19. **Fail CI on obvious regressions: bundle size, route-open timings, timeline rerender count, long-frame count.**

20. **Add a debug overlay showing hot-path status:** bootstrap age, event cursor lag, visible DOM row count, rendered XYFlow node count, and last long animation frame.

## The core product rule

Do not ask “how do we make loading fast?”

Ask:

**“Why is the user seeing loading at all?”**

For Setta, the answer should usually be: they should not. They should see the last known local projection immediately, then watch it quietly become fresher.

[1]: https://github.com/pingdotgg/t3code "GitHub - pingdotgg/t3code · GitHub"
[2]: https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/web/package.json "raw.githubusercontent.com"
[3]: https://github.com/pingdotgg/t3code/releases "Releases · pingdotgg/t3code · GitHub"
[4]: https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/web/src/components/Sidebar.logic.ts "raw.githubusercontent.com"
[5]: https://www.linkedin.com/posts/t3gg_i-made-the-fastest-ai-chat-bot-ever-2-days-activity-7284529645666873344-EcXY?utm_source=chatgpt.com "Theo Browne's Post"
[6]: https://www.inkandswitch.com/essay/local-first/ "Local-first software: You own your data, in spite of the cloud"
[7]: https://sqlite.org/ "SQLite Home Page"
[8]: https://reactflow.dev/learn/advanced-use/performance "Performance - React Flow"
[9]: https://reactflow.dev/learn/customization/custom-nodes "Custom Nodes - React Flow"
[10]: https://tanstack.com/db/latest/docs/guides/mutations "Mutations | TanStack DB Docs"
[11]: https://tanstack.com/blog/tanstack-virtual-chat "Chat UIs Are Lists Until They Aren't | TanStack Blog"
[12]: https://tanstack.com/virtual/latest/docs/introduction "Introduction | TanStack Virtual Docs"
[13]: https://virtuoso.dev/message-list/ "Virtuoso Message List | Virtuoso"
[14]: https://tanstack.com/virtual/latest/docs/api/virtualizer "Virtualizer | TanStack Virtual Docs"
[15]: https://electronjs.org/docs/latest/tutorial/performance "Performance | Electron"
[16]: https://electronjs.org/docs/latest/api/browser-window "BrowserWindow | Electron"
[17]: https://vite.dev/guide/features "Features | Vite"
[18]: https://web.dev/articles/inp "Interaction to Next Paint (INP)  |  web.dev"
[19]: https://github.com/tanstack/pacer "GitHub - TanStack/pacer: Utilities for debouncing, throttling, rate limiting, and queueing. Non-async and Async. · GitHub"
