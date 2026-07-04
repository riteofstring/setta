# Chat Run Liveness Navigation Plan

## Goal

Moving away from an in-progress chat and returning to it must not visually imply
that the agent disconnected when the run is still attached and events are still
flowing.

This plan also covers three adjacent chat UI reliability issues that affect the
same active-work experience:

- expanded activity/tool rows should stay streamlined while giving opened
  details enough structure to read clearly;
- scrolling up from the transcript bottom must detach immediately and never
  fight the user;
- the agent's current todo list should have a persistent active-run surface,
  rather than only appearing as another activity row.

The chat UI should communicate two separate facts:

- The run state: idle, working, awaiting approval, queued, cancelling, complete,
  failed, or cancelled.
- The connection health: healthy, resyncing, degraded, lost, or terminal.

Normal conversation navigation and active-run snapshot refreshes are internal
health checks, not reconnect events.

## Current Symptom

The latest recording at `.recordings/20260703T033453Z` shows this sequence:

- A message is sent in `conversation_92213aaae5a3177a5fd5d5e49485e784`.
- The run remains active as `run_fb65cc3649acef966fb52197ba510311`.
- The backend event stream connects once and does not log a disconnect.
- Chat transcript and assistant text events continue to arrive while the user
  switches conversations.
- When the user selects a new empty conversation, the main chat pane correctly
  shows the empty state for that selected conversation.
- The in-progress conversation row in the sidebar changes from the normal
  working spinner to the reconnecting indicator.
- When the user reselects the in-progress conversation, the transcript shows
  `Reconnecting` even though `chat:active-run` returns the same run as
  `running` and provider events continue afterward.

The visual problem is real, but the recording does not show a transport
disconnect.

## Root Cause

`/chat/runs/active` currently performs snapshot-load reconciliation before
returning the active run:

- `internal/httpapi/chat_handlers.go` calls
  `ReconcileActiveRuns(..., RunLivenessReasonSnapshotLoad)`.
- `internal/chat/service_reconciliation.go` marks the run liveness as
  `reconciling`.
- `desktop/src/renderer/src/lib/chat-run-liveness.ts` maps all
  `reconciling` liveness to `Reconnecting`.
- Transcript and sidebar rendering use that presentation directly.

That makes an ordinary selected-conversation refresh look like a connection
failure. The same state also pollutes the conversation list item, so unselected
running conversations can show the reconnecting icon instead of the working
spinner.

## Additional Findings

### Activity Styling

The `setta-3` branch rendered run activity in
`desktop/src/renderer/src/components/chat-run-activity.tsx`. That version used
a slim activity summary, a light left rail for opened details, and bounded
`pre` blocks for commands, files, output, and JSON details.

The current renderer keeps the improved chronological grouping model in
`desktop/src/renderer/src/components/chat-transcript-activity.tsx`, but the
opened state is visually weaker:

- the activity group header provides useful contrast between grouped tool calls
  and regular messages, and should keep that strong separator role rather than
  reverting to the flatter `setta-3` treatment;
- the opened activity group still needs cleaner hierarchy beneath the header so
  the member tool-call list reads as structured transcript activity instead of a
  bulky nested container;
- the opened individual tool call uses the left rail, but command details are
  flattened into unframed text;
- opened individual tool-call details lose the clear distinction between
  summary, metadata, cwd, command, arguments, result, error, and inspectable
  output blocks.

The long-term fix should keep the current streamlined transcript grouping and
status icons, while borrowing the clearer detail treatment from `setta-3`.

### Scroll Follow

The upward-scroll resistance is diagnosable from
`desktop/src/renderer/src/components/chat-transcript-scroll-follow.ts`.

The hook can enter `user_detached` on an upward wheel event, then immediately
return to `auto_follow` because `handleScroll`, `handleRangeChanged`, and
`handleAtBottomStateChange` treat the tolerant bottom band as enough evidence to
reattach. While still within that band, the scheduled `scrollToLatest()` call can
snap the transcript back to the bottom. The user has to keep scrolling until the
viewport escapes the tolerance zone.

The fix is not more logging by default. If a deterministic reproduction fails,
temporary scroll instrumentation can be added to capture `mode`, scroll metrics,
range updates, and scheduled auto-scrolls during a recording, then removed before
the implementation is considered complete.

### Codex Todo Lists

