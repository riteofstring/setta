# Review Findings Remediation Plan

Date: 2026-07-03

## Goal

Resolve the in-scope repo-review findings:

- chat turns can be stranded as `running` when startup fails after the run is
  persisted;
- Setta still preserves deprecated Codex `on-failure` approval policy values;
- several Electron tests embed large browser-side programs in string literals;
- failed workflow run attempts can create durable definition versions;
- workflow action runners can be live without durable runner refs after
  post-start persistence failures;
- workflow definition renames can leave duplicate files for one definition ID.

The fixes should cut to durable contracts. Do not add migrations,
compatibility shims, old-field aliases, dual-read/write paths, or silent
fallbacks.

## Track 1: Chat Turn Startup Failure Handling

### Problem

Normal send, workflow send, and queued promotion paths can persist or promote a
run to `running`, then return an error before the harness is actually launched.

Representative paths:

- `internal/chat/service.go` persists a running turn, builds transcript ingest,
  activates the run, publishes liveness, and launches the harness.
- `internal/chat/service_workflow.go` follows the same pattern for workflow
  agent runs.
- `internal/chat/service_queue.go` promotes queued work, activates it, publishes
  promotion events, rebuilds delivery input, and launches the harness.

Some of the post-persist steps do real store reads/writes and event publishing.
If one fails, the caller receives an error, but the durable run can remain
`running` or the in-memory active/liveness state can remain attached. That can
block the conversation even though no provider turn is executing.

The immediate-steering replay path already has the right shape:
`abortImmediateSteeringReplayStartLocked` cancels the context, deletes active
state, unlocks, and marks the run failed. The normal start paths need the same
principle instead of each hand-rolling partial startup.

### Product Contract

- Once a run is persisted or promoted to `running`, every later startup failure
  must transition it to a terminal state.
- A startup failure after the commit point should clear active/liveness state
  for that run.
- The error should remain visible in the failed run and in diagnostics where the
  surrounding code already records diagnostics.
- The queue contract must stay deterministic: queued work should be preserved,
  promoted, or left pending according to the existing queue rules, never lost by
  cleanup.
- Startup cleanup must not rely on renderer recovery or a later reconciliation
  pass to repair ordinary synchronous failures.

### Implementation Plan

#### 1. Define the startup commit point

For each turn-start path, split work into:

- preflight work that can fail without durable cleanup;
- commit work that creates or promotes the durable `running` run;
- post-commit startup work that must either launch the harness or fail the run.

Move fallible operations before the commit point when they do not require the
run to exist. Keep transcript-block creation, run activation, liveness
publishing, and harness reservation in the post-commit phase only when they
genuinely depend on the durable run.

#### 2. Add one owned post-commit startup helper

Create a helper that owns the post-commit lifecycle for regular harness turns.
The helper should receive the already-persisted conversation, run, trigger
message, assistant message, delivery input or enough data to build it, and any
queue/workflow-specific publish hooks.

The helper should:

- create transcript ingest;
- create a cancellable context;
- register active/liveness state;
- publish liveness/conversation or promotion events;
- reserve a harness task;
- launch the harness;
- disarm cleanup only after launch succeeds.

Do not leave three separate copies of this sequence in normal send, workflow
send, and queued promotion.

#### 3. Add a single abort path for post-commit failures

Add a cleanup helper modeled on `abortImmediateSteeringReplayStartLocked`, but
usable by regular sends, workflow sends, and queued promotion.

The cleanup path should:

- cancel the turn context if it exists;
- delete active/liveness state if it still points at the failed run;
- release any harness reservation if it was acquired but not launched;
- mark the run failed with the original startup error;
- publish the terminal run/liveness/conversation updates through the existing
  terminal transition path;
- preserve queued state according to existing queue rules.

Prefer reusing `failTurn` or a small wrapper over adding a parallel terminal
state transition.

#### 4. Keep immediate steering consistent

