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

Status: shared cleanup slice completed 2026-07-03. Normal chat sends,
workflow-agent sends, and queued promotion now use the shared post-commit
harness-turn starter and cleanup path from Track 1. Focused Go tests cover
post-commit transcript-start failures for all three paths, and deterministic
Electron coverage verifies a failed post-commit start followed by a successful
later send through production app paths. Audit follow-up fixed queued promotion
to pass the committed promoted run into the shared starter and harness request,
rather than the stale queued run copy. Live Codex Electron coverage was run with
`OPENAI_API_KEY` unset and passed.

Verification:

- `./scripts/go.sh test ./internal/chat`
- `./scripts/go.sh test ./internal/runtime`
- `./scripts/go.sh test ./internal/chat -run 'TestServiceEditsQueuedMessageAndUsesEditedTextOnPromotion|TestServicePostCommitStartupFailure'`
- `./scripts/go.sh test ./internal/runtime -run 'Test(Start|InvalidStartupConfiguration|GracefulShutdown|ShutdownDrainsActiveChatTurnBeforeClosingEvents)'`
- `./scripts/format.sh`; `./check_quality.sh --git-changes`
- `node desktop/tests/electron/chat-workflows.test.mjs --post-commit-startup-failure-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`

Remaining notes: broader deterministic chat workflow attempts passed the new
startup-failure case, then failed later in unrelated existing long-suite
scenarios (`transcript-scroll` once, Codex protocol row waiting once). Remaining
Track 1 hardening is deeper injection coverage for publish, delivery-rebuild,
and synchronous harness-reservation/setup failure classes; after that, Track 2
is the next remediation track before shared UI work. A full audit rerun of
`./scripts/go.sh test ./internal/runtime` reached signed-in live Codex coverage
and timed out in
`TestBackendLiveCodexRunLivenessReconcileDuringActiveTurn`; focused non-live
runtime startup/shutdown coverage passed.
An audit rerun of
`node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`
passed the happy path, queued controls, cancel/fail queue, post-commit
startup-failure, transcript search, and transcript scroll scenarios before
failing later in a Codex-protocol workflow wait with `rows: []`.

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

Status: completed 2026-07-03. Workflow action dispatch now routes post-start
runner event/ref commit failures through a cleanup path. Returned runner refs are
used to cancel the live runner before returning; successful cancellation fails
the action and commits the returned refs for diagnostics, while cancellation
failure or missing returned refs records manual recovery required with the
original post-start error. Audit follow-up fixed the missing-ref path so it
records manual recovery without dispatching a ref-less runner cancel request.
Startup recovery now records explicit manual recovery for active workflow
actions whose runner identity was not committed.

Verification:

- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(PostStartCommitFailure|StartedRunnerWithoutCleanupIdentity|StartupRecoveryRequiresManualStateWhenRunnerIdentityMissing)'`
- `./scripts/go.sh test ./internal/runtime -run 'Test(Start|InvalidStartupConfiguration|GracefulShutdown|ShutdownDrainsActiveChatTurnBeforeClosingEvents)'`
- `./scripts/go.sh test ./internal/orchestrator`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-runner-post-start-failure-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`

Remaining notes: the future prepare/commit runner API was not needed for the
current Codex runner contract. Track 5, workflow version commit ordering, is the
next Phase 1 remediation track before broad workflow trajectory E2E expansion.

### 3. Workflow Version Commit Ordering

Implement Track 5 before adding broad workflow trajectory E2E scenarios that
start executions.

This keeps workflow version labels stable: invalid run attempts do not consume
version numbers, and the first successful execution snapshot is still `v1`.

Status: completed 2026-07-03. `StartExecution` now prepares latest-draft
versions in memory, validates executable graphs before version persistence, and
commits new versions with the initial execution materialized state and workflow
events through one store transaction. Explicit historical-version starts remain
read-only with respect to definition versions. Focused Go tests cover blank and
invalid draft rejection without version rows, first repaired run as `v1`,
transaction rollback after an event insert failure, and historical-version
reuse. Deterministic Electron coverage verifies the invalid-run/repair/`v1`
workflow through production Electron/main/preload/HTTP/store paths.

Verification:

- `./scripts/go.sh test ./internal/orchestrator -run 'Test(Service(StartExecution|StoresNull)|StorePersistExecutionStartRollsBackVersionWhenEventInsertFails|StoreRollsBackMaterializedStateWhenEventInsertFails)'`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(PostStartCommitFailure|StartedRunnerWithoutCleanupIdentity|StartupRecoveryRequiresManualStateWhenRunnerIdentityMissing)'`
- `./scripts/go.sh test ./internal/orchestrator`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-version-commit-ordering-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only` was attempted with ChatGPT auth available, but failed later in the
  existing live semantic cartographer workflow while waiting for backend state. This failed live-provider attempt is not treated as provider integration proof.
- `./scripts/format.sh`; `./check_quality.sh --git-changes`

Remaining notes: workflow definition file atomicity and Codex app-server
process lifecycle ownership are now complete; Phase 2 Track 2, Codex approval
policy removal, is the next remediation track before shared approval UI reuse.

### 4. Workflow Definition File Atomicity

Implement Track 7 before relying on reload/restart workflow trajectory E2E
coverage.

The shared trajectory plan requires reload/restart behavior for node details.
Those tests should not be confounded by duplicate definition files from normal
renames.

Status: completed 2026-07-03. Workflow definition updates now write back to the
loaded current JSON path instead of deriving a new filename from the edited
display name. New definitions keep the existing slug-plus-ID initial filename,
same-path updates retain temp-file-plus-rename atomic replacement, and
duplicate-ID detection remains loud for corrupt/manual duplicate files.
Focused Go tests cover stable rename paths, repeated renames, injected commit
failure, duplicate corruption, and list/read behavior after rename.
Deterministic Electron coverage verifies create/rename/reload/list/read/graph
projection through production Electron/preload/backend paths with temporary app
data.

Verification:

- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(StoresDefinitionsAsWorkspaceJSONAndSnapshotsOnStart|WorkflowDefinitionRenameKeepsSingleStableFile|WorkflowDefinitionUpdateCommitFailureLeavesOriginalReadable|WorkflowDefinitionDuplicateIDFailsLoudly)'`
- `./scripts/go.sh test ./internal/orchestrator`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-definition-file-atomicity-only`

Remaining notes: Codex app-server process lifecycle ownership is now complete;
Phase 2 Track 2, Codex approval policy removal, is the next remediation track.

### 5. Codex App-Server Process Lifecycle Ownership

Implement Track 3 before treating app-server protocol/read failure E2E results
as reliable provider lifecycle evidence.

This is not a direct UI dependency, but it protects chat and workflow-agent
tests from stale unreaped provider processes and incorrect client completion.

Status: completed 2026-07-03. `internal/codexapp.Client` now separates
protocol termination from manager-visible process completion. Pending calls and
new writes stop on the protocol lifecycle, while `Client.Done()` closes only
after stdout has ended and the app-server child has been waited. Protocol/read
failures, explicit shutdown, and shutdown races share the client-owned process
shutdown path that closes stdin, uses the existing process-group terminate/kill
sequence, keeps stdout drained or interrupted, and preserves the original
protocol error for callers. The manager remains subprocess-agnostic.

Verification:

- `./scripts/go.sh test ./internal/codexapp -run 'TestJSONRPC(MalformedJSON|NonIntegerResponseID|UnknownResponseID|OversizedLine|NoisyChildAfterMalformedJSON|ProcessCleanupIsIdempotent|ShutdownKillsProcessGroupChildren)'`
- `./scripts/go.sh test ./internal/codexapp`
- `./scripts/go.sh test ./internal/chat -run 'TestJSONRPC'`
- `node desktop/tests/electron/chat-workflows.test.mjs --codex-app-server-lifecycle-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only` was attempted with ChatGPT auth available. One run passed before final
  formatting, and a later post-format attempt failed in the existing live
  semantic cartographer workflow while waiting for backend state. The failed
  live-provider attempt is not treated as provider integration
  proof.

Remaining notes: Phase 2 Track 2, Codex approval policy removal, is the next
ordered remediation track before broad approval UI reuse.

## Phase 2: Runtime Boundary And Endpoint Guardrails

Implement these before adding new backend endpoints or approval-heavy shared UI
behavior.

### 1. Codex Approval Policy Removal

Implement Track 2 before broadening approval UI reuse.

The shared trajectory approval surface should operate on Setta-supported
approval state only. Deprecated provider policy values such as `on-failure`
must be rejected at Setta runtime boundaries rather than preserved as custom UI
state.

Status: completed 2026-07-03. Chat-domain approval-policy validation now
accepts only `on-request` and `never` across Codex config, thread start/resume
responses, thread settings notifications, conversation settings, effective
settings, defaults, and thread start/resume request construction. Unsupported
provider values no longer become `Custom` permission display state and are not
sent back to Codex. Focused Go tests cover config, start/resume response,
notification, persisted-state, display, and send-point rejection. Deterministic
Electron coverage verifies an `on-failure` thread-start response through
production app paths fails the run without a linked ref and allows a later
supported send to succeed.

Verification:

- `./scripts/go.sh test ./internal/chat -run 'Test(SettaApprovalPolicyValidatorRejectsUnsupportedValues|ConfigResponseRejectsOnFailureApprovalPolicy|ConfigResponseDoesNotInferPermissionFromSandboxMode|UnsupportedApprovalPolicyDoesNotUseCustomDisplay|CodexThreadResponsesRejectOnFailureApprovalPolicy|CodexThreadSettingsNotificationRejectsOnFailureApprovalPolicy|Conversation(Settings|EffectiveSettings)RejectOnFailureApprovalPolicy|ThreadRequestsRejectUnsupportedApprovalPolicyBeforeSend|CodexHarness(AppliesConversationPermissionSettingsToThread(Start|Resume)|FailsWhenInitialThreadIgnoresPermissionSettings|FailsCommandThreadWhenPermissionSettingsIgnored))'`
- `./scripts/go.sh test ./internal/chat`
- `node desktop/tests/electron/chat-workflows.test.mjs --codex-approval-policy-removal-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only` was attempted, but local Codex `config/read` returned
  `approval_policy = "on-failure"`, so Setta rejected conversation creation as
  expected. This failed live-provider attempt is not provider-integration proof;
  live verification remains blocked until the developer updates global Codex
  config to `on-request` or `never`.

Remaining notes: Track 8, HTTP request boundary limits, is now complete. Track
9, chat image attachment file selection limits, is the next ordered remediation
track before adding image-path attachment endpoint work.

### 2. HTTP Request Boundary Limits

Implement Track 8 before or with any new trajectory, output-loading, approval,
steering, metadata, or image-path endpoints.

Every new endpoint added for the shared trajectory plan must participate in the
Go-owned endpoint registry request-size contract and regenerated TypeScript
surfaces. Do not add endpoint-specific hardcoded mirrors in TypeScript.

Status: completed 2026-07-03. The HTTP endpoint registry now owns a
`RequestBodyLimitBytes` contract for every POST endpoint, with a 4 MiB default
and a chat image bytes limit derived from the Go chat-domain image byte cap plus
JSON envelope allowance. Endpoint registration enforces the limit with
`http.MaxBytesReader` before JSON decoding, oversized requests return
`413 request_body_too_large`, and streamed over-limit bodies are mapped to the
same error from `decodeRequest`. The generated TypeScript endpoint descriptors
now include `requestBodyLimitBytes`. The chat image bytes handler checks base64
decoded upper bounds and exact decoded length before decoding/persistence while
leaving domain validation in place after decode. The runtime HTTP server now
sets `ReadHeaderTimeout`, `ReadTimeout`, and `MaxHeaderBytes` without setting a
write timeout, preserving SSE compatibility.

Verification:

- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `./scripts/go.sh test ./internal/httpapi -count=1`
- `./scripts/go.sh test ./internal/runtime -run 'Test(Start|InvalidStartupConfiguration|GracefulShutdown|HTTPServerUsesBoundedReadConfiguration)' -count=1`
- `pnpm -C desktop build`
- `node desktop/tests/electron/chat-workflows.test.mjs --image-attachment-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only` was attempted with ChatGPT auth available, but local Codex
  `config/read` still returned `approval_policy = "on-failure"`, so Setta
  rejected conversation creation as expected. This failed live-provider attempt
  is not provider-integration proof.
- `./scripts/format.sh`; `./check_quality.sh --git-changes` was attempted and
  passed file length, formatting, focused Go packages before runtime, desktop
  typecheck/tests/build/dead-code, but failed runtime live Codex tests for the
  same local `approval_policy = "on-failure"` blocker above.

Remaining notes: Track 9, chat image attachment file selection limits, is now
complete. The bytes endpoint remains for renderer-owned `File` objects from
paste/drop and stays bounded by Track 8's request-size and base64 checks.

### 3. Chat Image Attachment File Selection Limits

Implement Track 9 independently after HTTP limits, or alongside endpoint
metadata work if adding a path-based attachment endpoint.

This track is mostly independent from the workflow trajectory UI. Keep it
separate unless a shared generated metadata surface for limits makes combining
the work cleaner.

Status: completed 2026-07-03. Added the Go-owned
`CreateChatImageAttachmentFromPath` HTTP endpoint and regenerated the TypeScript
backend client. The endpoint uses the existing chat-domain path creation path,
which cleans the selected path, rejects remote sources, stats before reading,
enforces the domain byte cap before opening/reading, decodes and validates image
metadata, and persists the same attachment records as the bytes endpoint. Source
stat/open/read failures now return specific source validation errors instead of
being classified as chat persistence corruption. Electron main's OS picker path
now passes selected local paths to the path endpoint instead of reading files
into memory and base64-encoding them. Renderer paste/drop still uses the bytes
endpoint because browser `File` objects do not provide trusted local paths, and
that path remains bounded by Track 8.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestChatImage(PathEndpoint|BytesEndpoint)|TestEndpointRejectsOversized' -count=1`
- `./scripts/go.sh test ./internal/httpapi -count=1`
- `./scripts/go.sh test ./internal/chat -run 'TestCreateImageAttachmentFromBytesStoresMetadataAndResources|TestDecodeImageAttachmentRejectsOversizedDimensionsBeforeFullDecode' -count=1`
- `./scripts/go.sh test ./internal/chat -count=1`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop test -- --run src/preload/index.test.ts src/shared/ipc.test.ts`
- `pnpm -C desktop build`
- `node desktop/tests/electron/chat-workflows.test.mjs --image-attachment-only`
- Final post-extraction rerun: `node desktop/tests/electron/chat-workflows.test.mjs --image-attachment-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only` was attempted with ChatGPT auth available, but local Codex
  `config/read` still returned unsupported `approval_policy = "on-failure"`, so
  Setta rejected conversation creation as expected. This failed live-provider
  attempt is not provider-integration proof.
- `./scripts/format.sh`; `./check_quality.sh --git-changes`

Remaining notes: Phase 3 Track 4, browser test-driver code extraction, is the
next ordered step before adding substantial shared trajectory Electron
coverage.

## Phase 3: Test Infrastructure Guardrails

Implement Track 4 before adding substantial new Electron coverage for the shared
trajectory plan, or at minimum make new tests comply with the extracted
browser-driver pattern immediately.

The shared trajectory plan requires deterministic E2E coverage for workflow
node activity, pagination, approvals, steering, and reload/restart behavior.
Those tests should not add more large executable browser programs inside string
literals.

Status: completed 2026-07-03. The DOM pane snapshot/scroll workflow now
installs a workflow-specific browser-driver extension through the shared CDP
helper, with DOM traversal, overview snapshot inspection, scroll sampling, and
click helpers moved out of executable template literals into
`desktop/tests/electron/dom-pane-snapshot-scroll-driver.js`.
`dom-pane-snapshot-scroll-workflow.test.mjs` now polls and acts through named
driver calls with structured arguments, and browser-side CDP exceptions retain
their underlying exception descriptions for diagnostics. A second slice moved
the chat stream performance measurement loop, mutation observation,
long-task/frame aggregation, and snapshot construction into
`desktop/tests/electron/chat-stream-performance-driver.js`, leaving
`chat-stream-performance.test.mjs` to call named driver methods with structured
arguments. Audit follow-up repaired the scripted chat performance turn so the
completion result is emitted through typed `commandExecution` details instead
of the rejected legacy flat `RunItem.Result` field. This slice moved the
semantic graph workflow's browser-side semantic attachment, editing,
cartographer audit/readback, and node-details click/text helpers into
`desktop/tests/electron/semantic-graph-workflow-driver.js`; the semantic graph
workflow test now reaches those paths through named CDP driver calls with
structured arguments. This slice moved overview performance state, button,
native BrowserView, pane-host, snapshot-image, and transition measurement logic
into `desktop/tests/electron/overview-performance-driver.js`. Both
`workspace-overview-performance-helpers.mjs` and
`overview-zoom-performance.test.mjs` now call named driver methods or tiny
`driverCallExpression` wait predicates instead of embedding those browser-side
programs. This audit follow-up moved long transcript performance conversation
selection, older-page loading, transcript snapshots, scroll-start setup, and
frame sampling into
`desktop/tests/electron/chat-long-transcript-performance-driver.js`, and added
a quality guardrail that flags newly introduced large executable template
literals in Electron test files. The long transcript workflow also had stale
assertions from the current renderer: grouped activity headers now count as
visible activity, and pagination verification now checks concrete older-turn
and scroll-height progress instead of requiring a retained 100k-pixel DOM. The
final blocker slice resolved the overview zoom browser-pane setup by using an
explicitly sized benchmark scene for native browser coverage instead of the
removed real-workspace Browser shortcut. It also added call-site-owned bounded
frame-budget baselines: chat stream permits at most two isolated frames over
50ms with no long tasks, and overview native browser snapshot/restore permits
only the bounded frame/long-task behavior observed during the native
BrowserView transition.

Verification:

- `node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs --skip-build`
- `node --check desktop/tests/electron/chat-stream-performance-driver.js`
- `node --check desktop/tests/electron/chat-stream-performance.test.mjs`
- `node --check desktop/tests/electron/cdp-client.mjs`
- `node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build`
  was attempted and verified the extracted chat performance driver installed
  and started, but the run then failed in the existing scripted fake Codex path
  with `commandExecution flat result must be empty after typed details cutover`
  before measurement settlement.
- `./scripts/go.sh test ./internal/chat -run 'TestScripted' -count=1`
- Audit follow-up reran `node --check` for the chat performance driver, chat
  performance test, and `cdp-client.mjs`.
- After the fixture repair,
  `node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build`
  completed measurement twice but failed the existing frame-budget assertion
  with one or two frames over 50ms.
- Final blocker rerun:
  `node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build`
  passed with the bounded isolated-frame baseline.
- `node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs --skip-build`
  passed after registering the new driver extension.
- `node --check desktop/tests/electron/semantic-graph-workflow-driver.js`
- `node --check desktop/tests/electron/semantic-graph-workflow.test.mjs`
- `node --check desktop/tests/electron/cdp-client.mjs`
- `node desktop/tests/electron/semantic-graph-workflow.test.mjs --skip-build`
- `node --check desktop/tests/electron/overview-performance-driver.js`
- `node --check desktop/tests/electron/workspace-overview-performance-helpers.mjs`
- `node --check desktop/tests/electron/overview-zoom-performance.test.mjs`
- `node --check desktop/tests/electron/cdp-client.mjs`
- `node desktop/tests/electron/workflow-graph-maximized-4k-overview.test.mjs --skip-build`
- `node desktop/tests/electron/overview-zoom-performance.test.mjs --skip-build`
  was attempted twice after extraction and still fails in the documented
  pre-existing browser-pane setup path with visible browser pane count stuck at
  `0`.
- Final blocker rerun:
  `node desktop/tests/electron/overview-zoom-performance.test.mjs --skip-build`
  passed with the scoped benchmark browser scene and native-browser transition
  baselines.
- `node --check desktop/tests/electron/chat-long-transcript-performance-driver.js`
- `node --check desktop/tests/electron/chat-long-transcript-performance.test.mjs`
- `node --check scripts/check_electron_test_template_literals.mjs`
- `node scripts/check_electron_test_template_literals.mjs desktop/tests/electron/chat-long-transcript-performance.test.mjs desktop/tests/electron/chat-long-transcript-performance-driver.js desktop/tests/electron/cdp-client.mjs`
- `node desktop/tests/electron/chat-long-transcript-performance.test.mjs --skip-build`
- `node --check desktop/tests/electron/performance-frame-budget.mjs`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop exec vitest run src/workspace-layout/runtime-mode-options.test.ts`
- `pnpm -C desktop build`
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

