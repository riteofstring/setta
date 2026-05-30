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
- The app schema is provider-neutral. Codex-specific command lines, event
  shapes, and logs stay at the Codex adapter boundary.
- Prefer explicit failure states over silent recovery.
- Keep the first schema small, but do not store chat as plain strings only.
- Persist semantic chat state separately from lower-level run/trace details.
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
- enough `Run` / `Trace` data to debug Codex turns

The initial `MessagePart` implementation can support only text, but the shape
should be a discriminated model so attachments, tool calls, tool results,
reasoning summaries, and artifacts can be added without replacing the transcript
model.

Minimum `Conversation` fields:

- id
- workspace id
- title
- createdAt
- updatedAt
- archivedAt, if needed

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

### Codex Harness

Implement one harness: Codex.

The harness should support:

- start a Codex turn for a workspace and conversation
- send the current prompt plus the needed conversation context
- stream assistant output back to the backend
- append stable assistant messages/parts as the backend source of truth
- stop/cancel an active turn
- report command startup failures, runtime failures, exit status, and stderr
- prevent overlapping turns in the same conversation unless explicitly allowed

Keep the interface small. It should not become a generic agent framework yet.

Suggested shape:

- `Harness` interface with `StartTurn`, `CancelTurn`, and status/event output
- `codex` implementation that owns Codex process details
- backend chat service that owns conversations/messages/runs
- HTTP/API endpoints that expose chat operations to Electron
- generated TypeScript contracts and typed preload APIs

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

- Codex process started
- assistant text delta received
- assistant message completed
- process exited
- cancellation requested
- error received

Raw token-by-token deltas do not need to be permanent transcript rows. Persist
final semantic messages and enough trace data to investigate failures.

### Renderer

Use a small Zustand store for chat view state and async actions. The store should
call preload APIs and update from backend responses/events.

Renderer surfaces:

- workspace picker
- workspace list / recent workspaces
- conversation list
- message transcript
- composer
- send button
- stop button while a Codex turn is active
- loading, empty, cancelled, and error states

Keep the transcript non-virtualized until there is measured need. Use stable
message IDs, pinned-bottom behavior, and a visible jump-to-latest control when
the user scrolls away from the latest message.

### Settings

Add only the configuration required for a reliable Codex chat loop.

Possible inputs:

- Codex executable path or discovery behavior
- working directory / workspace root
- environment variables needed by Codex
- model/profile option only if Codex requires it

Do not build the full settings area, LLM provider matrix, transcription profiles,
MCP configuration, or agent profiles in this phase.

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

Concurrency rules should be explicit. If only one active Codex turn per
conversation is supported, enforce that in the backend and render the blocked
state clearly.

## Storage

Use simple local workspace-scoped persistence first. Avoid a database unless the
implementation clearly needs one for correctness or complexity.

Recommended starting point:

- workspace metadata in the existing workspace state location
- chat records under a dedicated Setta workspace state directory
- one file per conversation, or another simple layout that avoids one giant JSON
  file as history grows
- atomic writes for durable state
- strict JSON decoding

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
- get conversation messages
- send user message
- cancel active run
- get active run status

Streaming can be implemented with the simplest reliable mechanism available in
the current backend/Electron architecture. The important part is that the backend
owns the stream accumulator and final message state.

## Testing And Verification

Backend tests:

- workspace open/select/restart behavior
- conversation persistence
- message ordering
- send-message mutation
- Codex harness command construction without invoking real Codex
- cancellation state transitions
- failed harness startup state
- strict decode failures

Renderer tests:

- workspace picker states
- conversation list states
- message rendering
- composer send behavior
- stop button behavior
- error states
- store async action behavior

Integration/smoke tests:

- app starts
- workspace can be opened
- conversation can be created
- a fake Codex harness can stream a response
- cancellation works with the fake harness

Do not require real Codex or real API credentials for the default test suite.
Production paths should still be exercised through a fake harness implementation
or controlled test command, not duplicated test-only chat logic.

## Implementation Order

1. Define Go-owned chat/run types and persistence.
2. Add backend chat service operations.
3. Add endpoint registry entries and regenerate TypeScript contracts.
4. Add typed preload APIs.
5. Add renderer chat store and minimal UI.
6. Add fake/test harness support for deterministic tests.
7. Add Codex harness process execution.
8. Add streaming/cancellation behavior.
9. Add restart/recovery tests.
10. Polish error states and empty states.

## Acceptance Criteria

- A user can open Setta, select this repo as a workspace, create a conversation,
  send a prompt to Codex, see the response stream into chat, cancel a running
  turn, quit the app, reopen it, and see the same workspace and conversation.
- The default automated test suite does not need real Codex credentials.
- The Codex integration has a clear error path when Codex is missing,
  misconfigured, exits non-zero, or is cancelled.
- The backend remains the source of truth for workspace, chat, message, and run
  state.
- The implementation does not introduce node/canvas/workbench scope.