After the regular helper exists, compare it with
`abortImmediateSteeringReplayStartLocked`. If they share the same semantics,
reuse the common cleanup. If immediate steering has extra replay-specific
cleanup, keep only that delta local.

### Test Plan

Add focused Go tests that inject failures after the durable run is created:

- transcript ordinal/read failure in `newTranscriptIngestLocked`;
- transcript block save or working-status publish failure;
- liveness/conversation publish failure after activation;
- delivery-input rebuild failure after queued promotion;
- harness reservation failure after activation;
- harness launch setup failure if a synchronous launch failure remains possible.

Each test should assert:

- the run is terminal `failed`;
- active run lookup returns no active run for that conversation;
- liveness is not left cancellable/attached for the failed run;
- the assistant message is terminal failed where applicable;
- queued messages are preserved or promoted according to the queue contract;
- a subsequent send or queued promotion is not blocked by the failed startup.

Because this touches chat behavior, run deterministic end-to-end app workflow
coverage through the production Electron/main/preload/renderer/HTTP/store paths
with temporary app data and a scripted fake provider. The E2E should cover a
post-commit startup failure and then a successful later send in the same
conversation.

## Track 2: Codex On-Failure Approval Policy Removal

### Problem

Setta still preserves Codex approval policy `on-failure` as custom permission
state.

`on-failure` is deprecated in Codex. It first appears as deprecated in the
published `@openai/codex` package line at `0.102.0-alpha.2`, and in the first
stable release at `0.102.0`. Setta does not need to preserve compatibility with
that policy.

Setta's built-in permission presets use only:

- `on-request` for read-only and default workspace approval behavior;
- `never` for full-access behavior.

The code still treats other approval-policy strings as possible custom state:

- `internal/chat/codex_permission_commands.go` parses arbitrary provider
  `AskForApproval` JSON into a string.
- `internal/chat/codex_command_settings.go` accepts `approval_policy` from
  `config/read`, overlays conversation settings, and sends non-empty values back
  into `thread/start`.
- `internal/chat/codex_dynamic_tools.go` sends conversation permission settings
  back into `thread/resume`.
- `internal/chat/codex_permission_presets.go` displays unrecognized effective
  fields as `Custom`.
- `internal/chat/codex_command_settings_test.go` and
  `internal/chat/codex_permission_presets_test.go` explicitly assert that
  `on-failure` is preserved as custom state.

### Product Contract

- Setta owns the chat permission contract it exposes to users.
- Runtime-supported approval policies are exactly the policies Setta can
  represent intentionally.
- Deprecated provider values are invalid input, even if upstream generated
  protocol schemas can still decode them.
- Invalid approval policy values must produce specific errors that name the
  unsupported value and the source, such as Codex config, thread response,
  conversation settings, or API input.
- Do not rewrite user or developer Codex config files automatically.
- Do not preserve old values in persisted Setta state.
- Do not add a compatibility alias, migration, dual-read/write path, or silent
  fallback.

Initial supported Setta policy set:

- `on-request`
- `never`

`untrusted` is currently documented by Codex, but Setta does not expose it as a
permission preset. If product wants `untrusted`, add it as an explicit Setta
permission mode with UI, validation, command handling, and E2E coverage. Do not
let it enter through the same untyped custom path being removed here.

### Implementation Plan

#### 1. Add a Setta-owned approval-policy validator

Create a small chat-domain helper near the permission preset boundary, not in a
global constants file.

The helper should:

- accept only `on-request` and `never`;
- return a typed/specific error for `on-failure`;
- return a typed/specific error for any other unsupported string;
- be usable from config decoding, response decoding, persisted validation, and
  request validation.

Keep generated Codex protocol types unchanged unless the protocol generator's
owned inputs change. The generator may still know about upstream enum values;
the runtime boundary is where Setta narrows support.

#### 2. Validate provider config before it reaches effective settings

Update `codexCommandSettingsFromConfigResponse` so
`approval_policy = "on-failure"` fails as unsupported provider config instead of
returning a custom setting.