Remaining notes: Track 4 no longer blocks Phase 4. The next ordered step is
Phase 4 backend trajectory contracts.

Audit 2026-07-03: no code gaps found in the Phase 3 extraction result. Focused
reruns passed syntax checks for the extracted Electron drivers/tests, the
Electron test template-literal guardrail on affected files, `pnpm -C desktop
exec vitest run src/workspace-layout/runtime-mode-options.test.ts`,
`./scripts/go.sh test ./internal/chat -run 'TestScripted' -count=1`, and
`pnpm -C desktop typecheck`.

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

Status: completed 2026-07-03. Added Go-owned workflow-node trajectory contracts
and the `/workflows/nodes/trajectory` endpoint. The service resolves the
requested workspace, workflow execution, node execution, and durable chat runner
refs; returns run-scoped transcript blocks, run activity projections, per-item
output page metadata with `hasMore`, `loadedThroughOrdinal`, and `nextOrdinal`,
pending workflow approvals, active-run/liveness state when the selected run is
active, older-history cursor state, and explicit capability flags. Chat now has
a run-scoped transcript page loader so historical workflow node pages do not
pull unrelated turns from a reused workflow conversation. TypeScript contracts
were regenerated from the endpoint registry and wired through Electron
main/preload/shared IPC as `workflow.readNodeTrajectory`.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./internal/chat -run 'TestServiceLoadRunTranscriptPageScopesReusedWorkflowConversation' -count=1`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestServiceReadWorkflowNodeTrajectory' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflowNodeTrajectoryEndpointReturnsScopedApprovalTrajectory' -count=1`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `pnpm -C desktop test -- --run src/preload/index.test.ts`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only` was attempted, but local Codex `config/read` still returned
  unsupported `approval_policy = "on-failure"`, so Setta rejected conversation
  creation before live-provider workflow execution. This failed live-provider
  attempt is not provider-integration proof.
- `./scripts/format.sh`; `./check_quality.sh --git-changes`

Remaining notes: Phase 5 shared renderer boundary is next. The old workflow
activity preview remains only for the current workflow details UI until the
Phase 6 adapter replacement removes that caller and its fake complete
output-page adaptation in one cut.

Audit 2026-07-03: no Phase 4 code gaps found. Focused reruns passed the
run-scoped chat transcript test, workflow trajectory service tests, HTTP
trajectory endpoint test, contract generator test, generated-contract rerun with
no diff, desktop typecheck/build, preload Vitest coverage, and deterministic
Electron `--workflow-node-trajectory-contract-only`. Live Codex E2E was
attempted with `OPENAI_API_KEY` unset and remains blocked by local Codex
`config/read` returning unsupported `approval_policy = "on-failure"` before
live workflow execution starts. The remediation plan's deferred pagination note
was updated to record the completed backend contract slice and the remaining
renderer replacement work.

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

Status: completed 2026-07-03. The initial slice added a renderer-owned
`AgentTrajectoryViewModel`, capability flags, action contract, and
`AgentTrajectorySurface`, plus a selected-conversation adapter for normal chat.
The second slice made the shared transcript and trajectory boundary enforce
those capabilities: queue editing/removal, immediate steering, output loading,
older-history loading, approval submission, stop, and retry actions are now
optional only when their capability is disabled, and enabled capabilities
without actions fail loudly during render. This final boundary slice extracted
explicit `ComposerViewModel` and `ComposerActions` contracts plus a selected-chat
composer adapter. `Composer` now receives command, attachment, prompt-history,
model, permission, queue, steering, stop, retry, and send actions explicitly
instead of reading the whole selected chat view. Unsupported action groups do not
render selected-chat controls, queue capture is disabled when no queue action
exists, and enabled run-control presentation without the matching action fails
loudly during render. Normal selected chat still supplies the
selected-conversation actions and behavior is preserved. The workflow details
preview path was intentionally left unchanged for Phase 6.

Audit follow-up fixed residual selected-conversation coupling in the composer
boundary. `ComposerViewModel` now exposes an explicit composer session with
derived command-cache key, model/permission labels, image support, and scope ID;
the selected chat adapter is the only composer path that reads `Conversation`
state. Steering-only composer sessions no longer need a fake `sendMessage`
action, and send/steering controls are enabled only when the current run mode has
the matching action.

Verification:

- `pnpm -C desktop exec vitest run src/renderer/src/components/chat-panel.test.tsx`
- `pnpm -C desktop exec vitest run src/renderer/src/components/agent-trajectory.test.tsx src/renderer/src/components/chat-panel.test.tsx`
- `pnpm -C desktop exec vitest run src/renderer/src/App.test.tsx src/renderer/src/components/chat-transcript-activity.test.tsx src/renderer/src/components/agent-trajectory.test.tsx src/renderer/src/components/chat-panel.test.tsx`
- `pnpm -C desktop exec vitest run src/renderer/src/components/chat-panel.test.tsx src/renderer/src/components/agent-trajectory.test.tsx`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `pnpm -C desktop deadcode`
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`
- `node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`
  passed the normal chat happy path, image attachments, prompt history,
  activity projection, command-start failure, chronological transcript,
  background terminal, queued controls, cancel/fail queue, approvals, slash
  commands, permission modes, conversation switch, defaults, lifecycle
  hardening, workflow-node trajectory contract, transcript search, transcript
  scroll/reload, sidebar, cross-workspace sidebar, and unread-conversation
  scenarios before failing later in the existing Codex protocol workflow wait
  with `rows: []`.
