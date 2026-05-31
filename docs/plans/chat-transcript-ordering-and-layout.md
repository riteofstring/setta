# Chat Transcript Ordering And Layout

## Problem

The latest desktop recording exposed two separate transcript issues:

- The chat transcript viewport can collapse into a thin strip between the chat
  header and composer, leaving most of the chat area empty and making messages
  barely visible.
- Queued user messages are visually grouped together even though backend run
  execution drains the queue sequentially.

The queue execution log shows the backend starts and completes queued runs one
at a time. The visible ordering is wrong because queued user messages receive
message ordinals when queued, before their assistant replies exist. Later
assistant replies are appended after all queued user messages, so the renderer's
simple ordinal sort produces:

```text
initial user, initial assistant, Q1, Q2, Q3, A1, A2, A3
```

The product transcript order should be backend-owned and should read:

```text
initial user, initial assistant, Q1, A1, Q2, A2, Q3, A3
```

The frontend should render that backend-owned order. It should not reconstruct
queue lifecycle semantics from raw messages.

## Goals

- Make transcript visual ordering a backend contract, not renderer inference.
- Model chat turns explicitly enough that queued promotion, assistant replies,
  steering, cancellation, failure, restart, and pagination all produce the same
  transcript order.
- Preserve strict validation for durable chat records and generated contracts.
- Keep renderer transcript code focused on rendering an ordered backend
  projection.
- Fix the transcript/composer layout so the transcript always owns the
  remaining vertical space.
- Add deterministic app-boundary coverage for the affected queueing and layout
  flows.
- Improve recordings so future layout regressions include enough DOM metrics to
  diagnose the failure from logs.

## Non-Goals

- Do not add a renderer-only reorder pass that groups queued messages with
  assistant replies.
- Do not make `ChatMessage.ordinal` carry two meanings: durable creation order
  and transcript display order.
- Do not add backward compatibility, legacy support, transitional adapters,
  dual-read/write paths, compatibility layers, or migrations.
- Do not add polling or heuristic layout repairs.
- Do not add silent compatibility shims, old-field aliases, dual-read paths, or
  legacy record readers.
- Do not weaken backend validation to make malformed records renderable.
- Do not manually edit generated TypeScript outputs.
- Do not preserve old broken chat transcript state. Existing local state can be
  reset or quarantined explicitly instead of migrated.

## Current Failure Shape

The backend already owns run queue execution. Persisted run records from the
recording show:

- the active poem run completes first
- `Q1` starts only after that run completes
- `Q2` starts only after `Q1` completes
- `Q3` starts only after `Q2` completes

The durable messages, however, are ordered by creation-time message ordinal:

- queued user messages are created when the user presses Queue
- assistant messages are created only when each queued run is promoted

The renderer then normalizes messages by `ordinal` and passes that sorted list to
the virtualized transcript. This is locally simple, but it exposes storage
creation order as transcript order.

The layout failure is different. The recording screenshots show the transcript
row collapsed to a small band while the composer appears far above the bottom of
the available chat pane. That points to a renderer layout contract failure
around the chat pane grid, transcript row, virtualized list container, and
composer.

## Proposed Model

Introduce a backend-owned transcript projection based on turns.

A turn is the product transcript unit for one user-initiated run:

- trigger user message
- run record
- assistant message when one exists
- terminal status
- run activity and approvals associated with that run
- steering messages associated with an active run, ordered by backend metadata

`ChatMessage.ordinal` can remain a durable storage ordinal, but it should stop
being the renderer's display-order source. The backend should return a
transcript projection whose order is already the product order.

Suggested contract shape:

```text
MessagePage
  conversation
  messages
  runItems
  runItemOutputs
  queue
  transcript
  hasMoreOlder
  olderBeforeOrdinal

TranscriptTurn
  run
  triggerMessage
  assistantMessage
  steeringMessages
```

The exact Go-owned contract should be defined in `internal/httpapi` and generated
into TypeScript. If a flatter shape is cleaner for virtualization, the same
principle still applies: the backend returns ordered transcript entries, and the
renderer renders them in that order.

## Backend Plan

1. Define the transcript projection contract.

   Add owner-defined Go types for `TranscriptTurn` or `TranscriptEntry` and
   expose them through the `MessagePage` response. Regenerate the TypeScript
   contract after changing the endpoint-owned HTTP contract.

2. Build transcript projection from validated backend state.

   The projection should group records by run:

   - normal sent turns use the trigger user message and assistant message
   - queued-but-not-promoted turns have a trigger user message and no assistant
     message
   - promoted queued turns use the same trigger user message plus the newly
     created assistant message
   - terminal turns keep their assistant message and terminal run status
   - steering messages remain associated with their active run and are ordered by
     backend metadata

3. Keep durable ordinals as storage metadata.

   Avoid repeated renumbering of message files when queued turns are promoted.
   Renumbering would make promotion mutate unrelated queued messages and would
   turn a presentation concern into filesystem churn.

4. Make pagination transcript-aware.

   Page boundaries should not split a turn in a way that makes the renderer
   guess how to stitch it back together. If the initial implementation keeps
   message-based pagination internally, the response should still return a
   complete ordered projection for the visible page.