The error should stay specific enough for the UI/diagnostics path to tell the
developer to update Codex config to `on-request` or `never`.

#### 3. Validate thread start/resume responses

Update `commandThreadFromCodexResponse` or the functions that feed it so
provider-applied approval policy values are validated before being stored in
`codexCommandThreadSettings` or surfaced as effective chat settings.

This catches provider drift and prevents a deprecated value from re-entering
Setta through app-server state after Setta has sent supported settings.

#### 4. Validate conversation settings at the owned contract boundary

Tighten validation for:

- `Conversation.CodexSettings.Permission.ApprovalPolicy`;
- `Conversation.CodexEffectiveSettings.Permission.ApprovalPolicy`;
- chat command/API inputs that set permission presets or explicit permission
  fields.

Persisted state containing `on-failure` should be corrupt or invalid state, not
silently upgraded.

#### 5. Remove custom display behavior for unsupported approval policies

Change the effective-permission display path so unsupported policies do not
become `Custom`.

If Setta still needs a `Custom` label for current, explicitly supported
non-preset combinations, keep that only after validation. Do not use `Custom` as
a holding pen for deprecated or unknown provider strings.

#### 6. Stop sending unsupported values to Codex

After validation is centralized, `applyCodexThreadStartSettings` and
`applyCodexThreadResumeSettings` should receive only supported Setta values.
Keep a defensive assertion or validation at these send points if it improves the
failure message.

### Test Plan

Replace preservation tests with rejection tests:

- `config/read` with `approval_policy: "on-failure"` fails with an unsupported
  approval-policy error.
- `thread/start` response with `approvalPolicy: "on-failure"` fails as provider
  drift.
- `thread/resume` response with `approvalPolicy: "on-failure"` fails as provider
  drift.
- conversation settings containing `on-failure` fail validation.
- effective settings containing `on-failure` fail validation.
- supported policies `on-request` and `never` continue through config, command,
  start/resume, and permission-picker paths.
- generated protocol tests may still prove deprecated upstream values are not
  emitted in Setta-owned generated surfaces where that is already the local
  contract.

Because this change touches provider protocol handling and chat behavior, the
implementation needs deterministic end-to-end app workflow coverage through the
production Electron/main/preload/renderer/HTTP/store paths. The E2E should use
temporary app data and a scripted fake Codex/provider harness that returns
`on-failure` from the relevant provider/config path.

Run the live Codex E2E tests only when local Codex CLI ChatGPT auth is
available. Do not use `OPENAI_API_KEY` for those tests. Developers whose global
Codex config still contains `approval_policy = "on-failure"` should update that
config before live-provider verification; Setta should not auto-edit it.

## Track 3: Browser Test Driver Code Extraction

### Problem

Several Electron tests embed multi-kilobyte browser-side programs in template
literal strings passed to CDP evaluation. Examples include:

- `desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs`;
- `desktop/tests/electron/chat-stream-performance.test.mjs`;
- `desktop/tests/electron/semantic-graph-workflow.test.mjs`;
- `desktop/tests/electron/workspace-overview-performance-helpers.mjs`;
- `desktop/tests/electron/overview-zoom-performance.test.mjs`;
- `desktop/tests/electron/chat-long-transcript-performance.test.mjs`.

Those string programs are executable code, but they cannot be formatted, linted,
typechecked, imported, navigated, or reviewed like normal source. They also make
behavioral E2E tests harder to maintain because the test body mixes test intent
with low-level browser instrumentation.

### Product Contract

- E2E test assertions should be behavior-oriented and readable from the test
  file.
- Browser-side instrumentation should live in normal source modules whenever it
  is more than a small expression.
- `client.evaluate(...)` should contain only:
  - a simple expression;
  - a call to an installed browser-driver function;
  - structured arguments serialized into that call.
- Large DOM traversal, timing loops, measurement aggregation, event capture,
  and screenshot/snapshot inspection belong in browser-driver modules.
- The extraction must not reduce production-path coverage. Tests still need to
  exercise Electron/main/preload/renderer/HTTP/store paths where they do today.