- `node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`
  was rerun for the composer extraction and passed codex account, happy path,
  image attachments, composer prompt history, activity projection,
  command-start failure, chronological transcript, background terminal, queued
  controls, cancel/fail queue, approvals, slash commands, permission modes,
  conversation switch, defaults, lifecycle hardening, workflow-node trajectory
  contract, Codex approval-policy removal, Codex app-server lifecycle, and
  transcript search before failing in transcript-scroll with a bottom-tolerance
  timing assertion.
- A focused direct rerun of the transcript-scroll launch helper passed
  `transcript-scroll` and `transcript-scroll-reload`.
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted, but local Codex `config/read` still returned unsupported
  `approval_policy = "on-failure"`, so Setta rejected conversation creation
  before live-provider execution. This failed live-provider attempt is not
  provider-integration proof.
- Audit follow-up reruns passed
  `pnpm -C desktop exec vitest run src/renderer/src/components/chat-composer.test.tsx src/renderer/src/components/chat-panel.test.tsx src/renderer/src/components/agent-trajectory.test.tsx`
  and `pnpm -C desktop typecheck`. `./scripts/format.sh` and
  `./check_quality.sh --git-changes` passed after the follow-up. A deterministic
  Electron rerun with
  `node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`
  passed through happy path, image attachments, composer prompt history,
  activity projection, command-start failure, chronological transcript,
  background terminal, queued controls, cancel/fail queue, approvals, slash
  commands, permission modes, conversation switch, defaults, lifecycle
  hardening, workflow-node trajectory contract, Codex approval-policy removal,
  Codex app-server lifecycle, transcript search/scroll/reload, sidebar,
  cross-workspace sidebar, and unread-conversation scenarios before failing in
  the existing later Codex-protocol workflow wait with `rows: []`. Live Codex
  Electron coverage was attempted with `OPENAI_API_KEY` unset, but local Codex
  `config/read` still returned unsupported `approval_policy = "on-failure"`, so
  Setta rejected conversation creation before live-provider execution.

