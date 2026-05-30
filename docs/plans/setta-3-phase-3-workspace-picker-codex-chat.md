# Phase 3: Workspace Picker And Codex Chat

## Objective

Build the smallest reliable Setta loop:

1. Open Setta.
2. Pick or open a workspace.
3. Start or resume a project chat for that workspace.
4. Send prompts to Codex.
5. See streamed responses, errors, cancellation, and completion state clearly.
6. Reopen Setta and recover the same workspace/chat state.

This should be reliable enough that we can use Setta to build Setta before
investing in the node canvas, side pane, browser area, terminals, MCP tools, or
state-machine UI.

## Product Direction

AI chat is the central workflow. The next implementation work should optimize
for getting real daily usage as soon as possible, even if the UI is plain. A
boring reliable workspace picker and Codex-backed chat is more valuable now than
a broad shell with placeholder panels.

The UI should stay minimal:

- workspace picker / recent workspace list
- selected workspace header
- conversation list
- current conversation transcript
- composer
- send / stop controls
- run status and useful error display

Do not build the node area, side pane, workbench activity rail, browser pane,
terminal UI, or canvas in this phase.

## Principles

- Go owns durable state. The renderer consumes generated TypeScript contracts.
- Codex is the only initial harness, but it should sit behind a small harness
  boundary so future harnesses do not rewrite chat state.
- Use `codex app-server` as the Codex integration point. Do not integrate
  through the interactive Codex TUI or `codex exec`.
- The app schema is provider-neutral. Codex-specific app-server protocol
  messages, event shapes, and logs stay at the Codex adapter boundary.
- Codex owns the agent loop, tool semantics, approval semantics, and provider
  behavior for Codex turns. Setta owns workspace selection, durable chat and
  agent timeline state, run records, and UI.
- Setta's conversation/run model should grow into the complete user-facing
  agent timeline: assistant messages, tool calls, command output, file edits,
  approvals, diffs, artifacts, errors, and summaries. Phase 3 only captures the
  minimal reliable subset needed for Codex-backed chat.
- Prefer explicit failure states over silent recovery.
- Keep the first schema small, but do not store chat as plain strings only.
- Persist semantic chat/timeline state separately from lower-level harness
  transport logs.
- No client-side persistence for domain state. Zustand may hold renderer view
  state and async actions, but the backend is authoritative.

## Scope

### Workspace Picker

Keep the current workspace lifecycle and make it production-shaped:

- open a local workspace directory
- keep recent workspaces
- keep active workspace sessions
- switch active workspace without losing chat state
- show unavailable/missing workspace errors clearly
- restore the last selected workspace on app restart when valid

The workspace picker should feel close to a minimal VS Code-style local
workspace flow. Remote SSH workspaces remain out of scope for this phase.

### Project Chat Model

Add a Go-owned durable chat model scoped to workspaces.

Initial records:

- `Conversation`
- `ChatMessage`
- `MessagePart`
- `HarnessThreadRef`
- enough `Run` / `Trace` data to debug Codex turns

The initial `MessagePart` implementation can support only text, but the shape
should be a discriminated model so attachments, tool calls, tool results,
command output, file edits, approvals, reasoning summaries, diffs, and artifacts
can be added without replacing the conversation model.

Minimum `Conversation` fields:

- id
- workspace id
- title
- createdAt
- updatedAt
- archivedAt, if needed
- harness refs

Minimum `ChatMessage` fields:

- id
- conversation id
- run id, when produced by a Codex turn
- role: `user`, `assistant`, `system`, `developer`, or `tool`
- ordinal
- createdAt
- updatedAt, if needed
- status: `pending`, `streaming`, `complete`, `cancelled`, or `error`
- parts

Minimum text part fields:

- id
- type: `text`
- text
- format: `plain` or `markdown`

Use backend-generated stable IDs. Do not use provider IDs as primary keys. Use
`ordinal` as the canonical message order; timestamps are for display and audit.

Assistant text should be stored as a text part with `format: "markdown"` unless
there is a concrete reason to store it as plain text. The renderer must support
Markdown display safely. Raw HTML should not be rendered as trusted content.

Support multiple conversations per workspace from the start. Multiple
conversations can be active across the same workspace and across different
workspaces.

### Harness References

Setta IDs are primary. Harness IDs are foreign references used to resume or
correlate external harness state.

Each Setta conversation may have one or more generic harness thread refs:

- harness: `codex`
- external thread id
- external session id, if supplied by the harness
- last external turn id, if supplied by the harness
- status: `linked`, `missing`, `stale`, or `unsupported`
- createdAt
- lastResumedAt, if resumed

For Phase 3, Codex app-server thread refs are needed because Setta will not yet
capture every app-server item that Codex may use to continue a turn. This is a
resumability bridge, not a statement that Codex is the long-term source of truth
for Setta chat.