### Implementation Plan

#### 1. Establish a browser-driver module boundary

Use the existing CDP helper pattern as the boundary. Add or extend real
browser-side `.mjs` modules under the Electron test support area, with named
functions for each instrumentation workflow.

The test files should call those functions through a small helper such as:

```js
await client.evaluateBrowserDriver("measureChatStreamPerformance", {
  expectedRunId,
  sampleCount,
});
```

The exact helper name can follow existing local CDP conventions, but the
important contract is that the code being evaluated is a named function in a
normal source file.

#### 2. Move one workflow at a time

Start with the largest string blocks:

1. overview snapshot/scroll workflow measurement;
2. chat stream performance measurement;
3. semantic graph editing exercise;
4. overview zoom performance helpers;
5. long transcript performance measurement.

Each move should be mechanical and behavior-preserving. Do not refactor the test
semantics while extracting the code.

#### 3. Keep arguments and results structured

Browser-driver functions should accept JSON-serializable argument objects and
return JSON-serializable result objects. Avoid concatenating JavaScript source
with embedded JSON fragments except in the tiny call wrapper required by CDP.

Use explicit result shapes such as:

- `{ ok: true, metrics }`;
- `{ ok: false, reason, details }`.

This keeps the test files focused on behavior assertions and failure messages.

#### 4. Add a guardrail for future string programs

Add a lightweight lint/check-quality rule that fails on large executable
template literals in Electron tests. The rule should allow:

- small selectors;
- small one-line expressions;
- tiny CDP call wrappers;
- non-executable text fixtures.

It should fail when a template literal exceeds a reasonable size and contains
code markers such as `document.querySelector`, `window.`, `const`, `let`,
`await`, or `requestAnimationFrame`.

Keep the check deterministic and specific to test sources so it does not block
legitimate markdown, SQL, or fixture text elsewhere.

### Test Plan

For each extracted workflow:

- run the same Electron test before and after extraction if practical;
- verify failure messages still identify the missing element, timeout, or bad
  metric;
- verify browser-driver installation happens once per test/session where
  appropriate;
- verify the test still exercises the production app path, not a test-only
  substitute.

After the extraction is complete, run the targeted Electron tests that owned the
large string programs and then `./check_quality.sh --git-changes`.

## Track 4: Workflow Version Commit Ordering

### Problem

Workflow definition versions are immutable execution snapshots. They should mean
"this graph was accepted as runnable and used to start an execution," not "a Run
button was clicked."

`internal/orchestrator/service.go` currently creates and saves a definition
version before executable graph validation:

- `StartExecution` calls `startExecutionVersionLocked`;
- `startExecutionVersionLocked` loads the draft, allocates a version ID,
  reads the latest version number, and calls `SaveDefinitionVersion`;
- only after that does `StartExecution` call `ValidateExecutableGraph`.

Concrete failure:

- create a blank workflow draft;
- press Run;
- the API returns `blank workflow cannot be run`;
- `workflow_versions` now contains `v1` even though no execution used it;
- after the user fixes the draft and runs it, the first real execution is `v2`.

That breaks run history semantics and leaves orphan version rows that make the UI
version labels misleading.

### Product Contract

- A workflow version is created only when an execution is successfully committed.
- Failed validation must not consume a version number.
- A failed execution-start persistence step must not leave an orphan version.
- Version numbers should be contiguous over successful execution snapshots for a
  definition.
- Draft saves remain separate from immutable run snapshots.

### Implementation Plan

#### 1. Move executable validation before version persistence

When `versionID == ""`, load the current definition and build the candidate
`WorkflowDefinitionVersion` in memory. Run `ValidateExecutableGraph` against the
candidate graph before calling any store write.

When `versionID != ""`, load the existing version and validate it before
creating an execution.

#### 2. Commit the version and execution in one store operation

Add an owned store operation for starting an execution from a new version, such
as `PersistExecutionStart(version, transition)`, or an equivalent transaction
boundary. It should:

