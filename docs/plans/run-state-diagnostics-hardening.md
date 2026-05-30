# Run State And Diagnostics Hardening

This plan fixes the review findings around confusing chat recovery, swallowed
background failures, invisible backend/event-stream health, ambiguous run
activity pagination, and provider compatibility aliases.

The implementation should keep Go as the durable owner of chat, run, workspace,
diagnostic, and backend-facing state. TypeScript surfaces should continue to be
generated from Go-owned HTTP endpoint contracts and chat event contracts. Do not
add backward-compatibility shims, old-field aliases, migrations, dual-read
paths, or silent fallback behavior. If a durable schema changes, bump the schema
and fail clearly on unsupported local state unless explicit migration work is
approved.

## Goals

- Make run recovery deterministic and user-understandable.
- Ensure every background failure has an owner and a reporting path.
- Surface backend process and event-stream health through pushed UI state.
- Replace ambiguous run activity pagination with stable, item-scoped cursors.
- Remove provider status aliases that are not confirmed current protocol values.
- Establish a small typed diagnostic spine now, without building a broad
  notification product surface prematurely.

## Non-Goals

- Do not build a full notification center, inbox, retention policy, filtering
  UI, or user preference system yet.
- Do not introduce durable compatibility layers for old local data.
- Do not replace the file store with SQLite in this plan. The design should keep
  that door open, but the first implementation should fit the current store.
- Do not add polling for backend or event-stream health.

## Current Problems

### Interrupted Run Recovery Updates The Wrong Message

Normal send assigns the run ID to both the user message and the assistant
message. Startup recovery then finds the first message with that run ID and
marks it `error`. That can mark the user's prompt as errored while leaving the
assistant message `streaming`.

The root problem is that the run does not explicitly identify its assistant
message. Recovery infers ownership from a non-unique relationship.

### Background Turn Failures Are Swallowed

`runHarnessTurn` starts in a goroutine and ignores errors returned by failure,
completion, and harness-reference update paths. If persistence or event
publishing fails during a transition, the run can remain stuck in a confusing
state with no durable diagnostic.

The root problem is that detached background work has no durable supervisor and
no service-level failure-reporting contract.

### Backend And Event-Stream Health Are Mostly Invisible

The Electron main process can detect backend startup failure and unexpected
backend exit, but the renderer has no typed subscription for backend status.
The event-stream loop catches failures and reconnects, but normal users only see
stale chat state until a later operation fails or a manual health refresh runs.

The root problem is that process health and stream freshness are not app state.

### Run Activity Output Pagination Uses The Wrong Cursor

Run item output ordinals are allocated per run item, but the run activity page
uses a single `afterOrdinal` cursor for the entire run. Expanding one activity
row can refetch output from another item or hide later item output indefinitely.

The root problem is that the API cursor does not match the data ownership
boundary users interact with.

### Provider Status Aliases May Hide Protocol Drift

The Codex item status map accepts several spellings for similar states. If every
spelling is part of the current provider protocol, the map is fine but should be
documented as current protocol coverage. If some entries are legacy aliases,
they hide protocol drift and should be removed.

## Design Principles

- A durable state transition should have one owner.
- Recovery should use explicit IDs, not scans or heuristics.
- Corrupt durable state should fail loudly and specifically.
- Transient transport failures may retry, but the UI must know when state is
  reconnecting, stale, or resyncing.
- Event delivery is push-based. Do not add polling as a health workaround.
- Provider protocol values should be declared and validated, not guessed.
- Diagnostics should be typed and code-driven from the start.

## Phase 1: Explicit Run Message Ownership

Extend the Go chat run model so a run explicitly owns its assistant message.

Add fields to `chat.Run`:

- `TriggerMessageID`: already exists and remains the user message that caused
  the run.
- `AssistantMessageID`: new required field for running, completed, failed, and
  cancelled runs. It is empty only while a queued run has no assistant message.

Update validation:

- queued runs require `TriggerMessageID` and must have empty
  `AssistantMessageID`
- non-queued runs require both `TriggerMessageID` and `AssistantMessageID`
- assistant message referenced by `AssistantMessageID` must exist when loading a
  page or recovering an interrupted run

Update service flow:

- `newRunAndAssistantMessage` creates both records and sets
  `Run.AssistantMessageID`
- queued run promotion sets `AssistantMessageID` when it creates the assistant
  message
- recovery loads the assistant message by `AssistantMessageID` and marks that
  message `error`
- if a running run lacks a valid assistant message, backend startup fails with a
  malformed chat state error

Update store APIs:

- add `LoadMessageByID(workspaceID, conversationID, messageID)`
- keep `FindMessageByID` where optional lookup is appropriate
- remove recovery use of `FindMessageByRunID`
- keep `FindMessageByRunID` only if a real production path still needs it; if
  not, delete it

Contract work:

- regenerate TypeScript contracts after changing `chat.Run`
- update renderer code that constructs or asserts runs in tests

Verification:

- add a recovery test with both user and assistant messages sharing the run ID;
  assert the assistant becomes `error` and the user remains `complete`
- add a malformed-state test for a non-queued run with missing
  `AssistantMessageID`
- run `./scripts/go.sh test ./internal/chat`
- run `./scripts/go.sh run ./cmd/generate-contracts`
- run desktop tests that cover generated run fixtures

## Phase 2: Aggregate Store Operations For Turn Transitions

Move multi-file turn transitions behind explicit service/store operations. The
current file store can still perform multiple writes internally, but callers
should not orchestrate partial transitions across scattered methods.

Add aggregate operations around these boundaries:

- `CreateRunningTurn`
- `CreateQueuedTurn`
- `PromoteQueuedTurn`
- `CompleteTurn`
- `FailTurn`
- `CancelTurn`
- `SubmitApproval`
- `ResolveApproval`

Each operation should:

- validate all involved records before writing
- persist the complete durable transition
- return the changed records needed to publish events
- fail with a specific error if an invariant is missing

Do not hide persistence failures behind partial UI success. If a transition
cannot be persisted, return an error and publish or record a diagnostic through
the supervisor path in Phase 3.

Event publishing:

- keep events as a projection of durable state, not the source of truth
- publish after the durable transition commits
- if event publishing fails, record a critical diagnostic and force affected
  renderers to resync when possible

Verification:

- add focused tests for each aggregate operation
- add tests that injected ID/write failures leave no misleading in-memory active
  turn
- keep tests on temporary directories

## Phase 3: Supervised Background Turns

Replace detached best-effort goroutine behavior with a small run supervisor
inside `chat.Service`.

Introduce a service-internal supervisor contract:

- starts harness turns
- receives harness completion/failure/cancel results
- calls aggregate transition methods
- records diagnostics when transition handling fails
- removes active turn state only after durable state reaches a terminal status

Required behavior:

- `StartTurn` failure marks the run failed unless the context was cancelled
  after an explicit user cancel
- `CompleteTurn` persistence failure records a critical diagnostic and leaves
  enough state for resync/debugging
- `FailTurn` persistence failure records a critical diagnostic and keeps the run
  visible as not cleanly resolved
- harness reference update failures are diagnostics, not silently ignored

Add a typed diagnostic model:

```go
type Diagnostic struct {
    SchemaVersion int               `json:"schemaVersion"`
    ID            string            `json:"id"`
    Source        string            `json:"source"`
    Severity      string            `json:"severity"`
    Code          string            `json:"code"`
    Message       string            `json:"message"`
    WorkspaceID   string            `json:"workspaceId"`
    ConversationID string           `json:"conversationId"`
    RunID         string            `json:"runId"`
    OccurredAt    string            `json:"occurredAt"`
    Context       map[string]string `json:"context"`
}
```

Start narrow severity values:

- `info`
- `warning`
- `error`
- `critical`

Start narrow sources:

- `backend`
- `event_stream`
- `chat`
- `workspace`
- `provider`

Store diagnostics under the app data directory as append-only JSON records, or
keep them in memory for the first implementation if all current diagnostics are
also surfaced immediately through events. Prefer durable records for background
transition failures.

Add diagnostic events:

- `diagnostic.created`
- optional chat-scoped wrappers if renderer routing is easier

Do not build a full notification UI. The renderer should initially show only
active operational state and critical recent diagnostics.

Verification:

- add tests where supervisor transition methods fail and diagnostics are
  recorded
- add tests that successful turns do not emit diagnostics
- add tests that active run cleanup happens only after durable terminal state is
  saved

## Phase 4: Backend And Event-Stream Status Spine

Add pushed status events from Electron main to renderer. This should cover
backend process lifecycle and event-stream connection freshness without polling.

Define shared status types in TypeScript:

```ts
type BackendProcessStatus =
  | { status: "starting"; message: string }
  | { status: "online"; url: string; mode: "external" | "spawned"; message: string }
  | { status: "offline"; message: string }
  | { status: "failed"; message: string };

type BackendEventStreamStatus =
  | { status: "connecting"; attempt: number; message: string }
  | { status: "connected"; lastSequence: number; lastStreamId: string; message: string }
  | { status: "reconnecting"; attempt: number; lastSequence: number; lastStreamId: string; message: string }
  | { status: "resyncing"; lastSequence: number; lastStreamId: string; message: string }
  | { status: "stopped"; message: string };
```

