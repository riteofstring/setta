# Replace Chat Polling With Push Events

## Purpose

Replace the renderer chat polling loop with backend-pushed events for live chat,
run, approval, and conversation updates.

Polling was useful as a Phase 3 bridge, but it is the wrong long-term shape for
chat. The backend already knows when Codex emits text, requests approval,
finishes, fails, or is cancelled. The UI should receive those changes as events
instead of repeatedly asking whether anything changed.

## Goals

- Stream assistant text to the renderer as soon as the backend receives it.
- Surface run status and approval changes without polling.
- Keep the Go backend as the source of truth for persisted chat state.
- Preserve snapshot/page APIs for startup, workspace switches, reconnects, and
  recovery.
- Remove continuous renderer polling from `ChatPanel` and `chat-store`.
- Keep the event path general enough to support future timeline events for tool
  calls, command output, file edits, diffs, and artifacts.

## Non-Goals

- Do not replace command APIs like send, stop, or approve with a bidirectional
  socket protocol.
- Do not add client-side persistence.
- Do not build the full phase 4 timeline UI in this pass.
- Do not add a polling fallback unless a specific failure mode proves that it is
  required.

## Proposed Architecture

Use server-sent events from the Go backend to Electron main, then forward typed
events to the renderer through preload IPC.

The data flow should be:

1. Renderer calls existing request/response APIs for user actions.
2. Go backend persists authoritative state and publishes typed chat events.
3. Electron main owns one event-stream connection to the backend.
4. Electron main forwards events to renderer windows with IPC.
5. Preload exposes a typed subscription API on `window.setta.chat`.
6. Zustand applies events to in-memory renderer state.
7. Renderer reloads snapshots only on startup, workspace switch, chat switch, or
   reconnect/resync.

This keeps the renderer inside the preload boundary and avoids giving frontend
code direct backend transport ownership.

## Event Contracts

Define Go-owned event contracts and generate TypeScript surfaces from them.
Avoid manually mirrored TypeScript event shapes.

Initial event envelope:

- `schemaVersion`
- `sequence`
- `eventId`
- `type`
- `emittedAt`
- `workspaceId`
- `conversationId`
- `runId`
- typed payload

Initial event types:

- `chat.message.created`: user message or assistant placeholder was created.
- `chat.assistant_text_delta`: assistant text delta for a message part.
- `chat.message.updated`: message status or non-delta fields changed.
- `chat.run.updated`: run status or pending approval changed.
- `chat.conversation.updated`: title, updated time, message count, or active run
  indicator changed.
- `chat.resync_required`: renderer should reload the relevant snapshot because
  the stream missed events or the backend restarted.

The exact event names can change during implementation, but the events should be
a discriminated union in TypeScript and exhaustively handled in the renderer.

## Backend Work

Add an in-memory event hub owned by the backend process.

Responsibilities:

- Assign monotonic event sequence numbers.
- Broadcast events to subscribers.
- Keep a bounded ring buffer for reconnect replay.
- Support `Last-Event-ID` or equivalent sequence replay.
- Report a resync-required condition when a subscriber asks for events older than
  the retained buffer.
- Shut down subscriber channels cleanly when the backend exits.

Add an SSE HTTP endpoint, likely `GET /events`, that streams the event envelope.
The endpoint should be registered with the existing HTTP API surface, but the
event payload contracts should have their own generated TypeScript union.

Publish events from chat service operations:

- Turn start publishes created user and assistant messages, run update, and
  conversation update.
- Assistant deltas publish `chat.assistant_text_delta` immediately, independent
  of disk persistence batching.
- Approval request and approval resolution publish run updates.
- Completion, cancellation, and failure publish message, run, and conversation
  updates.
- Harness thread ref changes publish conversation updates if they affect visible
  state.

The persisted store remains authoritative. Events are live notifications, not a
replacement for durable state.

## Electron Main And Preload Work

Electron main should open and own the backend SSE connection after backend
startup.

Main-process responsibilities:

- Connect to the backend event stream.
- Reconnect after transient connection failures with bounded backoff.
- Pass the last received sequence when reconnecting.
- Forward received events to each renderer window.
- Send a resync-required event when the stream cannot replay missed events.
- Record event-stream lifecycle and forwarded events in the session recorder.

Preload should expose a typed subscription API:

- `window.setta.chat.onEvent(listener): unsubscribe`

The renderer should not create the backend event connection directly.

## Renderer Work

Replace the polling behavior in `ChatPanel` and `chat-store`.

Renderer state should still load snapshots through existing APIs:

- App startup.
- Workspace selection.
- Conversation selection.
- Explicit resync-required event.

Live events should update the Zustand store:

- Append created messages when relevant to the active conversation.
- Apply assistant text deltas by `messageId` and `partId`.
- Apply message updates by replacing the matching message.
- Apply run updates to `activeRun`.
- Apply conversation updates to the conversation list for the active workspace.
- Ignore events for inactive workspaces/conversations unless they update visible
  workspace or conversation list metadata.

Remove the interval-based `refreshActiveConversation` loop. A manual resync
helper can remain, but it must not run continuously.

## Reliability Rules

- Every live event must include enough IDs to be routed deterministically.
- Event handlers should be idempotent where practical.
- Deltas must be applied in sequence order.
- If the renderer detects a sequence gap, it should reload the relevant snapshot.
- If event application cannot be trusted, fail visibly or resync explicitly.
- Do not silently fall back to polling.

## Testing

Backend tests:

- Event hub broadcasts to active subscribers.
- Event hub replays retained events after reconnect.
- Event hub reports resync-required when replay is impossible.
- Chat service publishes expected events for send, delta, approval, completion,
  cancellation, and failure.
- SSE endpoint streams valid events and closes cleanly.

Desktop tests:

- Electron main forwards backend events to renderer IPC.
- Preload subscription returns an unsubscribe function and stops delivering
  after unsubscribe.
- Chat store applies each event type correctly.
- Chat store ignores events for unrelated workspaces/conversations.
- Polling interval is removed from the chat view.

Dogfood checks:

- Long assistant responses stream smoothly.
- Switching chats during active runs keeps transcripts isolated.
- Approvals appear without refresh delays.
- Stop/cancel updates status without refresh delays.
- Backend restart triggers a clear resync/recovery path.
- Recorder output shows event-stream lifecycle and forwarded chat events.

## Implementation Order

1. Add Go event contract types and generated TypeScript event union.
2. Add backend event hub and SSE endpoint.
3. Publish chat/run/conversation events from the chat service.
4. Add Electron main event-stream client and IPC forwarding.
5. Add preload `chat.onEvent` subscription.
6. Add chat-store event reducers and renderer subscription setup.
7. Remove continuous polling from `ChatPanel`.
8. Update recorder logging for pushed events.
9. Run full quality checks and dogfood with the recorder.