- insert the definition version;
- insert the execution materialized state;
- insert the initial workflow events;
- commit all three together.

If the transaction fails, neither the version nor the execution should remain.
Do not keep `SaveDefinitionVersion` as a separate pre-commit step for new runs.

#### 3. Keep historical version starts read-only

Starting from an explicit `versionID` should not create a new version. It should
load the existing immutable snapshot, validate it, and commit only the new
execution and initial events.

### Test Plan

Add focused Go coverage:

- blank workflow `StartExecution` returns a validation error and leaves
  `LatestDefinitionVersionNumber` at `0`;
- an invalid nonblank executable graph also leaves no version row;
- after a failed run attempt, the first successful run creates `v1`;
- injected transition-persist failure rolls back the newly allocated version;
- explicit historical-version starts do not create another definition version.

Because this touches workflow run lifecycle and production workflow state, add
deterministic Electron app workflow coverage through the production
Electron/main/preload/renderer/HTTP/store paths. The E2E should attempt an
invalid run, then repair the draft and verify the first successful run is `v1`.

## Track 5: Workflow Runner Post-Start Cleanup

### Problem

Workflow action dispatch has a post-start failure window similar to the chat
startup issue, but at the orchestrator runner boundary.

`internal/orchestrator/service_actions.go` persists the node execution as
running, calls `runner.Start`, then separately persists runner events and runner
refs through `attachRunnerRefsAfterStart`. If that attach/persist step fails,
the function returns an error after the external runner may already be live.

For the Codex runner, `Start` calls `SendWorkflowAgentTurn` before returning
refs. A failure while attaching those refs can leave:

- a workflow execution with a running node;
- a live workflow-owned Codex chat run;
- no durable `chat.conversation` or `chat.run` refs on the node execution.

Cancellation and recovery both rely on those refs. Without them, `Cancel` can
no-op and `Recover` can only fall back to manual recovery because it has no
committed external identity.

### Product Contract

- Once a runner side effect has started, Setta must either durably attach the
  runner identity or run a deterministic cleanup path.
- The service must not return with an external runner live while the workflow has
  no durable refs for it.
- Runner start, runner refs, activity refs, and runner attempt-start events must
  share one clear post-start commit contract.
- If cleanup cannot prove the external runner was stopped, the workflow should
  become manual-recovery-required rather than ordinary `running`.
- Recovery must not rely on restarting the app to notice a normal synchronous
  attach failure.

### Implementation Plan

#### 1. Define runner start phases

Split action dispatch into:

- preflight: graph/node/action validation and input construction;
- durable action start: mark the node execution `running` before side effects;
- external start: call `runner.Start`;
- post-start commit: persist returned refs, runner attempt events, and activity
  refs;
- cleanup: cancel or mark recovery-required if post-start commit fails.

Keep this sequence in one service helper instead of scattering attach/cancel
logic across dispatch paths.

#### 2. Make returned runner identity usable for cleanup

Treat `ActionStartResult.RunnerRefs` as the minimum cleanup identity. For Codex,
that must include enough information to cancel the just-created chat run. If a
runner cannot provide cleanup identity after starting side effects, update the
runner contract before adding more runners.

#### 3. Add a post-start failure cleanup path

If `attachRunnerRefsAfterStart` or equivalent post-start persistence fails:

- use the returned refs to call `runner.Cancel` best-effort;
- persist the node as failed when cancellation succeeds or the runner never
  became externally live;
- persist manual recovery required when cancellation fails or external side
  effects are uncertain;
- include the original post-start error and any cancellation error in the
  workflow events/diagnostics.

If the store itself is unavailable and terminal/manual-recovery state cannot be
persisted, surface a specific persistence error after best-effort cancellation.
On the next recovery pass, a running node with missing refs should become manual
recovery required with a clear "runner identity was not committed" message.

#### 4. Consider a future prepare/commit runner API

