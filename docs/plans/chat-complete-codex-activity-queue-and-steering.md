# Complete Codex Chat Activity, Queueing, And Steering

This plan covers three related gaps in Setta chat:

- The transcript does not show the full Codex turn activity, especially tool
  calls and tool outputs.
- Users cannot queue follow-up messages while a run is active.
- Users cannot steer an active run while Codex is between, or waiting to finish,
  tool calls.

The implementation should keep Go as the durable owner of chat, run, and Codex
activity state. TypeScript surfaces should continue to be generated from the Go
HTTP endpoint registry and chat event contracts.

## Current State

The current chat path is intentionally narrow:

- `internal/chat/types.go` has conversations, text-only messages, runs,
  approvals, and generic trace events.
- `internal/chat/service.go` creates one user message, one assistant streaming
  message, and one running run for each prompt. It rejects new user messages
  while a conversation has an active turn.
- `internal/chat/codex_harness.go` handles `item/agentMessage/delta`,
  `turn/completed`, `error`, and approval server requests. Most other Codex
  notifications are traced as ignored method names.
- `internal/chat/events.go` publishes message creation, assistant text deltas,
  message updates, run updates, conversation updates, and resync requests.
- `desktop/src/main/backend-event-stream.ts` forwards generated chat events from
  the Go backend to renderer windows through Electron IPC.
- `desktop/src/renderer/src/stores/chat-store.ts` applies those events to the
  selected conversation and resyncs on gaps.
- `desktop/src/renderer/src/components/chat-transcript.tsx` renders user text,
  assistant markdown, and pending approval cards.

The local Codex app-server protocol includes structured turn activity that Setta
is not preserving today. Relevant methods include:

- Client requests: `turn/start`, `turn/steer`, `turn/interrupt`.
- Turn notifications: `turn/started`, `turn/completed`,
  `turn/diff/updated`, `turn/plan/updated`.
- Item lifecycle notifications: `item/started`, `item/completed`.
- Text deltas: `item/agentMessage/delta`, `item/plan/delta`,
  `item/reasoning/summaryTextDelta`, `item/reasoning/textDelta`.
- Tool output/progress: `item/commandExecution/outputDelta`,
  `item/commandExecution/terminalInteraction`,
  `item/fileChange/patchUpdated`, `item/mcpToolCall/progress`.
- Server requests already partly handled: `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/permissions/requestApproval`,
  `item/tool/requestUserInput`.

Codex `ThreadItem` payloads are the important structured source of truth for
what happened in a turn. They include `agentMessage`, `plan`, `reasoning`,
`commandExecution`, `fileChange`, `mcpToolCall`, `dynamicToolCall`,
`collabAgentToolCall`, `webSearch`, `imageView`, `imageGeneration`,
review-mode markers, and context compaction.

## Product Semantics

Use explicit delivery modes, not heuristics:

- **Normal message**: sent when no run is active. It starts a new Codex turn.
- **Queued message**: created by pressing `Tab` in the composer. It is durable
  and visible immediately. If a run is active, it does not reach Codex until the
  active run completes successfully. If the conversation is idle, the queue
  worker may immediately promote the first queued item.
- **Steering message**: sent while a run is active by the normal send action.
  It is attached to the active run and forwarded to Codex with `turn/steer`.
  Codex app-server is responsible for injecting it as soon as the active turn can
  accept steering, such as after the current tool call finishes.

Ordering rules:

- Queued messages are promoted one at a time, oldest first.
- Queued messages should not auto-start after backend restart. Leave them
  visible as queued or paused until the user explicitly sends or resumes the
  next item.
- If Q1, Q2, and Q3 are queued during A1, Q1 starts A2 only after A1 completes.
  Q2 starts A3 only after A2 completes, and Q3 starts A4 only after A3
  completes.
- Failed or cancelled active runs should not silently drain the queue. Leave
  queued messages visible and paused so the user can send, reorder, or clear
  them explicitly.
