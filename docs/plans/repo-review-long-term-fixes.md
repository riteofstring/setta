# Repository Review Fix Plan

Date: 2026-06-03

This plan addresses the review findings from the diff against
`ca1141b10ae708c6c614b4889d35c3e8c26d4c0e` with principled fixes rather than
local patches:

- expanded, non-selected workspace conversation lists can go stale in the
  sidebar;
- recovered interrupted runs do not advance persisted unread state;
- conversation loading clears too much state, causing sidebar and chat-pane
  flicker while unrelated components rerender.

## Principles

- Keep backend-owned chat semantics in backend state or store reducers, not in
  component-local caches.
- Treat conversation list summaries as a shared, event-updated data model keyed
  by workspace, not as a side effect of whichever workspace is currently
  selected.
- Use push-based event updates for live chat state. Do not add polling to mask
  stale state.
- Make read/unread state durable and monotonic. Every user-visible assistant or
  terminal run state change must move through one read-relevant marker path.
- Preserve visual continuity during navigation. Do not clear valid previous or
  cached state merely to express that a request is in flight.
- Keep loading state scoped to the exact data dependency that is missing. A
  selected conversation change should not repaint unrelated sidebar rows,
  workspace chrome, settings buttons, or other panes.
- Verify chat behavior through production Electron/main/preload/renderer/HTTP
  and store paths when the change touches event streaming, persistence, or
  workflow state.

## 1. Event-Driven Workspace Conversation Summaries

### Problem

`WorkspaceSidebar` keeps conversation lists for expanded, non-selected
workspaces in component-local `workspaceConversationLists`. Those lists are
loaded once when a workspace is expanded and then treated as fresh forever:

- `chat.conversation.updated` events are applied only to the selected workspace
  in the global chat store.
- the sidebar-local cache does not subscribe to chat events;
- once a non-selected workspace has a cached list, expansion no longer reloads
  it.

As a result, unread indicators, active run ids, message counts, updated titles,
and newly created conversations in other expanded workspaces can remain stale
until the workspace is selected or the sidebar remounts.

### Target Design

Move conversation summary ownership out of `WorkspaceSidebar` and into a store
model that is keyed by workspace id.

The selected workspace should continue to have full conversation detail state:
message page, transcript, active run, queue, run items, and operations. Conversation
list summaries should be separate shared state:

- `conversationListsByWorkspaceId[workspaceId]`
- loading and error state per workspace
- corruption and diagnostics per workspace
- last loaded or initialized marker for explicit loading state only, not for
  freshness polling

All visible sidebar rows should be derived from this shared model. The selected
workspace conversation list and background expanded workspace lists should use
the same update path.

### Implementation Steps

1. Add a workspace-keyed conversation summary slice to the chat store or a
   sibling store owned by chat state.
2. Replace `WorkspaceSidebar`'s local `workspaceConversationLists` state with
   selectors and actions from that store:
   - `ensureWorkspaceConversationList(workspaceId)`
   - `applyConversationList(workspaceId, response)`
   - `applyConversationUpdatedEvent(workspaceId, item)`
   - `clearClosedWorkspaceConversationLists(activeWorkspaceIds)`
3. Keep selected conversation detail state separate from summary state. Loading a
   workspace or selecting a conversation may hydrate both, but summary events
   should not require the selected workspace to match.
4. Change the event reducer so `chat.conversation.updated` updates the
   workspace-keyed summary for `event.workspaceId` regardless of the currently
   selected workspace.
5. Keep detail updates scoped to the selected conversation. Message deltas, run
   item updates, queue updates, and transcript mutations should still affect only
   the selected detail view unless the app later gains per-workspace transcript
   caches.
6. Update sidebar selectors to consume the workspace-keyed summary model.
7. Remove component-local load-once freshness assumptions from
   `WorkspaceSidebar`; expansion should call `ensureWorkspaceConversationList`,
   but event updates must be the source of live freshness.
8. Preserve deterministic ordering by reusing the existing conversation summary
   sort function.

### Tests

- Store reducer test: a `chat.conversation.updated` event for a non-selected
  but loaded workspace updates that workspace's cached summary.
- Store reducer test: a `chat.conversation.updated` event for an unloaded
  workspace does not create a misleading complete list unless the store design
  explicitly supports sparse summaries.
- Store action test: closing a workspace removes its conversation summary state
  without disturbing other active workspaces.
- Sidebar model test: multiple expanded workspaces render updated unread and
  active-run state from the workspace-keyed summary model.
- Deterministic Electron E2E: open two workspaces, expand both in the sidebar,
  keep workspace A selected, produce assistant output in workspace B through the
  backend/HTTP path, and verify the workspace B conversation row updates without
  selecting workspace B.
