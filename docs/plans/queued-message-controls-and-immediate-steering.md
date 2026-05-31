# Queued Message Controls And Immediate Steering

This plan covers the smallest useful slice of the queue/steering controls:

- edit queued messages before they are promoted
- remove queued messages before they are promoted
- add an "immediate steering" action implemented as interrupt-and-replay

The plan intentionally avoids upstream Codex protocol changes. Editing or
unsending a steering message after `turn/steer` has been accepted is out of
scope because Codex app-server currently appends steering input to the active
turn queue and does not expose a remove/update operation for accepted input.
The immediate path works by preserving Setta's own pending-steer copy and
replaying it after an interrupt.

## Product Semantics

### Queued Message Edit

A queued message can be edited only while its linked run is still `queued`.

Editing updates the user message text and the queued run prompt summary. The
message keeps the same id, run id, ordinal, delivery, and queue position. If the
run has already been promoted to `running`, the edit is rejected with a specific
conflict-style error.

### Queued Message Remove

A queued message can be removed only while its linked run is still `queued`.

Removing deletes the queued user message and queued run from durable chat state.
The queue closes around it, but message ordinals are not renumbered. Existing
queued messages keep their ids and relative order.

### Immediate Steering

"Immediate steering" should follow the Codex TUI semantics: normal active-run
submission still uses Codex `turn/steer`, but Setta must keep a local pending
copy until Codex commits that input into history or the run is interrupted.

Codex `turn/steer` appends input to the active regular turn's pending-input
queue. That pending input is drained after the current model/tool boundary; it
does not force the active tool call to stop. The TUI's "press escape to send
immediately" behavior is an interrupt-and-replay flow, not a mid-tool
injection.

Implement immediate steering as:

1. Persist and submit the steering message through the existing steering path.
2. Keep the steering message locally pending instead of treating app-server
   acceptance as final completion.
3. When the user invokes immediate send, interrupt the currently active run.
4. Mark that run cancelled/interrupted in Setta.
5. Start the pending steering text as the next active run before ordinary queued
   messages.
6. Reconcile the original pending steering message so the transcript does not
   show the same user text twice.

For a draft-level "Interrupt and send" button, create the pending steering
message first and then immediately run the same interrupt-and-replay path. That
keeps the direct draft action equivalent to the pending-steer shortcut shown by
Codex TUI.

## Non-Goals

- Editing steering messages after Codex has committed the steering input.
- Unsending steering messages after Codex has committed the steering input.
- Reordering queued messages beyond removing one item.
- Rolling back Codex thread history.
- Injecting synthetic replacement items into Codex history.
- Reverting filesystem changes made by an interrupted run.

## Current State

Setta already has separate HTTP endpoints for send, queue, steer, and cancel in
`internal/httpapi/endpoints.go`.

Queued messages are created as a pending user message plus a `queued` run in
`internal/chat/service_queue.go`. Promotion happens only when the conversation
has no active turn. Promotion marks the user message complete, creates an
assistant message, marks the run running, and starts the harness turn.

Steering currently persists a steering message and then calls the harness
immediately. The Codex harness sends app-server `turn/steer` with the active
thread id and turn id. Upstream Codex validates the active turn and appends the
input to the current turn's pending input queue. Setta currently marks the
steering message complete as soon as app-server accepts it; immediate steering
requires changing that to a durable pending state so the message can be replayed
if the user interrupts before Codex commits it.

Cancellation currently calls Codex `turn/interrupt`, cancels the local context,
and marks the active run cancelled. Codex clears the active turn's pending input
as part of interruption, so Setta must not rely on app-server retaining
previously accepted steering input after `turn/interrupt`.

## Backend Contracts

Add new request/response contracts through `internal/httpapi`; do not hand-edit
generated TypeScript.

Recommended endpoints:

```txt
POST /chat/messages/queue/edit
POST /chat/messages/queue/remove
POST /chat/messages/steer/immediate
```

Recommended request types:

```go
type EditQueuedChatMessageRequest struct {
    WorkspaceID    string `json:"workspaceId"`
    ConversationID string `json:"conversationId"`
    MessageID      string `json:"messageId"`
    Prompt         string `json:"prompt"`
}

type RemoveQueuedChatMessageRequest struct {
    WorkspaceID    string `json:"workspaceId"`
    ConversationID string `json:"conversationId"`
    MessageID      string `json:"messageId"`
}

type SendSteeringImmediatelyRequest struct {
    WorkspaceID    string `json:"workspaceId"`
    ConversationID string `json:"conversationId"`
    Prompt         string `json:"prompt,omitempty"`
}
```

The endpoint always applies to all pending steering messages for the active run,
in FIFO order. `Prompt` is only a draft shortcut: the service should first
persist/send it as a pending steering message, then take the same immediate
replay path. Avoid selecting a subset in the first slice because Codex clears
all pending input for the interrupted turn, not only the message the user clicked.

Recommended response types:

- Edit queued: return the updated conversation, updated message, updated run,
  queue state, and current message page.
- Remove queued: return the updated conversation, removed message id, removed
  run id, queue state, and current message page.
- Immediate steering: return the updated conversation, cancelled/interrupted
  source run, replayed steering message ids, the new active run, queue state, and
  current message page.

Add matching preload, shared API, main-process IPC, and generated backend client
surface after regenerating contracts.

## Store Transitions

Add explicit store-level methods instead of scattering file mutations in service
code.

### EditQueuedTurn

Inputs: workspace id, conversation, queued user message, queued run.

Validation:

- conversation belongs to workspace
- message belongs to conversation
- message role is `user`
- message delivery is `queued`
- message status is `pending`
- message run id matches run id
- run status is `queued`
- run trigger message id matches message id
- run assistant message id is empty

Mutation:

- replace the message text part with the trimmed prompt
- update `message.UpdatedAt`
- update `run.PromptSummary`
- update `conversation.UpdatedAt`
- save message, run, and conversation

### DeleteQueuedTurn

Inputs: workspace id, conversation id, message id.

Validation:

- locate the message by id
- require `delivery == queued`
- require a non-empty run id
- load the run
- require `status == queued`
- require trigger/run/message links to match

Mutation:

- remove the queued message JSON file
- remove the queued run JSON file
- remove the run trace directory/file if present
- update and save the conversation timestamp

Do not renumber remaining message ordinals. Gaps are simpler and safer than
rewriting historical message identities.

### ReplayPendingSteeringAsTurn

Inputs: workspace id, conversation id, active run, pending steering messages,
merged replay prompt.

Validation:

- active run status is `running`
- each replayed message belongs to the active run
- each replayed message role is `user`
- each replayed message delivery is `steering`
- each replayed message status is `pending`
- merged replay prompt is not empty

Mutation:

- create a new normal user message with the merged replay prompt
- create the new running run and assistant message for that normal user message
- delete the replayed pending steering message files
- update `conversation.UpdatedAt`

Do not move an existing steering message across runs. Creating one new normal
trigger message and deleting the replayed pending steering messages keeps the
transcript to a single visible copy of the user's text and avoids adding replay
metadata to the message schema.

## Chat Service Changes

Add these service methods:

```go
EditQueuedMessage(workspaceID, conversationID, messageID, prompt string) (QueueEditResult, error)
RemoveQueuedMessage(workspaceID, conversationID, messageID string) (QueueRemoveResult, error)
SendSteeringImmediately(workspaceID, conversationID string, prompt string) (ImmediateSteeringResult, error)
```

### Edit Queued Message Flow

1. Trim prompt.
2. Reject empty prompt.
3. Reject slash prompts through the existing message-endpoint slash guard.
4. Resolve workspace.
5. Lock `service.mu`.
6. Load and validate the queued message/run pair.
7. Save the edited queued turn.
8. Publish message updated, run updated, queue updated, and conversation updated.
9. Return a fresh page and queue state.

Because promotion also holds `service.mu`, an edit cannot race with promotion.
If the run was promoted before the edit acquired the lock, return a specific
error instead of silently editing a running turn.

### Remove Queued Message Flow

1. Resolve workspace.
2. Lock `service.mu`.
3. Load and validate the queued message/run pair.
4. Delete the queued turn.
5. Publish message removed, queue updated, and conversation updated.
6. Return a fresh page and queue state.