Expose through preload:

- `backend.onProcessStatus(listener)`
- `backend.onEventStreamStatus(listener)`
- optionally `diagnostics.onCreated(listener)` once diagnostics are implemented

Main process behavior:

- emit `starting` before `startBackend`
- emit `online` after readiness
- emit `failed` if startup fails
- emit `offline` on unexpected backend exit
- emit event-stream statuses from `startBackendEventStream` lifecycle callbacks

Renderer behavior:

- replace manual-only backend health display with subscribed status state
- keep the manual refresh button as an explicit health request, but do not rely
  on it for process state
- show reconnecting/stale/resyncing state near the backend badge or chat header
- when the stream reports resync-required, show `resyncing` until
  `resyncActiveConversation` completes or fails

Event stream behavior:

- retry transient disconnects
- do not swallow malformed event payloads as ordinary disconnects; report a
  diagnostic/status with the decode error
- after decode errors, reconnect and request resync rather than pretending the
  local projection is current

Verification:

- main-process tests for backend startup failure, readiness, unexpected exit,
  and emitted status events
- renderer store/component tests for backend offline and event-stream
  reconnecting/resyncing states
- event-stream tests for malformed events producing visible status/diagnostics

## Phase 5: Run Item Output Pagination By Item Cursor

Replace run-level output pagination with item-scoped output loading.

Preferred API:

- `GetRunItemOutputPage`
  - `workspaceId`
  - `runId`
  - `runItemId`
  - `afterOrdinal`
  - `limit`

Response:

- `runId`
- `runItemId`
- `output`
- `hasMore`
- `nextOrdinal`

Keep `GetRunActivity` focused on activity items and small embedded previews.
The transcript row expansion should call `GetRunItemOutputPage` for the
specific item being opened.

Backend changes:

- add `LoadRunItemOutputPage(workspaceID, runID, runItemID, afterOrdinal, limit)`
- validate that the run item belongs to the run/workspace
- use the per-item output ordinal as the only cursor
- reject negative limits and negative cursors

Frontend changes:

- change `loadRunActivity` or add `loadRunItemOutput`
- track loaded output per run item
- use each row's `hasMore` and `nextOrdinal` if incremental loading is needed
- avoid merging output from unrelated run items into an expanded row

Contract work:

- add the endpoint to `internal/httpapi` registry
- regenerate generated TypeScript contracts
- remove or narrow any old run-level output pagination fields that no longer
  have a clear meaning

Verification:

- Go test with two run items where both have output ordinal `1`; loading item B
  after item A must return only item B output
- renderer test that expanding one row does not refetch or display another
  row's output

## Phase 6: Provider Protocol Status Audit

Audit Codex app-server item statuses against current protocol documentation or
the app-server contract source.

Classify each accepted value:

- current protocol value
- impossible or obsolete value
- Setta-owned internal value

Then update `codexRunItemStatusByCodexStatus`:

- keep current protocol values
- remove obsolete aliases
- fail on unknown values with `unsupported codex item status: <value>`
- add tests for every current accepted value
- add a test that an unknown value fails loudly

If Codex intentionally emits multiple spellings, document that in a short
comment above the map. The comment should name the protocol source, not describe
it as compatibility behavior.

## Suggested Implementation Order

1. Add explicit `AssistantMessageID` ownership and recovery tests.
2. Introduce aggregate transition methods around the paths touched by recovery,
   completion, failure, cancellation, and queue promotion.
3. Add supervised background turn handling and diagnostics for transition
   failures.
4. Add backend/event-stream status subscriptions through Electron IPC and update
   renderer state.
5. Replace run activity output pagination with item-scoped output pages.
6. Audit and tighten Codex provider status mappings.

This order fixes the highest-risk durable-state confusion first, then adds the
diagnostic/status path needed to avoid creating new silent failure paths while
the app grows.

## Final Verification

For source, generated contract, script, or config changes in this plan, run:

```sh
./scripts/format.sh
./check_quality.sh --all
```

For endpoint or Go-owned contract changes, also run:

```sh
./scripts/go.sh run ./cmd/generate-contracts
```

For dependency manifest or lockfile changes, run:

```sh
./scripts/check_supply_chain.sh
```

Documentation-only updates to this plan do not require the full workflow. Inspect
the diff and state that full verification was skipped because the change was
documentation-only.