5. Update event handling semantics.

   Event payloads can continue to include changed records, but queue promotion
   should give the renderer enough backend-owned state to update the transcript
   order without reconstructing queue behavior. Reasonable options:

   - include an updated transcript turn in promotion-related events
   - trigger a narrow backend resync for the affected conversation page
   - include the ordered transcript projection in queue update events

   Prefer the smallest contract that keeps the renderer dumb and deterministic.

6. Preserve strict direct-load behavior.

   If a run references a missing trigger message or an invalid assistant message,
   projection building should fail specifically for that conversation and report
   structured diagnostics through the existing corruption path.

## Renderer Plan

1. Render backend transcript order directly.

   Replace message ordinal rendering in the transcript with the backend
   projection. The renderer may maintain ID maps for efficient lookup, but it
   should not decide that `Q1` belongs before `A1` or after `A1`; the backend
   projection decides that.

2. Keep virtualization entry-based.

   Virtualize turns or backend transcript entries rather than raw messages. A
   turn row can render the trigger message, assistant message, associated run
   activity, and approval controls without scanning unrelated records.

3. Make active streaming stable.

   Streaming assistant deltas should update the assistant slot in the active
   turn. Queued messages should remain later turns. When a queued turn is
   promoted, its assistant slot appears in that same turn, before the next queued
   turn.

4. Fix chat pane layout as a contract.

   Define the chat detail pane as a stable vertical stack:

   - fixed header
   - optional notices/diagnostics
   - transcript region with `min-height: 0` and `flex: 1` or equivalent
   - composer pinned after the transcript region

   The transcript root and virtualized list root should have explicit stable
   height from the parent, not implicit content height.

5. Add DOM hooks for verification.

   Add stable test ids for:

   - chat detail pane
   - transcript region
   - virtualized transcript scroller
   - composer
   - queued turn rows
   - assistant turn rows

## Recorder Plan

The latest recording had screenshots and event logs, but not enough computed
layout data. Extend the recording harness to capture structured layout snapshots
for core chat regions.

Suggested metrics:

- viewport size
- chat detail pane bounding box
- transcript bounding box
- transcript scroll height/client height
- composer bounding box
- selected conversation id
- visible message or turn ids
- active run status
- queue size

Capture snapshots on:

- renderer load
- conversation selection
- send/queue/steer actions
- run status changes
- before app quit

This should make future reports answerable from logs without relying only on
screenshots.

## Verification Plan

This change touches chat workflow, run lifecycle, queueing, event streaming,
generated backend contracts, renderer chat state, and transcript UI. It is
incomplete without deterministic app-boundary workflow tests through production
Electron/main/preload/renderer/HTTP/store paths with temporary app data.

Required deterministic workflow coverage:

- open a workspace
- create a chat
- send a long-running prompt through a scripted harness
- queue at least three follow-up messages while the run is active
- verify the backend drains runs sequentially
- verify the transcript displays `A1, Q1, A2, Q2, A3, Q3` for the relevant turn
  sequence
- reload/restart and verify the same transcript order comes from durable state
- cancel an active run with queued work and verify queued work is preserved or
  promoted according to product rules
- fail an active run with queued work and verify queued work behavior
- steer an active run and verify steering messages remain associated with the
  active run
- assert transcript region height is large enough to occupy the available chat
  pane between header/notices and composer
- assert composer remains visible and does not overlap transcript content

Focused backend tests should cover:

- transcript projection for normal turns
- queued-but-not-promoted turns
- promoted queued turns
- multiple queued turns promoted one at a time
- terminal runs
- corrupt run/message link diagnostics
- pagination boundaries

Focused renderer tests should cover:

- rendering backend-provided transcript order without sorting by message ordinal
- streaming updates to an existing transcript turn
- queued turn promotion inserting the assistant slot before the next queued turn
- layout component structure and stable test ids

When `.env` contains `OPENAI_API_KEY`, run the live Codex E2E tests because this
touches chat workflow, Codex harness behavior, run lifecycle, queueing, and
streaming. If credentials are absent, report the skip explicitly and do not
treat the skip as provider-integration proof.

Before committing implementation, run:

```sh
./scripts/format.sh
./check_quality.sh --all
```

Run `./scripts/check_supply_chain.sh` only if dependency manifests, lockfiles,
package manager configuration, Go module configuration, or supply-chain tooling
change.

## Rollout Sequence

1. Add backend transcript projection types and focused Go tests.
2. Add the projection to `MessagePage` and regenerate TypeScript contracts.
3. Update message-page, send, queue, steer, and event flows to expose or refresh
   the projection.
4. Update renderer store state to hold the projection and ID indexes.
5. Update transcript rendering to virtualize backend transcript entries.
6. Fix the chat pane layout stack and add stable test ids.
7. Remove any old state assumptions that conflict with the new transcript
   contract. Do not add migration or compatibility code.
8. Extend recording layout snapshots.
9. Add deterministic app workflow coverage for queue ordering, restart, and
   transcript height.
10. Run required verification and record any live-provider skip reason.

## Open Questions

- Should steering messages render inside the active assistant turn, between run
  activity rows, or as separate backend transcript entries?
- Should queued-but-not-promoted turns remain in the transcript or move to a
  dedicated queue surface while the active assistant is still streaming?
- Should run activity belong visually to the turn, to the assistant message, or
  to a separate timeline entry inside the turn?
- Which backend callers still need raw `messages` on `MessagePage`, and should
  that field be removed once the transcript projection covers those needs?