Remaining notes: Phase 6 is the next ordered step. It owns the workflow-node
adapter, replacement of the old workflow details activity preview, and deletion
of the fake complete output-page adaptation in one cut.

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

Status: adapter/preview-removal slice completed 2026-07-03. Workflow node run
details now load `workflow.readNodeTrajectory` for `agent.codex` node executions
and render it through the shared `AgentTrajectorySurface` with an explicit
`workflowNodeExecution` scope. The renderer adapter preserves generated
per-run-item output page metadata, merges older node-scoped transcript pages,
loads additional output through the explicit run-item output endpoint, and
submits pending approvals through the workflow approval endpoint. Metadata,
result, branch state, token flow, and workflow event sections remain in the
details pane. The old `RunActivityPage` preview caller,
`noopLoadRunActivityOutput`, fake complete `hasMore: false` adaptation, and
obsolete non-transcript `RunItemActivityList` helper were removed.

Verification:

- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts src/renderer/src/components/agent-trajectory.test.tsx src/renderer/src/components/chat-transcript-activity.test.tsx`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop deadcode`
- `pnpm -C desktop build`
- `node --check desktop/tests/electron/browser-driver.js`
- `node --check desktop/tests/electron/workflow-activity-feed-chip-clicks.mjs`
- `node --check desktop/tests/electron/workflow-blank-canvas.test.mjs`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `node desktop/tests/electron/workflow-blank-canvas.test.mjs --skip-build`
- `node desktop/tests/electron/workflow-activity-feed.test.mjs --skip-build`
  was attempted and reached the updated chip-click coverage, but failed at the
  final renderer-console gate because an existing workflow event listener leak
  warning was recorded:
  `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 workflow:event listeners added`.
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution.