If the removed run is not the first queued run and the conversation is idle,
promotion should still consider the next queued run after deletion. In practice,
queue removal should call `promoteQueuedIfIdleLocked` after deletion for the idle
case.

### Immediate Steering Flow

Use a custom path rather than composing public `CancelActiveRun` and
`SendUserMessage`, because `SendUserMessage` intentionally rejects sending while
queued messages exist and because Codex clears pending steering input during
interrupt.

1. Resolve workspace.
2. If `prompt` is set, trim it, reject empty/slash prompts, and persist/send it
   through the normal steering path as a pending steering message.
3. Lock `service.mu` and capture the attached active turn.
4. Load all pending steering messages for that run in ordinal order:
   `delivery == steering`, `status == pending`, `runID == activeRun.ID`.
5. Reject if no pending steering messages exist after the optional draft prompt
   has been persisted/sent.
6. Copy the pending steering text into an immediate replay prompt. If multiple
   pending messages exist, merge them in FIFO order using newlines, matching the
   Codex TUI behavior.
7. Treat the persisted pending steering messages as the replay intent. Do not
   mark, delete, or complete them before the replacement normal turn has been
   durably saved.
8. Unlock and call `harness.CancelTurn`.
9. Cancel the active turn context.
10. Mark the captured run cancelled with an immediate-steering trace reason.
11. Lock again and verify no other active/running run has appeared.
12. Persist a normal running turn with the replay prompt while leaving ordinary
    queued runs untouched.
13. Delete the replayed pending steering messages and publish
    `chat.message.removed` for each one. The new normal trigger message is the
    only visible copy in the transcript.
14. Install the new active turn and start the harness.
15. Return `ImmediateSteeringResult`.

If the original run completed and promoted queued work before the immediate path
can mark it cancelled, reject with a conflict error. Do not cancel a newly
promoted queued run implicitly. If Codex commits a pending steering message
before the interrupt takes effect, mark that message complete and exclude it
from replay to avoid duplicate input.

## Events

Existing `chat.message.updated`, `chat.run.updated`, `chat.queue.updated`, and
`chat.conversation.updated` cover queued edit.

Queued removal and immediate-steering replay cleanup need one new event:

```txt
chat.message.removed
```

Payload:

```go
type MessageRemovedPayload struct {
    MessageID string `json:"messageId"`
    RunID     string `json:"runId"`
}
```

The renderer should remove the message from `messages`, `messageIds`, and
`messagesById`. Queue state still comes from `chat.queue.updated`. For immediate
steering, the event removes the old pending steering rows after the replacement
normal user turn has been created.

Use `chat.resync_required` only for unexpected drift or failure recovery, not as
the normal mutation path.

## Renderer And UX

### Shared Frontend Rules

Keep these controls inside the existing transcript and composer surfaces. Do not
add a modal, drawer, or separate queue management panel for this slice.

Use compact icon buttons consistent with the existing composer controls in
`desktop/src/renderer/src/components/chat-panel.tsx`. Use lucide icons where
available:

- queued edit: `Pencil`
- queued remove: `Trash2`
- save edit: `Check`
- cancel edit/confirmation: `X`
- immediate steering: `Zap` or `SendHorizontal`

Every icon button needs an `aria-label` and `title`. Buttons should remain 24px
square like the current composer buttons, and row action containers should keep a
stable width so hover, edit, pending, and saving states do not shift message
text.

### Queued Row Controls

Add row-level controls only for `message.delivery === "queued"` and
`message.status === "pending"`.

The controls live in the queued user message bubble rendered by
`MessageRow`/`MessageContent` in `chat-transcript.tsx`. Place them in a compact
right-aligned action strip at the top of the bubble. They may become visually
prominent on hover/focus, but they must remain keyboard reachable.

Default controls:

- `Pencil` button: enter edit mode for this queued message.
- `Trash2` button: enter remove confirmation for this queued message.

#### Edit Queued UX

Clicking `Pencil` replaces the message text with an inline textarea seeded with
the current queued prompt. Keep the queued delivery badge visible. Replace the
default action strip with `Check` and `X` buttons.