- Steering messages S1, S2, and S3 are forwarded in the order the user sends
  them. They do not create separate runs and should remain linked to the active
  run they steered.

Composer behavior:

- Idle conversation: `Enter` sends a normal message, `Shift+Enter` inserts a
  newline, and `Tab` queues the draft. If nothing else is running, the queued
  draft can promote immediately.
- Running conversation: `Enter` sends a steering message, `Tab` queues the
  draft, and `Shift+Enter` inserts a newline.
- Keep stop/cancel available as a separate icon button while running so steering
  does not compete with stopping the run.
- While the composer is focused, `Ctrl+C` should stop the active run when there
  is no selected text. If text is selected, preserve normal copy behavior.
- Empty drafts must not create queued or steering messages.

## Backend Data Model

Add durable concepts under `internal/chat`, then expose them through generated
contracts.

### Message Delivery

Extend chat message ownership enough to distinguish how a user message is
delivered:

- Add message delivery constants such as `normal`, `queued`, and `steering`.
- Add a message delivery/status field, or an adjacent queue record if that keeps
  `ChatMessage` simpler.
- Reuse existing statuses where they fit:
  - queued messages can be `pending` until promoted
  - steering messages can be `complete` after `turn/steer` is accepted
  - failed steering sends should become `error` with a specific error message

Queued messages should create a queued run record using the existing
`RunStatusQueued` constant. Do not create the assistant message for a queued run
until the queued run is promoted to running.

Steering messages should be linked to the active `RunID` and should not create a
new run.

### Run Activity

Add a first-class run activity model instead of hiding tool activity in generic
trace strings. A practical shape is:

- `RunItem`
  - `id`
  - `workspaceId`
  - `conversationId`
  - `runId`
  - `providerItemId`
  - `type`
  - `status`
  - `createdAt`
  - `startedAt`
  - `completedAt`
  - type-specific structured fields
- `RunItemOutput`
  - `id`
  - `runItemId`
  - `stream`
  - `ordinal`
  - `text`
  - `createdAt`

The durable schema should model the known Codex item types explicitly. Avoid
parsing assistant text to infer tools. Preserve Codex item IDs so later
notifications can update the same item deterministically.

Store large command output as append-only chunks, not as ever-growing text inside
one JSON document. The UI can show a compact preview and lazy-load expanded
output.

Keep `TraceEvent` for operational breadcrumbs that are not transcript content,
but do not use trace events as the only record for visible tool calls.

### Store APIs

Add store methods that are safe under service locking:

- Save/load/update queued messages and queued runs by conversation.
- Find the next queued run for a conversation in ordinal order.
- Save/upsert run items by `runId` and Codex `providerItemId`.
- Append run item output chunks with stable ordinals.
- Load message pages with enough adjacent run activity for the selected visible
  range, or provide a separate run-activity page endpoint.

Use temporary directories in tests. Do not mutate local runtime state.

## Service Flow

### Sending And Queueing

Split the current `SendUserMessage` behavior into explicit service methods:

- `SendUserMessage`: idle-only normal send, preserving the current behavior for
  no active run.
- `QueueUserMessage`: persists a queued user message and a queued run, publishes
  message/run/conversation events, and returns the queued state. It should work
  both while a run is active and while the conversation is idle.
- `SteerActiveRun`: active-run path that persists a steering user message,
  forwards it to the harness, publishes message/run-activity events, and returns
  the accepted steering message.

Keep error messages specific:

- queue requires a selected conversation and non-empty prompt
- steering requires an active backend-attached run
- normal send requires no active or queued promotion in progress

### Queue Promotion

After `completeTurn` commits the completed run and assistant message, or after a
queued message is added to an idle conversation, promote the next queued run:

1. Load the next queued run for the same conversation.
2. Mark it `running`, set `StartedAt`, create the assistant streaming message,
   and publish message/run/conversation events.
3. Start the harness turn in a goroutine using the queued prompt.
4. Promote only one queued run. The next queued run waits for this new run to
   complete.