- Deterministic Electron E2E: create a new conversation in a non-selected active
  workspace and verify the expanded sidebar list reflects it through
  `chat.conversation.updated`.

## 2. Read Markers for Recovered Interrupted Runs

### Problem

Startup recovery converts persisted running turns to failed turns, updates the
assistant message to `error`, and persists the failed run. Normal terminal run
paths advance `latestReadRelevantMarker`, but recovery does not.

If a run is interrupted before any assistant delta or approval event advanced
the marker, the recovered error message is user-visible but the conversation
does not become unread after restart.

### Target Design

All terminal run transitions that create user-visible assistant state should use
one read-relevant marker path, including recovery.

Recovery is a persistence repair path, not a live harness path. It should:

- persist the failed run and errored assistant message;
- reconcile pending steering messages;
- advance the conversation's latest read-relevant marker exactly once for that
  recovered run;
- leave already-failed recovered runs idempotent on future restarts;
- avoid relying on renderer lifecycle to infer unread state.

### Implementation Steps

1. In `recoverInterruptedRun`, after the failed turn records are persisted and
   pending steering messages are reconciled, call the same marker advancement
   path used by normal terminal turns.
2. Use the recovery timestamp already assigned to `run.CompletedAt` and
   `message.UpdatedAt` as the marker update timestamp.
3. Keep the marker advancement inside the recovery transaction boundary as much
   as the file store allows. If a helper is needed, extract a small service-level
   function for "persist terminal read relevance" instead of duplicating marker
   mutation logic.
4. Do not publish extra UI events solely for startup recovery. The durable marker
   must be visible through `ListConversations` after service construction; live
   event publication during constructor recovery is not the contract.
5. Ensure a second restart does not advance the marker again, because the run is
   no longer `running`.

### Tests

- Backend service test: create persisted running turn records with no prior read
  marker advancement, construct a new service, and assert the recovered
  conversation list item has `latestReadRelevantMarker > readMarker`.
- Backend service test: mark that recovered conversation read, construct another
  service, and assert both markers remain unchanged.
- Backend service test: recovered assistant message remains `error` and run
  remains `failed`, preserving existing recovery assertions.
- Deterministic Electron E2E, if feasible: launch with a fixture containing an
  interrupted running turn, verify the conversation is unread after startup,
  select it, verify the marker clears, restart, and verify it stays read.

## 3. Flicker-Free Conversation Navigation

### Problem

Selecting or loading a conversation currently causes broad state churn:

- conversation lists can render transient "Loading chats", "No chats", or
  workspace-level empty states even when the app already has usable cached data;
- the main chat pane can briefly drop the selected transcript and render a
  workspace loading or empty message before the requested conversation appears;
- global chat operation/status state is passed through large view objects, so
  unrelated sidebar and pane components rerender during conversation selection;
- the UX makes fast operations look slow because the app intentionally paints an
  intermediate loading frame.

This is a state modeling problem. A loading label or a delayed spinner would be
a bandage; the principled fix is to stop destroying renderable state during
navigation and to make data dependencies explicit.

### Target Design

Adopt a stale-while-revalidate chat navigation model with per-workspace and
per-conversation caches.

Conversation selection should be a small state transition:

- update the selected workspace/conversation ids immediately;
- render cached conversation detail immediately when available;
- keep the previous conversation detail visible until the next selected
  conversation's first page is ready when no cache exists;
- never replace a known conversation list with an empty list just because a load
  request is in flight;
- revalidate summaries and detail pages in the background and patch them in when
  they arrive;
- reserve loading UI for true cold-start states where there is no previous,
  cached, or server-provided state to render.

The sidebar should not have a "Loading chats" steady-state row for normal
workspace expansion or conversation selection. Known lists remain visible while
they refresh. Unknown lists may show no child rows until the first response
arrives, but they should not flash through false empty states.

### Store Shape

Split chat state by ownership and invalidation boundary:

- `selection`: selected workspace id and selected conversation id.
- `conversationSummariesByWorkspaceId`: durable list summaries, corruption, and
  diagnostics keyed by workspace id.
- `conversationDetailsById`: first page, transcript, queue, active run, run
  items, output page state, and request state keyed by conversation id.
- `operationsByConversationId`: send, queue, steering, approval, cancellation,
  and detail-load state scoped to the conversation they affect.
- `globalChatStatus`: backend availability or event-stream health only, not
  conversation selection progress.

Components should subscribe to narrow selectors with stable equality. Avoid
constructing one large `ChatView` object in `App` that changes identity for every
chat store patch and forces broad rerenders.

### Backend and Data Flow