Editing behavior:

- `Check` calls `chat.editQueuedMessage(message.id, draft)`.
- `X` exits edit mode and restores the original text.
- `Escape` exits edit mode without saving.
- `Cmd+Enter` on macOS and `Ctrl+Enter` elsewhere saves.
- Plain `Enter` inserts a newline in the textarea.
- Save is disabled when the trimmed draft is empty, unchanged, or an edit/remove
  operation is already active for that row.
- The textarea may grow vertically for multi-line input, but cap its height and
  allow internal scrolling so very large queued prompts do not expand the whole
  transcript.

On success, exit edit mode and render the updated message from the returned page
or `chat.message.updated` event. On validation errors such as empty/slash prompt,
leave edit mode open and show the existing store-level error near the composer
or transcript error surface. On promotion conflicts, refresh/apply the returned
page or event state and exit edit mode because the row is no longer editable.

#### Remove Queued UX

Clicking `Trash2` does not immediately delete the message. It changes the row
action strip into an inline confirmation state with:

- destructive `Trash2` button titled `Remove queued message`
- `X` button titled `Cancel remove`

Do not use `window.confirm`. Remove calls
`chat.removeQueuedMessage(message.id)`. Disable edit/remove controls while that
row is being removed. On success, the queued row disappears. If removal races
with promotion, apply the refreshed state and stop showing queued controls.

If a queued row disappears due to a server event while it is being edited or
confirmed for removal, clear the local edit/confirm state for that message id.

### Pending Steering Rows

Accepted but uncommitted steering messages should be visible as pending steering
under the active turn. Render `message.delivery === "steering"` and
`message.status === "pending"` with a pending-specific badge or status text so
they are distinguishable from steering that Codex has already committed.

Pending steering row controls:

- `Zap`/`SendHorizontal` button titled `Interrupt and send pending steering`.
- The button calls `chat.sendSteeringImmediately()` and sends all pending
  steering for the active run, not just this row.
- Disable the button while `sendingSteeringImmediately` or `cancelling` is
  active.

Do not expose edit/remove controls for pending steering in this slice. If Codex
commits a pending steering message, normal events should update it to complete
and remove the immediate action.

### Immediate Steering Control

Keep Enter/submission while a run is active as the existing steering behavior,
but display accepted steering messages as pending until Codex commits them or
the active run ends. Add an immediate-send control for those pending steering
messages so the user chooses the interrupting behavior explicitly.

Recommended running composer controls:

- primary arrow: Send steering message
- queue icon: Queue follow-up
- immediate icon: Interrupt and send pending steering
- stop icon: Stop run

Composer immediate behavior:

- If the draft is non-empty, the immediate icon calls
  `chat.sendSteeringImmediately(draft)`. The backend should first persist/send
  that draft as pending steering, then interrupt/replay all pending steering in
  FIFO order.
- If the draft is empty and pending steering exists for the active run, the
  immediate icon calls `chat.sendSteeringImmediately()` to interrupt and replay
  all pending steering in FIFO order.
- If the draft is empty and no pending steering exists, disable the immediate
  icon.
- Clear the draft only after the immediate request is accepted.
- Keep the existing primary arrow behavior unchanged: while running, it calls
  normal steering and does not interrupt.
- Keep the existing queue icon behavior unchanged: it queues a follow-up behind
  current and immediate work.
- Keep the existing stop icon behavior unchanged: it interrupts without replaying
  pending steering.

Keyboard behavior:

- `Escape` while the composer is focused, a run is active, no model picker/modal
  is open, the draft is empty, and pending steering exists should call
  `chat.sendSteeringImmediately()` for all pending steering.
- `Escape` should continue to dismiss the model picker before any immediate
  steering shortcut runs.
- Do not bind `Escape` to submit a non-empty draft; use the immediate icon for
  draft-level interrupt-and-send.

### Renderer Store

Add store actions:

```ts
editQueuedMessage(messageId: string, prompt: string): Promise<void>
removeQueuedMessage(messageId: string): Promise<void>
sendSteeringImmediately(prompt?: string): Promise<void>
```

Add these operation states:

```txt
editingQueued
removingQueued
sendingSteeringImmediately
```

Track the active row-level message id for `editingQueued` and `removingQueued`
so only the affected row disables controls. The composer can disable all send,
queue, immediate, and stop controls while `sendingSteeringImmediately` is active.

For edit/remove responses, apply the returned page and queue using the same
normalization path used by queue/send operations. For `chat.message.removed`,
remove the message from normalized message state and leave queue state to the
queue event. For pending steering, derive pending ids from normalized messages
where `delivery === "steering"`, `status === "pending"`, and `runId` matches the
active run.

## Edge Cases

- Editing/removing after promotion: reject; do not mutate a running or completed
  turn.
- Editing to an empty prompt: reject.
- Editing to a slash prompt: reject through the existing message endpoint guard.
- Removing the only queued message while the current run is active: remove it
  and leave no queued work.
- Removing the first queued message while idle and later queued messages exist:
  promote the next queued message.
- Immediate steering while no run is active: reject. The normal send path already
  handles idle sends.
- Immediate steering while an approval is pending: cancellation should resolve
  or clear the pending approval through the existing cancel path.
- Immediate steering with existing queued messages: new immediate run starts now;
  existing queued runs remain queued and promote after the immediate run
  completes.
- Immediate steering racing with run completion: fail loudly if another active
  run appears before the new immediate turn can be installed.
- Pending steering committed before interrupt completes: mark it complete and do
  not replay it.

## Verification

Start with narrow checks, then broaden because these changes touch chat
workflow, run lifecycle, queueing, steering, cancellation, event streaming,
generated contracts, renderer chat state, and transcript UI.

Focused Go tests:

- store transition tests for edit/delete queued turn validation and persistence
- service tests for queued edit success, queued remove success, reject after
  promotion, edit text used on later promotion, remove first queued message and
  promote next when idle
- service tests for immediate steering with no queued work
- service tests for immediate steering preserving queued work behind the new run
- service tests for pending steering committed before interrupt is not replayed
- HTTP endpoint tests for the three new endpoints

Focused renderer tests:

- preload API exposes the new methods
- chat store applies edit/remove responses
- chat event reducer handles `chat.message.removed`
- transcript renders queued edit/remove controls only for queued pending messages
- queued edit mode supports save, cancel, disabled empty/unchanged saves, and
  conflict exit behavior
- queued remove uses inline confirmation and removes only the targeted row
- pending steering rows render a pending-specific label and immediate action
- composer calls immediate steering from the new control without changing normal
  steering submit behavior
- composer immediate action sends all pending steering when the draft is empty
- Escape sends all pending steering only when the draft is empty and no picker or
  modal is open

Deterministic app workflow tests are required:

- open a temporary workspace
- create a chat
- send a hold prompt through production Electron/main/preload/renderer/HTTP/store
  paths
- queue at least two follow-ups
- edit one queued message
- remove one queued message
- submit a steering message while the active run is held in a fake harness
- use immediate steering on that pending message
- verify the original run is cancelled and the immediate prompt runs next
- verify preserved queued work promotes after the immediate run
- reload/restart and verify durable state matches the transcript and queue

When `OPENAI_API_KEY` is present in `.env`, also run the live Codex E2E tests.
If the key is absent, report that live-provider tests were skipped.

Before committing implementation code or generated outputs, run:

```sh
./scripts/format.sh
./check_quality.sh --all
```

Run `./scripts/check_supply_chain.sh` only if dependency manifests, lockfiles,
package manager config, Go module config, or supply-chain tooling changed.

## Suggested Implementation Order

1. Add backend queue edit/remove store transitions and service methods.
2. Add HTTP contracts/endpoints and regenerate TypeScript contracts.
3. Add queue edit/remove events and renderer reducers.
4. Add renderer store actions and queued row controls.
5. Keep steering messages pending until Codex commit/interruption reconciliation.
6. Add immediate steering service method and endpoint.
7. Add preload/main/shared API wiring.
8. Add immediate steering controls for pending steers and draft shortcut.
9. Add focused tests.
10. Add deterministic end-to-end workflow coverage.
11. Run final format and quality gates.