Do not drain after `failTurn` or `markTurnCancelled`. Publish a run/conversation
update that leaves queued messages visible.

On startup recovery, keep interrupted running runs as failed or cancelled per the
current recovery policy, but leave queued runs queued. Do not auto-start queued
runs on backend startup.

### Steering

Extend the harness boundary:

- Add `SteerTurn(context.Context, SteerRequest) error` to `Harness`.
- `SteerRequest` should include `workspaceId`, `conversationId`, `runId`,
  `threadId`, `turnId`, and the steering text.
- `CodexHarness.SteerTurn` should look up the active JSON-RPC client and call
  `turn/steer` with `threadId`, `expectedTurnId`, and text input.
- The fake harness should record steering calls and optionally block until
  steering arrives for service tests.

The service should use the active harness ref/turn metadata already tracked by
the Codex harness. If no active turn ID is known yet, return a specific
`turn has not started` style error instead of silently converting steering into a
queued message.

## Codex Activity Ingestion

Replace the current "ignored notification" path with typed handling for the
notifications Setta needs to show.

Minimum useful ingestion matrix:

- `turn/started`: update run metadata and trace the Codex turn ID.
- `item/started`: upsert a running `RunItem` from the supplied `ThreadItem`.
- `item/completed`: upsert the final `RunItem`, final status, duration, exit
  code, file changes, MCP result/error, dynamic tool result, and other
  structured fields.
- `item/agentMessage/delta`: continue appending assistant text deltas, but key
  them by Codex item ID as well as Setta message/part ID.
- `item/plan/delta` and `turn/plan/updated`: create/update visible plan items.
- `item/reasoning/summaryPartAdded` and `item/reasoning/summaryTextDelta`:
  create/update reasoning summary items when Codex provides summaries.
- `item/commandExecution/outputDelta`: append command output chunks to the
  matching command item.
- `item/commandExecution/terminalInteraction`: create a visible terminal
  interaction activity item or attach it to the command item.
- `item/fileChange/patchUpdated`: update file-change activity with the changed
  paths and patch status.
- `item/mcpToolCall/progress`: update the matching MCP tool item with progress
  text.
- `turn/diff/updated`: store a compact diff summary/reference for the run.
- `thread/compacted`, `model/rerouted`, `warning`, `guardianWarning`,
  `configWarning`, and `deprecationNotice`: create visible run notices.
- `rawResponseItem/completed`: do not store in the normal durable transcript.
  Raw provider payloads may be added later as opt-in, size-capped diagnostic
  data, but typed Setta run activity is the only required UI source of truth.

Unsupported server requests or notifications should produce a specific visible
run diagnostic and a trace event. They should not disappear silently.

Approval handling should keep using server requests, but approval records should
also link back to the affected `RunItem` by Codex `itemId`.

## Events And Contracts

Add generated backend events owned by `internal/chat/events.go`:

- `chat.message.queued`
- `chat.message.steering_sent`
- `chat.run_item.created`
- `chat.run_item.updated`
- `chat.run_item_output.delta`
- `chat.queue.updated`

Exact names can change during implementation, but they should be explicit and
stable. Keep all event payloads Go-owned and generated into
`desktop/src/generated/backend.ts` by running:

```sh
./scripts/go.sh run ./cmd/generate-contracts
```

Do not maintain a separate TypeScript list of chat event types.

Add or update HTTP endpoints through `internal/httpapi/endpoints.go`:

- Queue message.
- Send steering message.
- List queued messages or include queue state in conversation/message page
  responses.
- Load run items/output for a run if not embedded in the message page response.

Electron IPC and preload should remain thin wrappers over generated backend
client methods.

## Renderer Plan

Update the renderer store to handle the new generated events:

- Track queued messages per selected conversation.
- Track active run items keyed by `runId` and `runItemId`.
- Apply output deltas incrementally without refetching the entire transcript.
- Resync active conversation and run activity on event sequence gaps.
- Keep queued state visible even when a run fails or is cancelled.