1. Keep `ListConversations` fast and summary-only. It should not block on detail
   page work.
2. Keep `LoadMessagePage` detail-specific and cache the first page by
   conversation id in the renderer store.
3. Consider adding a batched "open workspace chat state" endpoint only if
   profiling shows startup requires multiple dependent round trips. That endpoint
   should return the selected workspace summaries and selected conversation first
   page in one response, without becoming a separate hand-maintained contract
   list.
4. Prefetch detail pages for the currently selected conversation and, after the
   main render is stable, the next few visible conversation rows. Prefetch must
   be bounded and cancelable, with no polling.
5. Revalidation responses must be applied only if their workspace/conversation
   ids still match the cache entry they target. Stale responses may update cache
   data but must not overwrite current selection or global status.

### Implementation Steps

1. Replace selection-time `beginOperation` patches that clear conversations,
   selected conversation, messages, transcript, run items, and queued runs with
   targeted request state on the relevant workspace or conversation cache entry.
2. Introduce a `conversationDetailsById` cache and hydrate it from
   `messagePage`, send/queue/steer command results, and event-stream updates.
3. Change `ChatPanel` to read the selected conversation detail by id. It should
   render cached selected detail immediately, keep previous detail during a cold
   transition, and only show an initial empty state after the selected workspace
   and conversation list are known to be empty.
4. Change `WorkspaceSidebar` to render known summaries while refreshes are in
   flight. Remove normal-path "Loading chats" rows and false "No chats" rows.
5. Replace broad `chatBusy` and `busy={workspace.busy || chat.operation !== null}`
   propagation with scoped disabled states. A message send should not disable
   workspace rows unrelated to that conversation.
6. Move store subscriptions down from `App` into `ProjectPane`, `ChatPane`,
   `WorkspaceSidebar`, and transcript/composer subcomponents using narrow
   selectors and shallow equality.
7. Memoize pure sidebar and transcript row models by input slices instead of
   rebuilding all rows for unrelated chat detail updates.
8. Add performance instrumentation around conversation selection: render counts
   for sidebar rows, chat pane shell, transcript rows, and composer; time from
   click to stable transcript; backend request count; and DOM node count.
9. Record before/after measurements in an append-only performance report before
   and after the refactor.

### Tests

- Store test: selecting a conversation with a cached detail page does not clear
  messages, transcript, or conversation summaries.
- Store test: selecting an uncached conversation preserves previous renderable
  detail until the requested page arrives and then swaps atomically.
- Store test: loading a workspace never replaces a known conversation list with
  `[]` solely because `loading` is true.
- Renderer test: sidebar rows do not render "Loading chats" during normal
  selected-conversation changes when summaries are cached.
- Renderer test: unrelated sidebar workspace rows do not rerender when only the
  selected conversation detail changes.
- Deterministic Electron E2E: click between conversations with populated
  transcripts and assert there is no intermediate "Loading workspace chats",
  "Loading chats", false "No chats", or workspace empty state frame.
- Deterministic Electron E2E: measure and assert bounded render counts or use a
  committed performance trace for the conversation-switch path.

## Sequencing

1. Implement backend recovery marker advancement first. It is narrowly scoped and
   protects durable read semantics.
2. Implement the workspace-keyed conversation summary store and event reducer
   changes.
3. Refactor conversation detail state into per-conversation caches and remove
   clear-to-empty selection transitions.
4. Refactor `WorkspaceSidebar` and `ChatPanel` to consume narrow selectors from
   the shared summary/detail models.
5. Add focused unit/store/render tests before broad Electron workflows.
6. Baseline conversation-switch performance, re-measure after the refactor, and
   append both results to the performance report.
7. Run the deterministic chat workflow tests once focused verification passes.

## Verification Commands

Focused checks during implementation:

```sh
./scripts/go.sh test ./internal/chat -run 'TestServiceRecoversInterruptedRunningTurns|TestServicePersistsReadMarkersAcrossRestart'
pnpm --dir desktop vitest run src/renderer/src/components/workspace-sidebar-model.test.ts src/renderer/src/components/chat-panel.test.tsx src/renderer/src/stores/chat-store.test.ts src/renderer/src/stores/chat-store-workspace.test.ts
pnpm --dir desktop typecheck
```

Required final checks before committing executable changes:

```sh
./scripts/format.sh
./check_quality.sh --all
```

Because these fixes touch chat workflow state, event streaming, persistence, and
renderer chat state, deterministic end-to-end Electron workflow coverage is
required. If `OPENAI_API_KEY` is present in `.env`, also run the live Codex E2E
tests; if it is absent, report the live-provider skip without treating it as
provider integration proof.