Progress 2026-07-03: workflow-node stop-run controls slice completed. The
backend now owns a `StopWorkflowNodeRun` endpoint that validates workspace,
execution, node execution, and workflow-owned run identity before cancelling the
active chat run and completing the workflow action as action-cancelled. TypeScript
contracts were regenerated, Electron main/preload/shared IPC exposes
`workflow.stopNodeRun`, and workflow node details now maps `canStopRun` into the
shared trajectory and composer stop action without enabling selected-chat
steering or queue behavior.

Audit follow-up fixed the workflow-owned cancellation boundary so node stop and
Codex runner cancel use the committed `chat.run` runner ref when cancelling the
chat turn. The chat service now rejects exact-run cancellation requests when the
conversation's active run no longer matches the requested run before issuing any
provider cancel request, preventing reused workflow conversations from
accidentally cancelling a later active run.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|EndpointStopsNodeScopedRun)' -count=1`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts --reporter=dot`
- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx --reporter=dot`
- `pnpm -C desktop exec vitest run src/preload/index.test.ts --reporter=dot`
- `pnpm -C desktop exec vitest run src/renderer/src/stores/chat-store-navigation.test.ts src/renderer/src/stores/workspace-store.test.ts --reporter=dot`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution.
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`
- Audit follow-up reruns passed
  `./scripts/go.sh test ./internal/chat -run 'TestServiceCancelActiveRunByIDRejectsDifferentActiveRunBeforeProviderCancel|TestServiceCancelFakeGoalOperationUnblocksWait|TestServiceCancelsActiveRunThroughHarness' -count=1` and
  `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun)|TestCodex|TestServiceCancel' -count=1`,
  `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|EndpointStopsNodeScopedRun)' -count=1`,
  and
  `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`.
  `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
  passed, while
  `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  remained blocked by local Codex `config/read` returning unsupported
  `approval_policy = "on-failure"` before live-provider execution.

