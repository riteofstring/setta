# Review And Workflow Trajectory Implementation Order Plan

Date: 2026-07-03

## Goal

Coordinate implementation of:

- `docs/plans/review_findings_remediation_plan.md`;
- `docs/plans/workflow_agent_trajectory_shared_ui_plan.md`.

The two plans are coherent, but they overlap around workflow-owned chat runs,
liveness, steering, approvals, generated backend contracts, workflow node
activity output, and deterministic Electron coverage. This meta plan defines
the implementation order so those overlaps are handled once at the correct
ownership boundary.

Do not use this document as a replacement for the source plans. Each
implementation step must still satisfy the contracts, non-goals, generated
contract rules, and verification requirements in the source plan that owns that
work.

## Ordering Principles

- Stabilize lifecycle and persistence contracts before exposing new UI controls
  that depend on them.
- Add or reshape Go-owned backend contracts before wiring renderer adapters to
  them.
- Extract shared renderer boundaries before replacing workflow-specific UI
  paths.
- Remove old preview/fallback paths in one cut after their replacement is wired.
- Keep deterministic Electron coverage on production main/preload/renderer/HTTP
  and store paths for chat, workflow, steering, approvals, streaming, liveness,
  and generated-contract changes.
- Avoid compatibility shims, old-field aliases, migrations, dual-read/write
  paths, silent fallbacks, renderer-only lifecycle illusions, and unowned
  TypeScript mirrors.

## Phase 0: Baseline And Scope Control

Read both source plans, `AGENTS.md`, and the current code before editing.

Establish the current state of:

- chat turn startup, workflow send, queued promotion, immediate steering, active
  run lookup, and liveness publication;
- workflow action dispatch, runner refs, activity refs, cancellation, recovery,
  and workflow node details;
- Codex app-server process lifecycle and manager-visible client completion;
- endpoint registry generation and generated TypeScript surfaces;
- Electron test support patterns for browser-side driver code;
- workflow node details activity/output loading and chat transcript components.

Do not start by refactoring the shared UI. The shared UI should be built on top
of hardened lifecycle and backend contracts.

## Phase 1: Lifecycle And Persistence Foundations

Implement these remediation tracks before depending on workflow-owned run state
from the shared trajectory UI.

### 1. Chat Turn Startup Failure Handling

Implement `review_findings_remediation_plan.md` Track 1 first or in parallel
with workflow runner cleanup.

This creates the reliable post-commit startup contract for:

- normal chat sends;
- workflow agent sends;
- queued promotion;
- active/liveness cleanup after synchronous startup failure.

The workflow trajectory UI must not assume a workflow-owned run is attached,
cancellable, steerable, or terminal until this startup contract is reliable.

### 2. Workflow Runner Post-Start Cleanup

Implement Track 6 before wiring workflow-node liveness, steering, approvals, or
runner-ref-based trajectory loading.

The durable requirement is:

- once a runner side effect starts, runner identity is durably attached, or
  deterministic cleanup/manual-recovery state is recorded;
- a workflow node must not remain silently running with a live external runner
  and no durable refs.

The workflow trajectory page may surface manual-recovery state, but it must not
paper over missing refs as an ordinary live run.

### 3. Workflow Version Commit Ordering

Implement Track 5 before adding broad workflow trajectory E2E scenarios that
start executions.

This keeps workflow version labels stable: invalid run attempts do not consume
version numbers, and the first successful execution snapshot is still `v1`.

### 4. Workflow Definition File Atomicity

Implement Track 7 before relying on reload/restart workflow trajectory E2E
coverage.

The shared trajectory plan requires reload/restart behavior for node details.
Those tests should not be confounded by duplicate definition files from normal
renames.

### 5. Codex App-Server Process Lifecycle Ownership

Implement Track 3 before treating app-server protocol/read failure E2E results
as reliable provider lifecycle evidence.

This is not a direct UI dependency, but it protects chat and workflow-agent
tests from stale unreaped provider processes and incorrect client completion.

## Phase 2: Runtime Boundary And Endpoint Guardrails

Implement these before adding new backend endpoints or approval-heavy shared UI
behavior.

### 1. Codex Approval Policy Removal

Implement Track 2 before broadening approval UI reuse.

The shared trajectory approval surface should operate on Setta-supported
approval state only. Deprecated provider policy values such as `on-failure`
must be rejected at Setta runtime boundaries rather than preserved as custom UI
state.

### 2. HTTP Request Boundary Limits

Implement Track 8 before or with any new trajectory, output-loading, approval,
steering, metadata, or image-path endpoints.

Every new endpoint added for the shared trajectory plan must participate in the
Go-owned endpoint registry request-size contract and regenerated TypeScript
surfaces. Do not add endpoint-specific hardcoded mirrors in TypeScript.

### 3. Chat Image Attachment File Selection Limits

Implement Track 9 independently after HTTP limits, or alongside endpoint
metadata work if adding a path-based attachment endpoint.

This track is mostly independent from the workflow trajectory UI. Keep it
separate unless a shared generated metadata surface for limits makes combining
the work cleaner.

## Phase 3: Test Infrastructure Guardrails

Implement Track 4 before adding substantial new Electron coverage for the shared
trajectory plan, or at minimum make new tests comply with the extracted
browser-driver pattern immediately.

The shared trajectory plan requires deterministic E2E coverage for workflow
node activity, pagination, approvals, steering, and reload/restart behavior.
Those tests should not add more large executable browser programs inside string
literals.