The durable long-term shape is a runner lifecycle that can reserve or prepare
external identity before side effects begin, then start after Setta has committed
the identity. Implement that only if the current cleanup contract cannot make the
Codex runner robust enough.

### Test Plan

Add Go tests with a runner that succeeds `Start` but forces failures afterward:

- runner refs persistence failure cancels the runner and marks the node failed or
  manual-recovery-required;
- runner attempt-start event persistence failure follows the same cleanup path;
- cancel failure after post-start commit failure records manual recovery
  required;
- missing returned refs after a started side effect is rejected or recovered with
  a specific manual-recovery message;
- a subsequent workflow run is not blocked by a non-executing active run.

For Codex workflow actions, add deterministic Electron workflow coverage with a
scripted fake Codex harness that creates a workflow-owned chat run and then
triggers the post-start persistence failure. The test should verify the workflow
does not stay silently running without refs, and that Stop/recovery behavior is
deterministic.

## Track 6: Workflow Definition File Atomicity

### Problem

Workflow definitions are stored as JSON files under `.setta/workflows`. The
file contains the durable definition ID; the filename is derived from the display
name slug and the ID.

`internal/orchestrator/service_definition_files.go` currently handles a rename
by writing the new file path and then deleting the old file path. A crash or
`os.Remove` failure after the new file is committed leaves two `.json` files with
the same internal definition ID.

Subsequent listing and loading hard-fail when they see duplicate IDs. One partial
rename can therefore wedge normal workflow reads for that workspace.

Concrete failure:

- existing file: `.setta/workflows/review--workflow_definition_123.json`;
- rename the workflow to `Review v2`;
- new file is written:
  `.setta/workflows/review-v2--workflow_definition_123.json`;
- app crashes or deleting the old file fails;
- both files remain and reads fail with "workflow definition id ... appears in
  both ...".

### Product Contract

- For each workflow definition ID, there must be exactly one authoritative JSON
  file after every successful operation.
- A failed write must leave the previous authoritative definition intact.
- Updating a definition's display name must not require a two-file commit.
- The loader should fail loudly on real duplicate corruption, but ordinary update
  code must not create that corruption.
- Do not add migrations or compatibility aliases for old filenames.

### Implementation Plan

#### 1. Decouple display-name edits from file renames

Treat the definition ID and current path as the storage identity for existing
definitions. On `UpdateDefinition`, write the new payload back to `currentPath`
with the normal temp-file-plus-rename replacement. The JSON `name` field changes;
the filename does not have to.

For new definitions, continue choosing an initial filename from the name and ID,
or switch new files to an ID-stable filename such as `<definition_id>.json`. Do
not rename existing files just because the display name changed.

#### 2. Keep same-path writes atomic

Use the existing temp file in the workflow directory and `os.Rename(tempPath,
currentPath)` for updates. That gives the desired invariant:

- before commit, the old file is authoritative;
- after commit, the same path contains the new payload;
- if the operation fails, there is still only one scanned `.json` file for the
  definition ID.

#### 3. Preserve duplicate detection as corruption handling

Keep the current duplicate-ID checks in listing/loading. They are useful for
corrupt workspaces and manually edited files. The fix is to remove the normal
write path that creates duplicates, not to silently choose one duplicate file.

### Test Plan

Add focused Go tests:

- renaming a definition updates the JSON `name` but leaves only one `.json` file
  for the definition ID;
- update failures during temp write/rename leave the original file readable;
- a manually created duplicate ID still fails loudly with both paths in the
  error;
- repeated renames do not accumulate stale files;
- listing definitions after a rename succeeds and returns one definition.

Because this affects workflow persistence read/write behavior, add deterministic
Electron workflow coverage that renames a workflow and reloads the workspace with
temporary app data. Verify the workflow list and graph projection still load.

## Deferred Findings

The repo review also identified five issues that are intentionally out of scope
for this remediation plan.

### Cartographer automatic review bypass

Automatic cartographer processing can apply semantic graph patches even when the
model marks them as review-required, low-confidence, or high-impact. The
automatic worker passes `AutoApplyValidatedPatches: true`, the risk metadata is
recorded as warnings, and the status decision still marks deterministic-valid
patches as applied.