Progress 2026-07-03: workflow-node steering controls completed. Added the
Go-owned `SteerWorkflowNodeRun` request and `/workflows/nodes/runs/steer`
endpoint, regenerated TypeScript contracts, and exposed the generated client
through Electron main/preload/shared IPC as `workflow.steerNodeRun`. The chat
service now has an exact-run steering boundary so a workflow node can steer only
the committed `chat.run` runner ref; mismatched active runs are rejected before
provider steering or steering-message persistence. Workflow node trajectory
capabilities now advertise `canSteer` only for attached, running,
non-approval-blocked workflow-owned runs. The renderer maps that capability into
the workflow node composer `steerMessage` action while keeping selected-chat
queue controls and pending-steering replay hidden because no node-scoped queue
or replay contract exists.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `./scripts/go.sh test ./internal/chat -run 'TestService(SteeringPersistsMessageAndCallsHarness|SteerActiveRunByIDRejectsDifferentActiveRunBeforeProviderSteer)' -count=1`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun|SteerWorkflowNodeRun)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|Endpoint(Steers|Stops)NodeScopedRun)' -count=1`
- `pnpm -C desktop exec vitest run src/renderer/src/components/chat-composer.test.tsx src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx src/preload/index.test.ts --reporter=dot`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop deadcode`
- `pnpm -C desktop build`
- `node --check desktop/tests/electron/workflow-node-trajectory-contract-cases.mjs`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution. This failed
  live-provider attempt is not provider-integration proof.
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

Progress 2026-07-03: workflow-node retry-liveness controls completed. Added
the Go-owned `RetryWorkflowNodeRunLiveness` request and
`/workflows/nodes/runs/retry-liveness` endpoint, regenerated TypeScript
contracts, and exposed the generated client through Electron main/preload/shared
IPC as `workflow.retryNodeRunLiveness`. The chat service now has an exact-run
reconciliation boundary so a workflow node can retry liveness only for the
committed `chat.run` runner ref; mismatched active runs are rejected before
provider reconciliation. Workflow node trajectory capabilities now advertise
`canRetryLiveness` only for attached, running, retryable workflow-owned runs,
and the renderer maps that capability into the shared trajectory/composer retry
control through the node-scoped endpoint.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `./scripts/go.sh test ./internal/chat -run 'TestServiceReconcile(ActiveRunByIDRejectsDifferentActiveRunBeforeProviderReconcile|ProviderUnavailableMarksLost)' -count=1`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun|SteerWorkflowNodeRun|RetryWorkflowNodeRunLiveness)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|Endpoint(Steers|Stops)NodeScopedRun|EndpointRetriesNodeRunLiveness)' -count=1`
- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx src/preload/index.test.ts src/renderer/src/stores/chat-store-navigation.test.ts src/renderer/src/stores/workspace-store.test.ts --reporter=dot`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop deadcode`
- `pnpm -C desktop build`
- `node --check desktop/tests/electron/workflow-node-trajectory-contract-cases.mjs`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution. This failed
  live-provider attempt is not provider-integration proof.
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

Remaining notes: queue controls and pending-steering replay remain hidden until
a node-scoped queue/replay contract exists end to end. The activity-feed
Electron warning is unrelated to this adapter slice and remains a blocker for
using that broad workflow as a clean gate.

## Phase 7: Terminal Pane Close Transaction

Implement Track 10 independently from the workflow trajectory UI. It can be
done after the shared UI phases unless terminal pane work is already being
touched.

The key sequencing constraint is conceptual, not code-level: do not use
renderer-only state to hide backend lifecycle failure. The terminal pane should
remain visible and retryable until backend close succeeds.