## Phase 4: Backend Trajectory Contracts

Implement the shared UI plan's backend contract slice after the lifecycle and
endpoint guardrails above are in place.

Add Go-owned workflow-node-scoped trajectory contracts that include:

- workspace, workflow execution, node execution, and attempt scope;
- conversation and run identity when the node is chat-backed;
- transcript blocks and run activity projections for the selected scope;
- per-run-item output page metadata including `hasMore`,
  `loadedThroughOrdinal`, and `nextOrdinal`;
- active run and liveness state when available;
- pending approval state;
- older-page cursor for the same scope;
- explicit capability flags for steering, stopping, retrying liveness, approval
  submission, output loading, and older-history loading.

Regenerate TypeScript from the Go-owned contracts. Do not keep the old flat
workflow activity preview as a compatibility path.

This phase is the concrete implementation of the workflow node activity output
pagination finding that is deferred in the remediation plan and picked up by the
shared UI plan.

## Phase 5: Shared Renderer Boundary

Refactor normal chat to use a parameterized agent trajectory surface before
replacing workflow node details.

The shared surface must be driven by explicit view model and action props. It
must not read selected conversation state directly. The selected conversation is
only one adapter.

Keep this phase behavior-preserving for normal chat:

- transcript rendering remains equivalent;
- run activity rows remain shared;
- approval cards receive submit behavior from the adapter;
- composer presentation is split from selected-conversation command/model and
  permission plumbing;
- liveness presentation consumes explicit liveness state and callbacks.

Run the narrow chat renderer and workflow-safe checks first before wiring new
workflow behavior.

## Phase 6: Workflow Node Adapter And Controls

Replace workflow node details' old activity preview with the shared trajectory
surface after the backend trajectory contract and shared renderer boundary
exist.

Wire only node-scoped actions:

- output loading through the real run-item output endpoint or workflow-scoped
  equivalent;
- older history through the workflow-node trajectory endpoint and selected
  execution or attempt scope;
- approvals through the workflow approval endpoint for workflow-owned approvals;
- liveness display and actions from durable workflow-owned run state;
- immediate steering only when the backend contract says the node execution is
  steerable.

Do not render queue controls until node-scoped queueing exists end to end. Do
not route workflow-node composer, approval, or output actions through selected
conversation behavior.

Delete:

- `noopLoadRunActivityOutput`;
- fake complete output-page adaptation;
- old workflow-only activity viewer helpers that duplicate the shared
  trajectory behavior;
- tests that assert fake complete pages or no-op loaders.

## Phase 7: Terminal Pane Close Transaction

Implement Track 10 independently from the workflow trajectory UI. It can be
done after the shared UI phases unless terminal pane work is already being
touched.

The key sequencing constraint is conceptual, not code-level: do not use
renderer-only state to hide backend lifecycle failure. The terminal pane should
remain visible and retryable until backend close succeeds.

## Phase 8: Verification And Final Reconciliation

For each implemented slice:

- run the narrowest focused checks that exercise the changed behavior;
- regenerate generated outputs whenever Go-owned generated inputs or endpoint
  registry contracts change;
- update the source plan that owns the work with progress, verification, and
  remaining blockers;
- update this meta plan when ordering assumptions change.

Before a final combined completion claim, run the required gates from both
source plans:

- `./scripts/format.sh`;
- `./check_quality.sh --git-changes`;
- deterministic Electron workflow coverage required by the touched chat,
  workflow, provider, steering, approvals, event streaming, generated backend
  contract, renderer chat state, transcript UI, terminal, and image-selection
  areas;
- live Codex E2E only when the local Codex CLI is signed in with ChatGPT auth,
  never through `OPENAI_API_KEY`.

One clean final selected gate run is enough unless new edits are made after it.

## Parallel Work Guidance

Safe to parallelize only when ownership boundaries do not overlap:

- Codex app-server lifecycle can proceed separately from workflow definition
  file atomicity.
- Browser test-driver extraction can proceed while backend lifecycle hardening
  is underway, as long as test owners coordinate on touched Electron test files.
- Chat image file selection can proceed separately from workflow trajectory UI
  after endpoint/request-size ownership is clear.
- Terminal pane close can proceed separately from chat/workflow trajectory work.

Do not parallelize:

- workflow runner cleanup and workflow trajectory liveness/steering UI in ways
  that cause the UI to target unstable runner-ref semantics;
- endpoint registry request-size work and new trajectory endpoint generation
  without coordinating generated contract changes;
- shared chat trajectory refactoring and workflow adapter replacement without a
  clear adapter boundary, because selected-conversation assumptions are the main
  risk.

## Done Criteria

- The remediation plan's in-scope tracks are implemented or explicitly blocked
  with source-plan updates.
- The shared workflow trajectory plan is implemented or explicitly blocked with
  source-plan updates.
- The workflow node output pagination finding that was deferred in the
  remediation plan is resolved through the shared trajectory contract, not by
  raising preview limits or fabricating complete pages.
- Workflow-owned run refs, liveness, approvals, steering, and output pagination
  use typed backend contracts and node-scoped renderer actions.
- Generated TypeScript contracts are regenerated from Go-owned surfaces.
- Required deterministic Electron and focused checks pass, with live Codex E2E
  run or explicitly skipped according to ChatGPT auth availability.