This plan does not change automatic cartographer behavior. When it is picked up,
treat it as a semantic graph safety issue: automatic processing should respect
review-required and risk metadata instead of turning it into audit-only
diagnostics.

### Cartographer output contract drift

The semantic cartographer live-provider schema and Setta's accepted envelope
contract have drifted. The provider receives a large strict JSON schema that
requires fields such as `modelInfo.provider`, `modelInfo.model`,
`modelInfo.responseId`, and every payload key, while Setta's decoder and
application validation accept a smaller Go-shaped envelope. The scripted harness
exercises the smaller accepted shape, so deterministic tests can pass without
proving the live provider contract works.

This plan does not change the cartographer schema, decoder, or tests. When it is
picked up, make one owner-defined contract authoritative and generate or validate
all provider, scripted-harness, and application surfaces from that contract.

### Workspace browser snapshot retry behavior

`desktop/src/main/workspace-browser-views.ts` treats a failed browser-pane
snapshot capture as fresh for the current snapshot key. A transient capture
failure can therefore suppress same-key retries and leave overview/browser
snapshots missing or stale until another force path, URL change, or size change
invalidates the key.

This plan does not change that behavior. When it is picked up, treat it as a
browser-pane visual freshness bug, not as part of chat run startup, Codex
permission policy, or Electron test-driver cleanup.

### Workspace activity projection panics

`internal/workspaceactivity/service.go` panics when chat or workflow event
projection fails. Those projection errors are reachable from ordinary bad
persisted or provider-derived data, such as a `command_execution` run item that
is missing typed command details, malformed runner approval payloads, unsupported
approval statuses, or a failed metadata lookup. Because workspace activity is a
derived projection over chat and workflow state, one bad projected row should not
terminate the backend process.

When this is picked up, treat workspace activity as a fallible projection
boundary. Replace the `panic(err)` paths with typed, attributable projection
errors that include the source kind, event ID or stream cursor, workspace ID, and
any known conversation, run, workflow execution, or run-item IDs. Publish a
workspace-activity diagnostic or resync event so the UI and logs show the
projection is degraded, then continue consuming events or trigger a bounded
snapshot rebuild from the chat/workflow source of truth. Do not silently drop the
bad event, but do not crash the process for a derived-record failure.

### Unwired chat controls

The renderer exposes controls that are explicitly disabled or not implemented:

- retry/fork message actions render for completed messages but are disabled and
  titled as not wired;
- the composer renders a disabled voice-input button with a not-implemented
  tooltip.

This plan does not remove or implement those controls. When the UI work is
picked up, decide directly whether each control should become real product
behavior or disappear from the interface. Do not keep fake affordances as a
placeholder.

## Overall Non-Goals

- Do not fix unrelated UI controls, browser snapshot retry behavior, or other
  deferred findings in this plan.
- Do not change generated outputs manually.
- Do not add compatibility support for deprecated Codex values.
- Do not use renderer-only patches to hide backend state problems.
- Do not weaken E2E coverage while cleaning up test code.
- Do not add migrations or silent repair paths for workflow definition files
  unless that exact repair work is explicitly requested.

## Overall Done Criteria

- A post-commit chat startup failure cannot leave a conversation blocked by a
  non-executing `running` run.
- `on-failure` is rejected at Setta-owned runtime boundaries and is never sent
  back to Codex.
- Large browser-side Electron test programs live in normal source modules, not
  multi-kilobyte string literals.
- Failed workflow run attempts do not create durable definition versions, and a
  first successful run after failed attempts is still `v1`.
- Workflow action dispatch cannot leave an external runner live without durable
  refs, cleanup, or manual-recovery state.
- Workflow definition display-name updates cannot leave duplicate authoritative
  files for one definition ID.
- New tests cover the failure paths and guardrails above.
- Final verification follows the relevant workflow requirements in `AGENTS.md`.