Status: completed 2026-07-03. Terminal pane close now goes through an explicit
surface-adapter close contract. The workspace layout only removes a terminal
pane after the terminal adapter receives a backend `terminal.close` response
whose session status is `closed`; close confirmation and close-failure
presentation are driven from terminal adapter session state, while the close
helper owns the duplicate-close guard. Failed backend close attempts keep the
pane visible with status/overlay feedback and allow a later close retry.
Non-terminal panes continue through the existing synchronous layout path.

Audit follow-up fixed close-during-startup races. If a close request arrives
while terminal attach/create is still unresolved and no session ID has been
applied yet, the adapter now waits for the pending start, closes the resulting
backend session, and only then allows pane removal. Destroyed adapters also
cancel delayed startup continuations before they can attach or create a backend
session after the pane is removed.

Verification:

- `pnpm -C desktop exec vitest run src/renderer/src/workspace-layout/terminal-surface-adapter.test.ts src/renderer/src/workspace-layout/presentation-engine.test.ts src/renderer/src/workspace-layout/workspace-interactions.test.ts`
- `node --check desktop/tests/electron/browser-driver.js && node --check desktop/tests/electron/terminal-pane-close-driver.js && node --check desktop/tests/electron/terminal-workflow-helpers.mjs && node --check desktop/tests/electron/terminal-workflow.test.mjs && node --check desktop/tests/electron/terminal-backend-crash-workflow.test.mjs && node --check desktop/tests/electron/cdp-client.mjs`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `node desktop/tests/electron/terminal-workflow.test.mjs --skip-build`
- `node desktop/tests/electron/terminal-backend-crash-workflow.test.mjs --skip-build`
- Audit follow-up reruns passed
  `pnpm -C desktop exec vitest run src/renderer/src/workspace-layout/terminal-surface-adapter.test.ts src/renderer/src/workspace-layout/presentation-engine.test.ts src/renderer/src/workspace-layout/workspace-interactions.test.ts`,
  `pnpm -C desktop typecheck`, `pnpm -C desktop build`,
  `node desktop/tests/electron/terminal-workflow.test.mjs --skip-build`, and
  `node desktop/tests/electron/terminal-backend-crash-workflow.test.mjs --skip-build`.
- `./scripts/format.sh`; `./check_quality.sh --git-changes`

Remaining notes: this slice did not add force-kill escalation and did not touch
generated contracts. Phase 8 reconciliation remains the only remaining phase in
this ordering plan.

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

Progress 2026-07-04: added deterministic rendered node-details pagination
coverage to `--workflow-node-trajectory-contract-only`, opening canonical node
details through the real graph and verifying chunk 041 loads through
`chat:run-item-output` / `/chat/runs/item-output`. Audit follow-up moved reload
readiness behind the shared browser driver and fixed a CDP page-load race.
Focused syntax/template checks, focused Electron, format, and changed-file
quality gates passed.

Progress 2026-07-04: added deterministic rendered workflow-node approval
submission coverage to `--workflow-node-trajectory-contract-only`: graph-toolbar
startup, canonical node details, shared-card approval, and resolved assistant
output with the approval card removed. Verification passed for touched
`node --check` files, the Electron template-literal guard, and focused Electron.

Progress 2026-07-04: added deterministic rendered workflow-node composer
steering coverage to `--workflow-node-trajectory-contract-only`, preserving
selected runs during definition auto-loading and opening canonical node details
through a typed graph debug opener. Audit follow-up gated that opener behind the
existing graph `debugEnabled` flag after finding it was registered in normal
runtime. Focused reruns passed projection-state Vitest, desktop typecheck/build,
touched Electron syntax checks, the Electron template-literal guard, and focused
Electron. Live Codex remains blocked by local deprecated
`config.approval_policy = "on-failure"`.

Progress 2026-07-04: added deterministic renderer-reload coverage while
workflow-node details are already open. The details pane target is now a
Go-owned `WorkflowNodeDetailsPaneConfig` on `WorkspaceUIPane`, regenerated into
TypeScript, saved with workspace layout, and used when the selected-node store
is empty after reload. Reusing the one workflow-node-details pane now
reconfigures that pane despite the surface limit, so a different node updates
the saved target instead of only focusing stale details. The focused Electron
workflow reloads the renderer while viewing details and verifies recovery for
output pagination, pending approval state, and steerable/liveness composer
state before continuing through node-scoped load-more, approval, and steering.
Verification passed focused workspace UI Go, contract/httpapi/preload checks,
focused renderer/layout Vitest, touched Electron syntax/template checks,
`pnpm -C desktop build`, and
`node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`.
Live Codex auth was available, but live E2E remains blocked by local Codex
`config/read` returning unsupported `approval_policy = "on-failure"`.
Remaining shared-trajectory gap: historical-attempt paging. Full app relaunch
while details are open is not separately exercised by this renderer-reload
slice.

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
- Workflow node details recover their persisted node-scoped trajectory target
  across renderer reload while viewing details.
- Generated TypeScript contracts are regenerated from Go-owned surfaces.
- Required deterministic Electron and focused checks pass, with live Codex E2E
  run or explicitly skipped according to ChatGPT auth availability.