Codex models todo lists as long-lived turn state, not as ordinary short-lived
tool calls.

Relevant Codex reference points:

- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/sdk/typescript/src/items.ts`
  defines `TodoListItem` as the agent's running todo list.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server-protocol/src/protocol/v2/turn.rs`
  defines `TurnPlanUpdatedNotification` with typed `TurnPlanStep` entries.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/exec/src/event_processor_with_jsonl_output.rs`
  starts one todo-list item on the first `TurnPlanUpdated`, updates that same
  item on later plan updates, and completes it when the turn completes.

Setta currently handles `turn/plan/updated` in
`internal/chat/codex_harness_notification_handlers.go` by summarizing the raw
plan into a `RunItemTypePlan`. That is technically chronological, but it loses
the structured step state and leaves the current plan buried in the activity
stream.

## Product Contract

- A running conversation with typed evidence of healthy provider attachment or
  event-stream continuity should show the working indicator in both the
  transcript and sidebar.
- A user changing the selected conversation should not downgrade visible run
  health by itself.
- A snapshot-load active-run read may verify liveness in the background, but it
  should not immediately publish a user-facing reconnecting state unless it has
  evidence of real degradation.
- `Reconnecting` should mean recovery is happening after an observed transport,
  stream, provider, or app-server disruption.
- `Connection lost` should mean the system has evidence that the active run
  cannot currently receive or reconcile provider events.
- Snapshot-load verification should stay internal by default. Do not add a
  public `checking` state unless implementation proves no existing contract can
  represent the behavior correctly.
- Expanded activity/tool rows should remain slim transcript rows, but opened
  details should use consistent readable sections for commands, cwd, metadata,
  arguments, output, errors, and result content.
- User scroll intent is authoritative. Any upward wheel, upward keyboard scroll,
  or scrollbar drag toward history should detach from bottom-following until the
  user explicitly returns to the bottom or invokes jump-to-latest.
- The current todo list is active turn state. It should be visible while the
  agent is working, update in place as steps change, and remain linked to the
  chronological transcript without being accessible only through a tool-call
  group.
- When the todo list completes, the current-plan surface should briefly show a
  completed presentation instead of disappearing instantly.
- The active goal remains top-level conversation context. It acts like the
  conversation subject, so it should stay above the transcript rather than move
  into the above-input active-work stack.
- Current plan and background terminals share the above-input active-work stack.
  If both are present, render them in a stable order as separate compact rows:
  current plan first, then background terminals, then the composer.
- Background terminal completion should also have dwell behavior. Successful
  exits may dismiss after a short completed presentation; failed or lost
  terminals should remain until inspected or dismissed.

## Non-Goals

- Do not hide real provider stream failures, provider restarts, app-server
  restarts, or missing provider turns.
- Do not infer health from transcript text, command labels, screenshots, elapsed
  wall-clock time alone, or renderer-only heuristics.
- Do not add backward-compatibility shims, migrations, legacy support paths,
  transitional adapters, dual-read/write paths, old-field aliases, or silent
  compatibility fallbacks. The fix should cut to the new contract directly.
- Do not add a renderer-only compatibility layer that rewrites backend liveness
  states without a matching contract decision.
- Do not create a second untyped lifecycle state machine beside the Go-owned
  chat run contracts.
- Do not manually edit generated TypeScript outputs.
- Do not parse todo text or summary strings to infer plan steps. Use the typed
  Codex plan notification contract.
- Do not keep old unstructured plan-summary behavior alive through compatibility
  fallbacks.
- Do not add persistent scroll logging as part of the final fix.

## Target Model

The durable fix is to split active-run presentation from connection-health
diagnostics.

Recommended contract shape:

- Keep `Run.status` as the source of truth for whether work is active.
- Keep `RunLiveness` as the source of truth for provider attachment and
  recovery diagnostics.
- Prefer making snapshot-load reconciliation internal until it finds a real
  problem. Add a new public health state only if the implementation proves the
  existing contract cannot represent healthy snapshot verification correctly.
- Preserve typed liveness reasons, but classify them for UI presentation.

The important distinction is:

- `snapshot_load`: ordinary verification after loading or reloading run state.
  It should not produce `Reconnecting` while typed active-run, provider-ref, or
  provider-reconciliation evidence says the run is still healthy.
- `stream_resync`, `provider_restarted`, `provider_unavailable`,
  `attachment_missing`, and missing provider turn outcomes: real degraded or
  terminal states that may show reconnecting, lost, failure, or retry controls.

The UI should derive:

- transcript run row: working, awaiting approval, reconnecting, lost, failed,
  or terminal;
- composer controls: steer/stop/retry availability from active run plus
  connection health;
- sidebar indicator: working spinner for healthy active work, reconnecting only
  for real recovery, lost only for real lost state.

## Implementation Plan

### Phase 1: Classify Snapshot-Load Reconciliation

Audit all call sites that invoke `ReconcileActiveRuns` with
`RunLivenessReasonSnapshotLoad`.

Remove or replace the incorrect visible-state transition directly. Do not keep a
legacy `reconciling/snapshot_load` UI path alive behind compatibility handling.

Default implementation: return a non-published health-check result when the
provider reports the turn is still in progress. Keep or restore `attached` for a
healthy active turn. Publish only when the check finds real degraded or terminal
evidence.

Do not add a public `checking` status in this phase. Reconsider a contract
change only if preserving healthy state without a new status would require
ambiguous or duplicated lifecycle state.

### Phase 2: Preserve Healthy Visible State

When a snapshot-load check starts for a run with typed evidence of healthy
attachment, preserve the prior visible health. Do not overwrite the
conversation-list liveness with `reconciling/snapshot_load`.

Typed evidence can include a matching active run, active-turn provider refs,
current `RunLivenessAttached`, or an explicit provider reconciliation result.
Do not use elapsed wall-clock time alone as the deciding signal.

If the provider check later returns active/in-progress, keep or restore the
healthy visible state. If it returns missing, idle, system error, or unavailable,
publish the existing degraded or terminal liveness transition.

Preserve existing degraded states such as `stream_resync`,
`provider_restarted`, and `lost`; snapshot-load reconciliation must not hide or
downgrade real recovery state.

This phase should be implemented in the Go service layer, not as a renderer
label workaround.

### Phase 3: Make Renderer Presentation Exhaustive

Update renderer liveness presentation so status and reason are handled
explicitly and exhaustively:

- healthy active run: working spinner;
- snapshot verification: working spinner unless it discovers real degradation;
- stream resync/provider restart: reconnecting;
- provider unavailable/attachment missing: connection lost or failed state;
- terminal: no active indicator.

The sidebar should use the same presentation classification as the transcript
and composer so the selected and unselected conversation states cannot drift.

### Phase 4: Conversation Switching Regression

Add deterministic Electron E2E coverage through production
Electron/main/preload/renderer/HTTP/store paths:

- open a temporary workspace;
- create a chat and send a message through a scripted provider;
- stream enough assistant output that the run is visibly active;
- switch to a new or different conversation;
- assert the original conversation row still shows the working spinner, not the
  reconnecting icon;
- switch back to the in-progress conversation;
- assert the transcript and composer present working state, not reconnecting;
- continue streaming and complete the run.

Add a separate degraded-health case:

- simulate a provider stream disconnect or provider restart;
- assert the sidebar and transcript show reconnecting or lost only in that real
  degraded case;
- assert retry/stop controls still match the liveness contract.

### Phase 5: Live Provider Sanity Check

For changes that touch live Codex provider integration, run live Codex E2E tests
when local ChatGPT auth is available. Do not use `OPENAI_API_KEY`. If ChatGPT
auth is unavailable, record the skip explicitly and do not treat the skip as
provider-integration proof.

### Phase 6: Activity Row Visual Polish

Keep the current transcript projection, virtualization behavior, controlled
expansion state, and status icons. Do not reintroduce the old `details`-owned
state model from `setta-3`.

Revise the presentation so opened activity reads like a slim transcript detail
view:

- preserve the current high-contrast activity group header so grouped tool calls
  remain visually distinct from regular chat messages;
- clean up the opened member list beneath that header with only enough
  indentation/rail treatment to show hierarchy;
- preserve the compact row height and current icon/status treatment;
- restore coherent opened tool-call details, with consistent bounded code/pre
  treatment for commands, files, output, arguments, and JSON details;
- keep metadata chips restrained and avoid nested cards;
- make individual row expanded states structurally clear without increasing
  density or adding decorative containers.

Use the `setta-3` styling as reference material, not as a direct copy. The
target is the current streamlined UI with clearer opened details.

### Phase 7: Scroll-Follow Detach Fix

Separate two concepts in the scroll-follow controller:

- bottom tolerance while already attached, used to keep streaming content pinned
  naturally;
- explicit reattach criteria after user detach, which should be stricter and
  require a real return to the bottom or jump-to-latest.

Implementation direction:

- cancel any pending auto-scroll as soon as upward wheel, upward key, or
  scrollbar-history intent is observed;
- while mode is `user_detached`, ignore tolerant-bottom reattachment from range
  changes and ordinary scroll events;
- allow reattach only through jump-to-latest, a strict bottom signal, or a
  deliberate downward scroll that reaches the actual bottom;
- prevent `handleRangeChanged` and `handleAtBottomStateChange` from scheduling
  `scrollToLatest()` while the user is detached inside the tolerance band.

Prefer extracting the scroll-follow decision rules into a small testable helper
so the detach and reattach behavior can be covered without relying only on DOM
timing.

### Phase 8: Current Todo List Surface

Treat Codex plan updates as structured active-turn state.

Backend contract work:

- decode `turn/plan/updated` with the generated
  `DecodeTurnPlanUpdatedNotification` path;
- store typed plan steps with status values `pending`, `inProgress`, and
  `completed`;
- include the explanation if the provider sends one;
- keep `RunItemTypePlan` as the chronological transcript anchor, but enrich it
  with structured plan details instead of only a summary string;
- expose a current active plan projection for the selected conversation/run.

Renderer work:

- add a compact current-plan footer/surface near the composer, in the same
  active-work stack as background terminals;
- show progress and the current in-progress step in the collapsed affordance;
- expand to a readable list with completed, in-progress, and pending states;
- update in place as plan updates arrive, even while other activity rows stream;
- when the owning turn completes, transition to a `complete` presentation with
  checked items and a clear completed indicator for a short minimum dwell, such
  as 1500ms;
- do not auto-dismiss the completed surface while it is expanded, hovered, or
  keyboard focus is inside it;
- keep transcript plan rows as chronological anchors, with a path from the row
  to the current-plan surface when the run is active.

The current-plan surface should be conversation-scoped and disappear when there
is no active or recently completed plan for the selected conversation. Completed
plans remain available through the transcript history rather than a permanent
footer.

### Phase 9: Active Work Stack And Dwell

Introduce a single above-input active-work stack for turn-local live work:

- current plan;
- background terminals;
- any future active-run surfaces with the same lifecycle semantics.

Keep `GoalStatus` as top conversation chrome. The goal frames the whole
conversation and should not be duplicated in the active-work stack. Pending goal
submission, active, paused, blocked, budget-limited, usage-limited, and complete
goal states remain in the top strip.

Stack behavior:

- render current plan above background terminals when both are present;
- keep each collapsed row compact and independently readable;
- cap expanded panel height so the composer remains reachable;
- allow one large expanded panel at a time unless implementation proves multiple
  expanded panels remain usable on small viewports;
- preserve keyboard focus and hover state when deciding whether an item may
  auto-dismiss.

Terminal dwell behavior:

- when the last running terminal exits successfully, show an exited/completed
  presentation for a short minimum dwell, such as 1500-3000ms;
- do not auto-dismiss while the terminal monitor is open, hovered, or focused;
- keep failed or lost terminals visible until the user inspects or dismisses
  them, because those states are actionable;
- keep chronological background-terminal transcript markers as history, while
  live terminal state belongs to the active-work stack.

## Verification Plan

Start narrow:

- Go service tests for snapshot-load liveness preservation and degraded
  transition behavior.
- Renderer unit tests for sidebar/transcript/composer liveness presentation.
- Store tests for selected and unselected conversation liveness updates.

Then run production-path workflow coverage:

- deterministic Electron chat workflow for conversation switching during an
  active run;
- deterministic Electron chat workflow for real reconnect/lost signaling.
- deterministic Electron chat workflow for scrolling up from the bottom while
  output continues to stream, asserting the transcript stays detached until the
  user returns to the bottom or jumps to latest;
- deterministic Electron chat workflow for plan updates, asserting the current
  todo surface appears, updates steps in place, shows a completed presentation
  on run completion, respects the minimum dwell, and then clears when the user is
  not interacting with it;
- deterministic Electron chat workflow where a current plan and a background
  terminal are active together, asserting both compact rows appear in the shared
  above-input stack in the stable order;
- deterministic Electron chat workflow for background terminal completion,
  asserting successful exits dwell briefly, failed/lost terminals persist until
  inspected or dismissed, and no auto-dismiss occurs while hovered, focused, or
  expanded;
- renderer/component coverage asserting goal status remains above the transcript
  and is not duplicated in the active-work stack;
- renderer/component coverage for opened activity group and opened activity row
  markup, with stable assertions for the detail sections and command/output
  blocks.

Before committing implementation changes, run:

- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

For documentation-only updates to this plan, inspect the diff. No automated
workflow is required unless executable examples, scripts, generated artifacts,
contracts, or code paths change.

## Progress

### 2026-07-03: Snapshot-Load Liveness Preservation

Implemented the service-layer portion of Phase 1 and Phase 2:

- snapshot-load reconciliation now preserves visible `attached` liveness for a
  healthy active run instead of publishing `reconciling/snapshot_load`;
- snapshot-load checks still run against the provider when provider refs are
  available, and real unavailable/missing/terminal provider results still
  publish the existing lost or terminal transitions;
- existing degraded visible states such as `stream_resync`,
  `provider_restarted`, and `lost` are preserved instead of being overwritten by
  `snapshot_load`;
- internal reconciliation and provider-event generations prevent stale
  snapshot-load results from downgrading or interrupting a run after fresh
  provider events have arrived.

Verification performed:

- `./scripts/go.sh test ./internal/chat -run 'TestService(Reconcile|Snapshot|ProviderLifecycle|RetryableProvider|NonRetryableStream)'`
- `./scripts/go.sh test ./internal/chat`
- `./scripts/test_chat_workflows.sh --deterministic-only`
- `./scripts/test_chat_workflows.sh --live-only`

Remaining work:

- Phase 4 dedicated Electron assertions were added in the conversation-switch
  liveness coverage entry below.

### 2026-07-03: Renderer Liveness Presentation Classification

Implemented Phase 3 for renderer presentation:

- centralized run-liveness UI classification in
  `desktop/src/renderer/src/lib/chat-run-liveness.ts`, using generated
  `RunLivenessReason` values in an exhaustive `satisfies` mapping;
- made snapshot-load, wake-recheck, provider-ref-pending, and provider-turn-
  linked reconciliation present as visible working state instead of
  reconnecting;
- kept real recovery states such as `stream_resync`, `provider_restarted`, and
  `user_retry` presenting as reconnecting, and unavailable/missing/turn-not-
  found states presenting as lost;
- routed transcript live run rows and sidebar conversation indicators through
  the shared presentation classifier so they match composer behavior;
- updated deterministic Codex protocol workflow assertions so `wake_recheck`
  remains a non-alarming working presentation while provider restart and stream
  error cases still require reconnecting/lost presentation and retry/stop
  controls.

Verification performed:

- `pnpm vitest run src/renderer/src/lib/chat-run-liveness.test.ts`
- `pnpm vitest run src/renderer/src/App.test.tsx`
- `node desktop/tests/electron/chat-workflows.test.mjs --codex-protocol-only`
- `./scripts/test_chat_workflows.sh --skip-build --live-only`
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

Follow-up audit verification:

- `./scripts/go.sh test ./internal/chat -run 'TestService(Reconcile|Snapshot|ProviderLifecycle|RetryableProvider|NonRetryableStream)'`
- `pnpm vitest run src/renderer/src/lib/chat-run-liveness.test.ts`
- `pnpm vitest run src/renderer/src/App.test.tsx`
- `node desktop/tests/electron/chat-workflows.test.mjs --codex-protocol-only`
- `./scripts/test_chat_workflows.sh --deterministic-only` passed on the
  follow-up audit run, including `conversation-switch`, `transcript-scroll`, and
  `transcript-scroll-reload`. The earlier Phase 7 timeout was not reproduced in
  that run.
- `./scripts/test_chat_workflows.sh --skip-build --live-only`

Remaining work:

- Phase 4 dedicated Electron assertions were added in the conversation-switch
  liveness coverage entry below.
- Phase 7 remains required as product work from the recorded scroll-follow
  symptom, but it is not currently blocking the deterministic chat workflow
  gate.

### 2026-07-02: Conversation-Switch Liveness Regression Coverage

Implemented Phase 4 as dedicated production-path Electron coverage:

- added a Codex protocol workflow that starts an active run, navigates to a new
  empty conversation, asserts the original conversation sidebar row still shows
  the working indicator, switches back through `/chat/runs/active` snapshot
  loading, asserts the transcript and composer still present working state, then
  steers the run to completion;
- extended the degraded-health protocol workflows so provider restart,
  retryable stream resync, and nonretryable stream loss assert the sidebar DOM
  indicator matches the transcript state;
- extended the fake Codex app-server fixture with a controlled
  `liveness navigation workflow` active turn and `turn/steer` completion path
  for that scenario.

Verification performed:

- `node desktop/tests/electron/chat-workflows.test.mjs --codex-protocol-only`
- `./scripts/format.sh`
- `./scripts/test_chat_workflows.sh --deterministic-only`
- `./scripts/test_chat_workflows.sh --skip-build --live-only`
- `./check_quality.sh --git-changes`

Remaining work:

- Phase 5 live-provider sanity was completed for this slice.
- Next implementation work starts at Phase 6 unless Phase 7 scroll-follow
  detach behavior is prioritized first.

### 2026-07-02: Activity Row Detail Polish

Implemented the first focused Phase 6 slice:

- kept the existing chronological grouping, high-contrast activity group header,
  virtualization model, and lifted expansion state;
- changed expanded group member rows from card-like containers to a light left
  rail so the group header remains the main separator;
- added stable structured detail sections for opened activity rows, including
  command, cwd, metadata, files, summary, result, error, output, JSON, and exit
  content;
- restored command details to the same bounded `pre` treatment used for files,
  output, and JSON details while preserving syntax highlighting.

Verification performed:

- `pnpm vitest run src/renderer/src/components/chat-transcript-activity.test.tsx src/renderer/src/components/chat-transcript-activity-details.test.tsx`
- `node desktop/tests/electron/chat-workflows.test.mjs --codex-protocol-only`
- `./scripts/format.sh`
- `./scripts/test_chat_workflows.sh --skip-build --live-only`
- `./check_quality.sh --git-changes`

Follow-up audit:

- tightened metadata chip keys so duplicated typed/top-level metadata does not
  produce repeated React keys;
- reran the focused activity transcript tests and Codex protocol workflow;
- reran the required production-path deterministic chat workflow gate for this
  transcript UI change:
  `./scripts/test_chat_workflows.sh --deterministic-only`.

Remaining work:

- Phase 6 may still need visual QA or additional Electron assertions if later
  activity detail variants expose layout issues, but the structured opened-row
  transcript path is now covered.
- Next implementation work starts at Phase 7 scroll-follow detach behavior.

## Open Decisions

- Is there any implementation case that truly requires a public non-alarming
  health state, or can snapshot-load verification remain internal as planned?
- Should a provider-active reconciliation result immediately restore
  `attached`, or should `attached` only be restored when the next provider event
  is observed?
- Which typed evidence should count as enough to preserve working state:
  matching active run, active-turn provider refs, current `RunLivenessAttached`,
  explicit provider reconciliation result, or a combination of those fields?
- Should clicking a chronological plan row open the current-plan surface when
  the run is active, or only focus the transcript row?

## Success Criteria

- Switching away from an in-progress conversation keeps the sidebar working
  spinner.
- Switching back to an in-progress conversation shows working state unless a
  real degraded liveness event occurred.
- Real stream/provider failures still show reconnecting, lost, retry, and stop
  affordances as appropriate.
- Opened activity groups and opened activity rows are easier to scan, with
  commands and outputs clearly framed without card-heavy styling.
- Scrolling upward from the bottom detaches immediately and does not snap back
  while streaming continues.
- Active Codex todo lists are visible in a persistent current-plan surface,
  update in place, briefly show completion before dismissing, and are no longer
  discoverable only as generic tool activity.
- Current plan and background terminals coexist in one above-input active-work
  stack without crowding or competing footers.
- Background terminal success, failure, and lost states do not vanish before the
  user can perceive or inspect them.
- Active goal state remains top conversation context rather than being mixed
  with turn-local active-work surfaces.
- The implementation remains contract-driven and typed across Go, generated
  TypeScript, renderer state, transcript UI, and sidebar UI.