Update the transcript UI:

- Render assistant turns as a run container with assistant text and collapsible
  activity rows.
- Show command executions with command, cwd, status, exit code, duration, and a
  collapsed output preview.
- Show file changes with changed paths and patch status.
- Show MCP/dynamic tool calls with server/tool names, status, progress, result,
  and error.
- Show plan/reasoning summaries as compact activity rows.
- Show queued messages as pending user rows below the active run.
- Show steering messages as user steering rows linked to the active run.

Performance requirements:

- Collapse tool output by default.
- Cap inline output previews and lazy-load full output.
- Avoid rendering every output chunk as its own DOM-heavy component.
- Keep row subscriptions narrow so assistant streaming and command output do not
  rerender the entire conversation list or transcript.

## Tests

Go tests:

- `internal/chat`: normal send still rejects active runs; queue accepts active
  runs; queued runs promote one at a time after completion; failed/cancelled
  runs do not drain the queue.
- `internal/chat`: steering persists a steering message, calls the harness, and
  marks errors specifically when no active turn exists.
- `internal/chat`: run items are created/updated from fake harness activity and
  output chunks are appended in order.
- `internal/chat`: startup recovery leaves queued runs queued.
- `internal/chat/codex_harness_test.go`: fake app-server covers `turn/steer`,
  `item/started`, `item/completed`, command output deltas, file patch updates,
  MCP progress, and warnings.
- `internal/httpapi`: new queue, steering, run-activity endpoints and SSE events.
- `cmd/generate-contracts`: generated contracts include new event payloads and
  endpoint contracts from the registry.

TypeScript tests:

- `desktop/src/main`: backend client, event stream forwarding, and IPC handlers
  cover new endpoints/events.
- `desktop/src/preload`: exposed API includes queue and steering methods.
- `desktop/src/renderer/src/stores/chat-store.test.ts`: queued messages,
  steering messages, run item updates, output deltas, duplicate events, and
  resync behavior.
- Component tests for transcript rows covering queued, steering, command, file
  change, MCP, warning, failed, and cancelled states.

Manual verification:

- Start a long-running Codex command, send S1/S2/S3 with `Enter`, and verify they
  appear immediately in Setta and reach Codex in order after the current tool
  call boundary.
- During A1, queue Q1/Q2/Q3 with `Tab`; verify Q1 starts after A1, Q2 after A2,
  and Q3 after A3.
- Cancel or fail A1 with queued messages present; verify the queue remains
  visible and does not auto-drain.
- Run a turn with shell commands, file changes, MCP/tool calls, approvals, and
  warnings; verify the transcript shows each structured activity with outputs.

## Implementation Order

1. Add run activity and queue data types in Go, store APIs, and focused store
   tests.
2. Add service queue/promotion/steering methods with fake harness support and
   service tests.
3. Add Codex harness `turn/steer` plus typed activity ingestion for the minimum
   notification matrix.
4. Add HTTP endpoints and chat events, regenerate TypeScript contracts, and
   update backend/Electron IPC tests.
5. Update renderer store event handling and resync paths.
6. Update composer and transcript UI for running, queued, steering, and activity
   states.
7. Add manual verification coverage and run the repository-required format and
   quality checks before committing.

## Open Decisions

No open product decisions remain from this planning pass.

Settled decisions:

- Queued messages do not auto-start after backend restart.
- `Tab` queues the draft even when the conversation is idle.
- Raw Codex provider payloads are not part of the normal durable transcript.
  Store normalized `RunItem` and output data always. Add raw payload retention
  later only as opt-in, bounded diagnostic data if debugging needs justify it.
- `Enter` sends steering while a run is active.
- A stop button remains visible while running.
- `Ctrl+C` stops the active run when the composer is focused and no text is
  selected.
- Failed or cancelled runs leave queued messages paused.
- The transcript shows structured Codex activity, but not hidden/raw reasoning
  unless Codex exposes a user-visible summary.
