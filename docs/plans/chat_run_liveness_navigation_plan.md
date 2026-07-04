# Chat Run Liveness Navigation Plan

## Goal

Moving away from an in-progress chat and returning to it must not visually imply
that the agent disconnected when the run is still attached and events are still
flowing.

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

Before committing implementation changes, run:

- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

For documentation-only updates to this plan, inspect the diff. No automated
workflow is required unless executable examples, scripts, generated artifacts,
contracts, or code paths change.

## Open Decisions

- Is there any implementation case that truly requires a public non-alarming
  health state, or can snapshot-load verification remain internal as planned?
- Should a provider-active reconciliation result immediately restore
  `attached`, or should `attached` only be restored when the next provider event
  is observed?
- Which typed evidence should count as enough to preserve working state:
  matching active run, active-turn provider refs, current `RunLivenessAttached`,
  explicit provider reconciliation result, or a combination of those fields?

## Success Criteria

- Switching away from an in-progress conversation keeps the sidebar working
  spinner.
- Switching back to an in-progress conversation shows working state unless a
  real degraded liveness event occurred.
- Real stream/provider failures still show reconnecting, lost, retry, and stop
  affordances as appropriate.
- The implementation remains contract-driven and typed across Go, generated
  TypeScript, renderer state, transcript UI, and sidebar UI.