If a Codex thread cannot be resumed, Setta should keep showing the saved Setta
conversation and mark the harness ref unavailable. It should not silently pretend
to continue the exact same Codex session. A later recovery action can start a new
Codex thread for the same Setta conversation, with a visible boundary in the
timeline.

### Codex Harness

Implement one harness: Codex.

The harness should support:

- connect to Codex through `codex app-server`
- start or resume a Codex app-server thread for a Setta conversation
- start a Codex turn for a workspace and conversation
- send the current prompt and required context as app-server turn input
- stream assistant output back to the backend
- append stable assistant messages/parts as the backend source of truth for the
  Setta timeline
- stop/cancel an active turn through Codex app-server `turn/interrupt`
- report app-server startup failures, protocol failures, turn failures, and
  missing Codex installation/authentication clearly
- prevent overlapping turns in the same Setta conversation unless explicitly
  allowed

Keep the interface small. It should not become a generic agent framework yet.

Suggested shape:

- `Harness` interface with `StartTurn`, `CancelTurn`, and status/event output
- `codex` implementation that owns the app-server connection and protocol
  mapping
- backend chat service that owns conversations/messages/runs
- HTTP/API endpoints that expose chat operations to Electron
- generated TypeScript contracts and typed preload APIs

The Setta backend should talk to Codex app-server. The Electron renderer should
not talk to Codex directly.

If Codex app-server protocol bindings or schemas are checked in, they must be
generated by `codex app-server generate-ts` or
`codex app-server generate-json-schema` and must not be edited by hand. It is
also acceptable to keep a narrow Go adapter type subset if that proves simpler,
as long as unsupported app-server messages fail explicitly.

### Approval Prompts

Codex owns what needs approval, but Setta is the UI. Phase 3 must surface the
minimal approval flow needed for Codex app-server turns.

Support pending approval UI for app-server requests such as:

- command execution approval
- file change approval
- permission approval
- tool user input requests

The approval UI can be plain. It needs to show the relevant command, file,
permission, or question details; allow approve/deny or answer/cancel as
appropriate; and send the response back to Codex app-server.

MCP elicitation and other less common app-server server requests can be
implemented only if they appear in normal Codex usage during this phase. If an
unsupported server request is received, Setta should show a specific unsupported
request error and stop or fail the affected turn rather than hanging silently.

### Runs And Traces

This phase does not need a full run history UI, but it does need enough durable
run data to debug Codex behavior.

Minimum run record:

- id
- workspace id
- conversation id
- trigger message id
- harness: `codex`
- status: `queued`, `running`, `completed`, `cancelled`, or `failed`
- startedAt
- completedAt, if finished
- prompt summary or message id reference
- error, if failed

Minimum trace/event support:

- Codex app-server connected
- assistant text delta received
- assistant message completed
- Codex thread/turn ref linked
- Codex thread resume failed
- turn completed
- cancellation requested
- error received
- approval requested
- approval resolved

Raw token-by-token deltas do not need to be permanent transcript rows. Persist
final semantic messages/timeline items and enough trace data to investigate
failures.

### Renderer

Use a small Zustand store for chat view state and async actions. The store should
call preload APIs and update from backend responses/events.

Build the transcript behind a `ChatTranscript` component boundary. The first
implementation can be non-virtualized, but the component and data API should not
assume that every message in every conversation is mounted at once.

Renderer surfaces:

- workspace picker
- workspace list / recent workspaces
- conversation list
- message transcript
- composer
- send button
- stop button while a Codex turn is active
- minimal approval prompt/card while Codex is waiting for user approval
- loading, empty, cancelled, and error states

Conversation and transcript loading rules:

- conversation lists load metadata only, not full message payloads
- opening a conversation loads the latest page/window of messages
- older messages are fetched by cursor or ordinal
- prepending older messages preserves scroll position
- no renderer path should load and render every message for every conversation
  by default

Transcript rendering rules:

- render one stable row per semantic message or pending approval, not one row per
  token
- use backend message IDs as React keys
- update only the active assistant message/part during streaming
- batch streaming text deltas before updating React state
- auto-scroll only when the user is pinned to the latest message
- show a visible jump-to-latest control when the user scrolls away from the
  latest message
- memoize Markdown/code rendering by message id and revision/status where useful

Keep the transcript non-virtualized until there is measured need. TanStack
Virtual is the likely future virtualization candidate if message count or row
cost requires it. Do not add TanStack Virtual or Pretext in Phase 3 unless
profiling shows the simple transcript cannot meet the reliability target.

Markdown rendering is in scope for chat messages. Keep rendering safe and
predictable; do not enable raw HTML as trusted chat content.

### Settings

Do not build Codex configuration UI in this phase.

Phase 3 should use the user's existing Codex installation, login, and
`~/.codex` configuration. If Codex is missing, not logged in, or unusable, Setta
should show a clear diagnostic and leave configuration UI for a later phase.

