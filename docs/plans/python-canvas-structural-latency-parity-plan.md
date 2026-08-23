# Python Canvas Structural Latency and Asynchronous Diagnostics Parity Plan

## Status and purpose

**Status: Planned on 2026-08-23.**

Implement one bounded Python Canvas parity batch that makes section creation and deletion feel as
immediate as `main` without painting a provisional section or weakening the durable project
boundary. Canonical section state and Generated Python must publish after structural persistence;
Basedpyright diagnostics must settle independently afterward.

This document supersedes the completed
`python-canvas-main-parity-batch-plan.md`. Git retains that completed plan and its evidence, so the
obsolete working copy is deleted rather than accumulated beside the active plan.

Main at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` is the observable behavior reference. The current
branch owns its architecture and public V2 contract.

## Reference finding

Main does not visibly optimistic-mount a section:

- `frontend/src/state/actions/sections/createSections.ts` awaits the create request and uses only
  the canonical section ID;
- `internal/projectstate/top_level_section_creation.go` performs the structural mutation and
  generated-Python reconciliation before returning;
- `internal/projectstate/runtime_deferred_persistence.go` keeps slower persistence and downstream
  synchronization outside the mutation's visible critical path; and
- `internal/lsp/project_synchronizer.go` publishes Basedpyright diagnostics later through a
  diagnostics callback and websocket state update.

The current Python Canvas already creates a provisional identity for placement reconciliation, but
`apps/python-canvas/src/index.css` intentionally hides it. Its backend then blocks the create
response inside `Coordinator.applyCandidate`, `SynchronizeGeneratedDocument`, and the exact pull-
diagnostics request. This couples canonical section visibility and Generated Python to provider
latency even though diagnostics are derived state.

Retain the hidden identity reconciliation. Move the expensive derived diagnostics boundary instead
of inventing a visible optimistic state.

## Fixed product outcome

### 1. Fast canonical section-cardinality mutations

The following mutations must validate, render, materialize, persist, and publish their canonical
snapshot without waiting for a Basedpyright diagnostics result:

- create and delete Callable;
- create and delete Param Dict;
- create and delete List of Objects; and
- increment and decrement List children, because those operations create and delete Callable
  sections.

The mutation response includes the new canonical section forest and Generated Python. Creation
continues to reconcile the canonical ID onto the hidden provisional section's exact position and
size. Deletion remains visually optimistic and the returned canonical snapshot updates Generated
Python promptly.

Render, materialization, and authored-project persistence failures still reject the mutation and
restore the prior visible state through the existing typed failure path. Only diagnostic provider
work moves out of this transaction. A provider failure after a successful structural commit must
not roll back or misreport that durable mutation.

Do not expand this batch to rename, value editing, callable selection, Python-target editing,
forest reordering, completion, or signature refresh. Their existing provider and transactional
semantics remain unchanged.

### 2. One explicit diagnostics revision contract

Add `diagnosticsRevision` to the authoritative Go V2 snapshot contract and generate its TypeScript
surface. It identifies the authored project revision for which the current diagnostic attempt has
settled.

Contract rules:

- `0 <= diagnosticsRevision <= project.revision`;
- after startup's initial provider synchronization, it equals `project.revision` whether the
  provider succeeded or explicitly failed;
- a fast structural commit to revision `N` publishes with diagnostics cleared and
  `diagnosticsRevision < N`;
- a successful exact provider result for revision `N` atomically publishes its mapped diagnostics,
  ready provider status, and `diagnosticsRevision == N`;
- a failed exact provider attempt for revision `N` publishes no invented diagnostics, failed
  provider status, and `diagnosticsRevision == N`, so revalidation terminates without rolling back
  the project; and
- a provider result for any revision other than the current project revision is discarded and can
  never overwrite newer state.

When `diagnosticsRevision < project.revision`, the snapshot must not expose stale positional or
target diagnostics from the earlier generated document. Validation should reject incoherent public
snapshots rather than silently repairing them.

This field owns freshness. Do not overload provider lifecycle state, infer freshness from array
contents, compare diagnostic messages, or add a second shadow revision in the frontend.

### 3. Narrow coordinator-owned background analysis

Split the coordinator's existing candidate publication into two explicit paths:

1. the unchanged synchronous path used by mutations that require exact current diagnostics; and
2. a structural path that completes durable publication first and schedules diagnostics for the
   exact cloned state/rendered document revision.

Use one coordinator-owned, latest-needed analysis mechanism. Provider calls must remain serialized,
transport document versions must increase in execution order, and `Close` must stop background work
before closing the provider or materializer. Multiple quick structural commits may coalesce work,
but the newest committed revision must always be analyzed. A synchronous provider-dependent
mutation arriving while structural analysis is outstanding must serialize safely and must not fail
merely because diagnostics are behind.

Keep this implementation local to the coordinator/provider boundary. Do not create a reusable job
framework, event bus, worker package, retry service, WebSocket/SSE transport, or general background
mutation abstraction.

### 4. Bounded REST revalidation with no new visual state

The frontend already has `GET /api/v2/project`. When it accepts a snapshot whose
`diagnosticsRevision` trails `project.revision`, start one bounded revalidation loop:

- keep at most one fetch in flight;
- accept a same-revision response as a diagnostics-only canonical update;
- never replace a newer local canonical revision with an older response;
- continue against the latest accepted revision if another structural mutation advances it;
- stop when diagnostics settle, the provider explicitly fails, or the controller unmounts; and
- preserve current workspace geometry, local drafts, selection, and mutation reconciliation while
  projecting the later snapshot.

Polling is transport reconciliation only. It must not set a section mutation pending state, lock or
disable a section, show a spinner, resize a section, flash the hidden provisional kind, announce a
second successful mutation, or show a giant error panel. Keep the current accessible rollback and
alert for an actual structural request failure; this is an intentional, policy-aligned divergence
from main's silent failure.

Use a short fixed revalidation interval appropriate for loopback operation and cancel obsolete
requests. Do not add a dependency, configurable polling system, exponential-backoff framework, or
page-wide periodic refresh.

## Acceptance behavior

Add only causal proof of the requested behavior:

1. With a deterministic provider whose diagnostics call is held, a create response returns the
   canonical section and Generated Python while `diagnosticsRevision` trails. Releasing the
   provider later makes `GET /api/v2/project` publish matching diagnostics and freshness.
2. The equivalent held-provider delete completes durably before diagnostics settle. The deleted
   section cannot reappear when the background result arrives.
3. Two quick structural revisions cannot be overwritten by the older diagnostic result; the newest
   revision eventually settles.
4. An asynchronous provider failure leaves the structural mutation durable, publishes explicit
   failed status, and terminates revalidation without an application error card.
5. In the production headless browser flow, hold the browser's diagnostics revalidation response
   after a real create. The canonical pane and Generated Python are already visible with main-
   equivalent styling and geometry. There is no provisional pane, lock flash, disabled toolbar,
   spinner, height change, or giant error panel. Release revalidation and observe the settled
   snapshot.
6. Repeat the visible lifecycle for deletion and confirm Generated Python changes before diagnostic
   revalidation completes.

Use the existing raw headless Chrome/CDP harness, isolated temporary project, real Go service, and
pinned Basedpyright. Never launch Chrome for Testing, attach to the user's browser profile, request
Keychain access, or introduce a second browser harness. Prefer held-boundary assertions over a
flaky wall-clock threshold.

## Observable tests

- Coordinator tests with a controllable provider for return-before-diagnostics, stale-result
  rejection, latest-revision settlement, failure durability, and orderly close.
- Contract/runtime parser tests for `diagnosticsRevision` and incoherent lagging snapshots.
- HTTP service tests only where required to prove immediate and later snapshots.
- Controller tests for one-at-a-time polling, same-revision diagnostic projection, newer-revision
  protection, cancellation, and preserved hidden-placeholder reconciliation.
- One focused extension of the existing production browser acceptance route for create/delete
  visibility while revalidation is held.

Do not add arbitrary timing matrices, provider restart campaigns, fuzzing, mutation testing,
multi-client conflict audits, malformed-LSP inventories, new accessibility/style audits, or broad
main-parity exploration. Once the six acceptance behaviors pass, stop implementation work.

## Implementation sequence and scope guardrails

1. Generate and validate the `diagnosticsRevision` contract, then split durable structural
   publication from exact diagnostic settlement with deterministic coordinator tests.
2. Add bounded frontend revalidation while preserving the existing invisible provisional identity
   and canonical projection rules.
3. Extend the existing production headless lifecycle proof, run focused checks, and stop.

The implementation agent may commit coherent private batches. It must not leave a compatibility
field, feature flag, migration, alternate snapshot format, or partially cut-over public contract.
A claimed blocker must cite a concrete contradiction between this plan and checked-in code.
Unrequested edge cases and possible future transports are not blockers.

## Implementation checklist

### Phase 1 — Structural publication and diagnostics freshness

- [ ] Generated `diagnosticsRevision` contract and validation
- [ ] Fast durable cardinality mutations with revision-tagged background diagnostics
- [ ] Serialized provider execution, stale-result rejection, and safe shutdown

### Phase 2 — Frontend reconciliation

- [ ] Bounded GET revalidation without visible pending behavior
- [ ] Same/newer revision projection preserves drafts, layout, and identity reconciliation

### Phase 3 — Acceptance

- [ ] Focused backend/frontend causal tests
- [ ] Production raw-headless create/delete lifecycle acceptance
- [ ] Required Code Policy verification