Do not build the full settings area, LLM provider matrix, transcription
profiles, MCP configuration, Codex model/profile controls, or agent profiles in
this phase.

## Non-Goals

- node canvas
- side pane / activity rail
- browser area
- terminal UI
- Git diff UI
- MCP server/client/bridge support
- Setta MCP tools
- generic external agent harnesses
- attachments UI
- artifact browser
- dictation
- state-machine UI
- plugin system
- remote SSH workspaces
- one-click sharing/deploy

## Reliability Requirements

This phase should be judged on reliability, not breadth.

Required behavior:

- opening a workspace creates or restores stable workspace state
- conversations survive app/backend restart
- sending a prompt cannot lose the user message
- assistant streaming cannot corrupt message order
- cancellation leaves an understandable final state
- Codex startup failures are visible and actionable
- backend restart does not require deleting local state
- invalid persisted state fails loudly with a specific error
- all chat mutations go through backend APIs
- approval requests are visible, actionable, and cannot leave the turn hanging
  silently
- unsupported Codex app-server protocol requests fail with a specific error

Concurrency rules:

- support multiple conversations per workspace
- support active turns across different conversations and workspaces
- enforce at most one active Codex turn per conversation initially
- render the blocked state clearly when a conversation already has an active turn

## Storage

Use simple local Setta app-data persistence first. Avoid a database unless the
implementation clearly needs one for correctness or complexity.

Store chat outside the workspace so Setta does not dirty repositories or place
private chat history inside project files by default.

Recommended starting point:

- app data root: `~/.setta`
- workspace metadata in Setta app data
- workspace records under `~/.setta/workspaces/<workspace-id>/`
- chat records under
  `~/.setta/workspaces/<workspace-id>/conversations/`
- run traces under `~/.setta/workspaces/<workspace-id>/runs/`
- one file per conversation, or another simple layout that avoids one giant JSON
  file as history grows
- atomic writes for durable state
- strict JSON decoding

Use a stable workspace id derived from the canonical workspace path. Do not use
the raw absolute path directly as a directory name.

Do not embed large blobs in chat JSON. Future attachments and artifacts should
be stored separately and referenced from message parts.

## API Shape

Backend endpoints should be generated into TypeScript contracts.

Likely operations:

- list recent/active workspaces
- open workspace
- select workspace
- list conversations for workspace
- create conversation
- get latest conversation message page
- get older conversation messages by cursor or ordinal
- send user message
- cancel active run
- get active run status
- submit approval decision or tool user input answer

Streaming can be implemented with the simplest reliable mechanism available in
the current backend/Electron architecture. The important part is that the backend
owns the stream accumulator and final message state.

## Testing And Verification

Backend tests:

- workspace open/select/restart behavior
- conversation persistence
- message ordering
- message pagination by cursor or ordinal
- send-message mutation
- Codex app-server adapter request/notification mapping without invoking real
  Codex
- cancellation state transitions
- approval request/response state transitions
- failed app-server startup state
- strict decode failures

Renderer tests:

- workspace picker states
- conversation list states
- message rendering
- latest-page loading and older-message loading
- pinned-bottom and jump-to-latest behavior
- composer send behavior
- stop button behavior
- approval prompt behavior
- error states
- store async action behavior

Integration/smoke tests:

- app starts
- workspace can be opened
- conversation can be created
- a fake Codex app-server adapter can stream a response
- cancellation works with the fake harness
- approval request/response works with the fake harness

Do not require real Codex or real API credentials for the default test suite.
Production paths should still be exercised through a fake harness implementation
or controlled test command, not duplicated test-only chat logic.

## Implementation Order

1. Define Go-owned chat/run types and persistence.
2. Add backend chat service operations.
3. Add endpoint registry entries and regenerate TypeScript contracts.
4. Add typed preload APIs.
5. Add renderer chat store and minimal UI with paged transcript loading.
6. Add fake/test harness support for deterministic tests.
7. Add Codex app-server adapter and connection management.
8. Add streaming/cancellation behavior.
9. Add approval request/response behavior.
10. Add restart/recovery tests.
11. Polish error states and empty states.

## Acceptance Criteria

- A user can open Setta, select this repo as a workspace, create a conversation,
  send a prompt to Codex, see the response stream into chat, cancel a running
  turn, quit the app, reopen it, and see the same workspace and conversation.
- The default automated test suite does not need real Codex credentials.
- The Codex integration has a clear error path when Codex is missing,
  unauthenticated, app-server startup fails, a protocol request is unsupported,
  or a turn is cancelled.
- Stop uses Codex app-server interruption rather than only killing a process.
- Codex approval requests are surfaced in Setta and can be answered from the UI.
- The backend remains the source of truth for workspace, chat, message, and run
  state.
- The renderer loads conversation metadata separately from message pages and does
  not render every saved message by default.
- Durable workspace/chat/run state lives in Setta app data, not inside the
  opened repository.
- The implementation does not introduce node/canvas/workbench scope.
