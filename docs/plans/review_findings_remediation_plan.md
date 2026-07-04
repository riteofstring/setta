# Review Findings Remediation Plan

Date: 2026-07-03

## Goal

Resolve the in-scope repo-review findings:

- chat turns can be stranded as `running` when startup fails after the run is persisted;
- Setta still preserves deprecated Codex `on-failure` approval policy values;
- Codex app-server protocol/read failures can close the client without terminating or reaping the child process;
- several Electron tests embed large browser-side programs in string literals;
- failed workflow run attempts can create durable definition versions;
- workflow action runners can be live without durable runner refs after post-start persistence failures;
- workflow definition renames can leave duplicate files for one definition ID;
- local HTTP API request bodies can be decoded without boundary limits or read timeouts;
- chat image selection can read and base64-encode oversized files before validation;
- terminal panes can be removed before backend terminal close succeeds.

The fixes should cut to durable contracts. Do not add migrations, compatibility shims, old-field aliases, dual-read/write paths, or silent fallbacks.

## Track 1: Chat Turn Startup Failure Handling

### Problem

Normal send, workflow send, and queued promotion paths can persist or promote a run to `running`, then return an error before the harness is actually launched.

Representative paths:

- `internal/chat/service.go` persists a running turn, builds transcript ingest, activates the run, publishes liveness, and launches the harness.
- `internal/chat/service_workflow.go` follows the same pattern for workflow agent runs.
- `internal/chat/service_queue.go` promotes queued work, activates it, publishes promotion events, rebuilds delivery input, and launches the harness.

Some of the post-persist steps do real store reads/writes and event publishing. If one fails, the caller receives an error, but the durable run can remain
`running` or the in-memory active/liveness state can remain attached. That can block the conversation even though no provider turn is executing.

The immediate-steering replay path already has the right shape: `abortImmediateSteeringReplayStartLocked` cancels the context, deletes active state, unlocks,
and marks the run failed. The normal start paths need the same principle instead of each hand-rolling partial startup.

### Product Contract

- Once a run is persisted or promoted to `running`, every later startup failure must transition it to a terminal state.
- A startup failure after the commit point should clear active/liveness state for that run.
- The error should remain visible in the failed run and in diagnostics where the surrounding code already records diagnostics.
- The queue contract must stay deterministic: queued work should be preserved, promoted, or left pending according to the existing queue rules, never lost by
  cleanup.
- Startup cleanup must not rely on renderer recovery or a later reconciliation pass to repair ordinary synchronous failures.

### Implementation Plan

#### 1. Define the startup commit point

For each turn-start path, split work into:

- preflight work that can fail without durable cleanup;
- commit work that creates or promotes the durable `running` run;
- post-commit startup work that must either launch the harness or fail the run.

Move fallible operations before the commit point when they do not require the run to exist. Keep transcript-block creation, run activation, liveness publishing,
and harness reservation in the post-commit phase only when they genuinely depend on the durable run.

#### 2. Add one owned post-commit startup helper

Create a helper that owns the post-commit lifecycle for regular harness turns. The helper should receive the already-persisted conversation, run, trigger
message, assistant message, delivery input or enough data to build it, and any queue/workflow-specific publish hooks.

The helper should:

- create transcript ingest;
- create a cancellable context;
- register active/liveness state;
- publish liveness/conversation or promotion events;
- reserve a harness task;
- launch the harness;
- disarm cleanup only after launch succeeds.

Do not leave three separate copies of this sequence in normal send, workflow send, and queued promotion.

#### 3. Add a single abort path for post-commit failures

Add a cleanup helper modeled on `abortImmediateSteeringReplayStartLocked`, but usable by regular sends, workflow sends, and queued promotion.

The cleanup path should:

- cancel the turn context if it exists;
- delete active/liveness state if it still points at the failed run;
- release any harness reservation if it was acquired but not launched;
- mark the run failed with the original startup error;
- publish the terminal run/liveness/conversation updates through the existing terminal transition path;
- preserve queued state according to existing queue rules.

Prefer reusing `failTurn` or a small wrapper over adding a parallel terminal state transition.

#### 4. Keep immediate steering consistent

After the regular helper exists, compare it with `abortImmediateSteeringReplayStartLocked`. If they share the same semantics, reuse the common cleanup. If
immediate steering has extra replay-specific cleanup, keep only that delta local.

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

Because this touches chat behavior, run deterministic end-to-end app workflow coverage through the production Electron/main/preload/renderer/HTTP/store paths
with temporary app data and a scripted fake provider. The E2E should cover a post-commit startup failure and then a successful later send in the same
conversation.

### Progress
Status: Shared cleanup slice completed 2026-07-03. Normal sends,
workflow-agent sends, and queued promotion now use a shared post-commit starter
and locked terminal cleanup path. Startup failures after `CreateRunningTurn` or
`PromoteQueuedTurn` fail the run, assistant message, and liveness state instead
of leaving a non-executing `running` run. Audit follow-up fixed queued promotion
to pass the committed promoted run into the starter.

Verification covered focused/full `internal/chat`, focused runtime
startup/shutdown tests, the deterministic Electron workflow, format/quality
gates, and live Codex E2E with `OPENAI_API_KEY` unset. Remaining depth: add
focused injections for publish, delivery-rebuild, and synchronous
reservation/setup failures where injectable. Broader deterministic/runtime
attempts exposed unrelated long-suite/live failures; exact commands and
failures are recorded in the implementation order plan.

## Track 2: Codex On-Failure Approval Policy Removal

### Problem

Setta still preserves Codex approval policy `on-failure` as custom permission state.

`on-failure` is deprecated in Codex. It first appears as deprecated in the published `@openai/codex` package line at `0.102.0-alpha.2`, and in the first stable
release at `0.102.0`. Setta does not need to preserve compatibility with that policy.

Setta's built-in permission presets use only:

- `on-request` for read-only and default workspace approval behavior;
- `never` for full-access behavior.

The code still treats other approval-policy strings as possible custom state:

- `internal/chat/codex_permission_commands.go` parses arbitrary provider `AskForApproval` JSON into a string.
- `internal/chat/codex_command_settings.go` accepts `approval_policy` from `config/read`, overlays conversation settings, and sends non-empty values back into
  `thread/start`.
- `internal/chat/codex_dynamic_tools.go` sends conversation permission settings back into `thread/resume`.
- `internal/chat/codex_permission_presets.go` displays unrecognized effective fields as `Custom`.
- `internal/chat/codex_command_settings_test.go` and `internal/chat/codex_permission_presets_test.go` explicitly assert that `on-failure` is preserved as custom
  state.

### Product Contract

- Setta owns the chat permission contract it exposes to users.
- Runtime-supported approval policies are exactly the policies Setta can represent intentionally.
- Deprecated provider values are invalid input, even if upstream generated protocol schemas can still decode them.
- Invalid approval policy values must produce specific errors that name the unsupported value and the source, such as Codex config, thread response,
  conversation settings, or API input.
- Do not rewrite user or developer Codex config files automatically.
- Do not preserve old values in persisted Setta state.
- Do not add a compatibility alias, migration, dual-read/write path, or silent fallback.

Initial supported Setta policy set:

- `on-request`
- `never`

`untrusted` is currently documented by Codex, but Setta does not expose it as a permission preset. If product wants `untrusted`, add it as an explicit Setta
permission mode with UI, validation, command handling, and E2E coverage. Do not let it enter through the same untyped custom path being removed here.

### Implementation Plan

#### 1. Add a Setta-owned approval-policy validator

Create a small chat-domain helper near the permission preset boundary, not in a global constants file.

The helper should:

- accept only `on-request` and `never`;
- return a typed/specific error for `on-failure`;
- return a typed/specific error for any other unsupported string;
- be usable from config decoding, response decoding, persisted validation, and request validation.

Keep generated Codex protocol types unchanged unless the protocol generator's owned inputs change. The generator may still know about upstream enum values; the
runtime boundary is where Setta narrows support. In other words, upstream wire/protocol decoding may remain able to represent deprecated provider enum values,
but Setta-owned runtime settings, effective settings, API inputs, and generated backend contract surfaces must not treat those values as supported product
state.

#### 2. Validate provider config before it reaches effective settings

Update `codexCommandSettingsFromConfigResponse` so `approval_policy = "on-failure"` fails as unsupported provider config instead of returning a custom setting.

The error should stay specific enough for the UI/diagnostics path to tell the developer to update Codex config to `on-request` or `never`.

#### 3. Validate thread start/resume responses

Update `commandThreadFromCodexResponse` or the functions that feed it so provider-applied approval policy values are validated before being stored in
`codexCommandThreadSettings` or surfaced as effective chat settings.

This catches provider drift and prevents a deprecated value from re-entering Setta through app-server state after Setta has sent supported settings.

#### 4. Validate conversation settings at the owned contract boundary

Tighten validation for:

- `Conversation.CodexSettings.Permission.ApprovalPolicy`;
- `Conversation.CodexEffectiveSettings.Permission.ApprovalPolicy`;
- chat command/API inputs that set permission presets or explicit permission fields.

Persisted state containing `on-failure` should be corrupt or invalid state, not silently upgraded.

#### 5. Remove custom display behavior for unsupported approval policies

Change the effective-permission display path so unsupported policies do not become `Custom`.

If Setta still needs a `Custom` label for current, explicitly supported non-preset combinations, keep that only after validation. Do not use `Custom` as a
holding pen for deprecated or unknown provider strings.

#### 6. Stop sending unsupported values to Codex

After validation is centralized, `applyCodexThreadStartSettings` and `applyCodexThreadResumeSettings` should receive only supported Setta values. Keep a
defensive assertion or validation at these send points if it improves the failure message.

### Test Plan

Replace preservation tests with rejection tests for config/read, thread
start/resume responses, persisted/effective settings, and send-point values.
Keep supported `on-request`/`never` coverage. Run deterministic Electron
coverage through production app paths with a fake Codex provider returning
`on-failure`. Attempt live Codex E2E only with ChatGPT auth and no
`OPENAI_API_KEY`; developers must update any global `on-failure` config
themselves.

### Progress
Status: Completed 2026-07-03. Setta-owned validation now accepts only
`on-request` and `never` across Codex config, thread start/resume responses,
thread settings notifications, persisted settings/defaults, and defensive
request construction. Unsupported policies no longer render as `Custom`, persist
as Setta permission state, or get sent back to Codex. Verification:
`./scripts/go.sh test ./internal/chat`, focused approval-policy Go tests, and
`node desktop/tests/electron/chat-workflows.test.mjs --codex-approval-policy-removal-only`.
Live E2E with `OPENAI_API_KEY` unset was attempted but blocked because local
Codex config still returns `approval_policy = "on-failure"`. Remaining: Track 9.

## Track 3: Codex App-Server Process Lifecycle Ownership

### Problem

`internal/codexapp/jsonrpc.go` lets the JSON-RPC read loop become the process lifecycle boundary, but only the clean stdout EOF path waits for the child
process.

Current terminal paths differ:

- clean EOF from stdout calls `cmd.Wait()` before the read loop returns;
- malformed JSON, oversized scanner tokens, scanner errors, non-integer response IDs, and unknown response IDs return from `readLoop` immediately;
- the deferred cleanup calls `finish` and closes `waitDone`, but does not close stdin, signal the process, kill the process group, or reap the child;
- the manager observes `client.Done()`, clears the active client, and can start a replacement even though the old process may still be alive.

`waitDone` is therefore misleading: on error paths it means "the read loop stopped," not "the Codex app-server process exited and was waited." Explicit shutdown
is also too coupled to this read-loop signal. If shutdown closes the client lifecycle and the process emits another message before EOF, routing can return early
and close `waitDone` without proving the process exited.

Concrete failure:

- Codex app-server writes a truncated JSON-RPC line or a response with an unexpected ID;
- `readLoop` records a terminal protocol error and returns;
- pending requests fail and the manager treats the app-server as stopped;
- the child process can continue running with open resources while Setta starts a new app-server client.

### Product Contract

- `jsonrpc.Client` owns the Codex app-server subprocess lifecycle. The manager should not need protocol-specific cleanup knowledge.
- Every terminal client path must initiate subprocess cleanup exactly once: clean EOF, protocol decode errors, route errors, scanner errors, explicit shutdown,
  and shutdown/read-loop races.
- A client must not report manager-visible completion while its child process is still live or unreaped.
- Pending calls should fail promptly with the terminal protocol/shutdown error, but process cleanup must still continue deterministically.
- Stopping normal message routing must not prevent stdout from being drained or the process from being reaped.
- The cleanup path should use the existing process-group terminate/kill behavior and timeout settings.

### Implementation Plan

#### 1. Separate protocol termination from process reaping

Replace the current `waitDone` meaning with an explicit process-exit signal, or add a separate `processDone` signal and make manager-visible completion wait for
that signal.

The implementation should distinguish:

- protocol termination: no new calls/writes/routes should be accepted and pending calls receive the terminal error;
- process termination: stdin has been closed as appropriate, the process group has been terminated or killed when needed, and `cmd.Wait()` has returned.

Avoid treating read-loop return as proof that the subprocess exited. It is acceptable for pending calls to observe the terminal protocol or shutdown error
before process cleanup is finished. Manager-visible `Done` must still mean process cleanup is complete, not merely that protocol routing has stopped.

#### 2. Add one terminal cleanup owner

Create a single `Client` method that owns terminal cleanup, for example `terminateAndWait(reason error)`. It should be guarded by `sync.Once` or an equivalent
state machine and should:

- record the terminal error and fail pending calls once;
- close stdin to request normal app-server exit when that is still useful;
- terminate the process group after the configured grace period when the process does not exit;
- kill the process group after the configured kill period when termination is insufficient;
- call `cmd.Wait()` exactly once, or otherwise prove the process was already reaped;
- publish manager-visible `Done` only after process cleanup is complete.

Do not add a second cleanup implementation in `manager.go`. The manager should continue to reason in terms of client lifecycle, not pipes, JSON-RPC scanner
state, or process groups.

#### 3. Keep stdout handling deadlock-free

On fatal protocol/read errors, stop routing messages but do not leave the child able to block forever on an unread stdout pipe while cleanup waits for process
exit.

Acceptable shapes include:

- continue draining stdout to discard while the terminal cleanup method closes stdin and signals the process; or
- close/interrupt the stdout reader as part of a coordinated process-group shutdown that guarantees `cmd.Wait()` cannot block on an unread pipe.

The chosen implementation should make this invariant obvious in tests: a noisy child that keeps writing after a malformed message must still be terminated and
reaped.

#### 4. Route explicit shutdown through the same path

Update `Close` and `shutdown(ctx)` to use the same terminal cleanup owner as read/protocol failures.

Explicit shutdown may use a different terminal error message, but it should not have a separate interpretation of `waitDone`, and it should not be possible for
post-shutdown output to make the read loop report process completion early.

#### 5. Preserve useful error reporting

Keep the original protocol/read error as the client lifecycle error that callers and pending requests see. If process termination or `Wait` also fails, attach
it to diagnostics or wrap it where the shutdown caller can observe it without discarding the original protocol failure.

### Test Plan

Add focused Go coverage under `internal/codexapp` with helper child processes that exercise process lifecycle, not only RPC return values:

- malformed JSON causes pending calls to fail and the child process to be terminated and reaped;
- non-integer or unknown response IDs follow the same cleanup path;
- scanner errors, including an oversized line, terminate and reap the child;
- a child that keeps writing after a malformed message cannot deadlock cleanup;
- explicit shutdown still terminates process-group children and waits for the app-server process;
- cleanup is idempotent when `Close`, read-loop failure, and context cancellation race.

The tests should assert process exit directly where the platform supports it, not only that `client.Done()` closes.

Because this touches Codex harness behavior and provider protocol handling, add deterministic end-to-end app workflow coverage through the production
Electron/main/preload/renderer/HTTP/store paths with temporary app data and a scripted fake Codex app-server that emits a malformed protocol message. The E2E
should verify that the UI surfaces a failed run, the app can start a later chat turn successfully, and no old fake app-server process remains alive.

Run live Codex E2E tests only when the local Codex CLI is signed in with ChatGPT auth. Do not use `OPENAI_API_KEY`; if ChatGPT auth is unavailable, record the live-provider skip without treating it as provider-integration proof.

Progress 2026-07-03: Completed. `internal/codexapp.Client` now separates protocol termination from process completion, uses one client-owned stdin/process-group shutdown path for protocol errors and explicit shutdown, keeps stdout cleanup deadlock-free, and leaves `manager.go` subprocess-agnostic. Verification included focused `internal/codexapp` lifecycle tests, `./scripts/go.sh test ./internal/codexapp`, `./scripts/go.sh test ./internal/chat -run 'TestJSONRPC'`, and `node desktop/tests/electron/chat-workflows.test.mjs --codex-app-server-lifecycle-only`. Live Codex E2E was attempted with ChatGPT auth and no `OPENAI_API_KEY`; one run passed before final formatting, while a later post-format attempt failed in the existing live semantic cartographer workflow and is not provider-integration proof. Remaining: Track 2, Codex `on-failure` approval policy removal.

## Track 4: Browser Test Driver Code Extraction

### Problem

Several Electron tests embed multi-kilobyte browser-side programs in template literal strings passed to CDP evaluation. Examples include:

- `desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs`;
- `desktop/tests/electron/chat-stream-performance.test.mjs`;
- `desktop/tests/electron/semantic-graph-workflow.test.mjs`;
- `desktop/tests/electron/workspace-overview-performance-helpers.mjs`;
- `desktop/tests/electron/overview-zoom-performance.test.mjs`;
- `desktop/tests/electron/chat-long-transcript-performance.test.mjs`.

Those string programs are executable code, but they cannot be formatted, linted, typechecked, imported, navigated, or reviewed like normal source. They also
make behavioral E2E tests harder to maintain because the test body mixes test intent with low-level browser instrumentation.

### Product Contract

- E2E test assertions should be behavior-oriented and readable from the test file.
- Browser-side instrumentation should live in normal source modules whenever it is more than a small expression.
- `client.evaluate(...)` should contain only:
  - a simple expression;
  - a call to an installed browser-driver function;
  - structured arguments serialized into that call.
- Large DOM traversal, timing loops, measurement aggregation, event capture, and screenshot/snapshot inspection belong in browser-driver modules.
- The extraction must not reduce production-path coverage. Tests still need to exercise Electron/main/preload/renderer/HTTP/store paths where they do today.

### Implementation Plan

#### 1. Establish a browser-driver module boundary

Use the existing CDP helper pattern as the boundary. Add or extend real browser-side `.mjs` modules under the Electron test support area, with named functions
for each instrumentation workflow.

The test files should call those functions through a small helper such as:

```js
await client.evaluateBrowserDriver("measureChatStreamPerformance", {
  expectedRunId,
  sampleCount,
});
```

The exact helper name can follow existing local CDP conventions, but the important contract is that the code being evaluated is a named function in a normal
source file.

#### 2. Move one workflow at a time

Start with the largest string blocks:

1. overview snapshot/scroll workflow measurement;
2. chat stream performance measurement;
3. semantic graph editing exercise;
4. overview zoom performance helpers;
5. long transcript performance measurement.

Each move should be mechanical and behavior-preserving. Do not refactor the test semantics while extracting the code.

#### 3. Keep arguments and results structured

Browser-driver functions should accept JSON-serializable argument objects and return JSON-serializable result objects. Avoid concatenating JavaScript source
with embedded JSON fragments except in the tiny call wrapper required by CDP.

Use explicit result shapes such as:

- `{ ok: true, metrics }`;
- `{ ok: false, reason, details }`.

This keeps the test files focused on behavior assertions and failure messages.

#### 4. Add a guardrail for future string programs

Add a lightweight lint/check-quality rule that fails on large executable template literals in Electron tests. The rule should allow:

- small selectors;
- small one-line expressions;
- tiny CDP call wrappers;
- non-executable text fixtures.

It should fail when a template literal exceeds a reasonable size and contains code markers such as `document.querySelector`, `window.`, `const`, `let`, `await`,
or `requestAnimationFrame`.

Keep the check deterministic and specific to test sources so it does not block legitimate markdown, SQL, or fixture text elsewhere.

### Test Plan

For each extracted workflow:

- run the same Electron test before and after extraction if practical;
- verify failure messages still identify the missing element, timeout, or bad metric;
- verify browser-driver installation happens once per test/session where appropriate;
- verify the test still exercises the production app path, not a test-only substitute.

After the extraction is complete, run the targeted Electron tests that owned the large string programs and then `./check_quality.sh --git-changes`.

### Progress

Status: First extraction slice completed 2026-07-03. A reusable CDP extension
loader now installs the DOM pane snapshot/scroll driver, and the workflow test
calls named driver functions with structured arguments instead of
multi-kilobyte executable template literals. `cdp-client.mjs` now preserves
underlying exception descriptions for extracted driver failures.

Verification: `node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs --skip-build`;
`./scripts/format.sh`; `./check_quality.sh --git-changes`. Remaining: extract
the chat stream performance, semantic graph editing, overview zoom performance,
and long transcript performance browser programs; then add the deterministic
guardrail for future large executable template literals.

## Track 5: Workflow Version Commit Ordering

### Problem

Workflow definition versions are immutable execution snapshots. They should mean "this graph was accepted as runnable and used to start an execution," not "a
Run button was clicked."

`internal/orchestrator/service.go` currently creates and saves a definition version before executable graph validation:

- `StartExecution` calls `startExecutionVersionLocked`;
- `startExecutionVersionLocked` loads the draft, allocates a version ID, reads the latest version number, and calls `SaveDefinitionVersion`;
- only after that does `StartExecution` call `ValidateExecutableGraph`.

Concrete failure:

- create a blank workflow draft;
- press Run;
- the API returns `blank workflow cannot be run`;
- `workflow_versions` now contains `v1` even though no execution used it;
- after the user fixes the draft and runs it, the first real execution is `v2`.

That breaks run history semantics and leaves orphan version rows that make the UI version labels misleading.

### Product Contract

- A workflow version is created only when an execution is successfully committed.
- Failed validation must not consume a version number.
- A failed execution-start persistence step must not leave an orphan version.
- Version numbers should be contiguous over successful execution snapshots for a definition.
- Draft saves remain separate from immutable run snapshots.

### Implementation Plan

#### 1. Move executable validation before version persistence

When `versionID == ""`, load the current definition and build the candidate `WorkflowDefinitionVersion` in memory. Run `ValidateExecutableGraph` against the
candidate graph before calling any store write.

When `versionID != ""`, load the existing version and validate it before creating an execution.

#### 2. Commit the version and execution in one store operation

Add an owned store operation for starting an execution from a new version, such as `PersistExecutionStart(version, transition)`, or an equivalent transaction
boundary. It should:

- insert the definition version;
- insert the execution materialized state;
- insert the initial workflow events;
- commit all three together.

If the transaction fails, neither the version nor the execution should remain. Do not keep `SaveDefinitionVersion` as a separate pre-commit step for new runs.

#### 3. Keep historical version starts read-only

Starting from an explicit `versionID` should not create a new version. It should load the existing immutable snapshot, validate it, and commit only the new
execution and initial events.

### Test Plan

Add focused Go coverage:

- blank workflow `StartExecution` returns a validation error and leaves `LatestDefinitionVersionNumber` at `0`;
- an invalid nonblank executable graph also leaves no version row;
- after a failed run attempt, the first successful run creates `v1`;
- injected transition-persist failure rolls back the newly allocated version;
- explicit historical-version starts do not create another definition version.

Because this touches workflow run lifecycle and production workflow state, add deterministic Electron app workflow coverage through the production
Electron/main/preload/renderer/HTTP/store paths. The E2E should attempt an invalid run, then repair the draft and verify the first successful run is `v1`.

### Progress

Status: Completed 2026-07-03. `StartExecution` now validates latest-draft
versions before any version write and commits new definition versions,
execution materialized state, and initial workflow events in one transaction;
explicit historical-version starts remain read-only for definitions. Coverage
includes validation failures leaving no versions, repaired first run as `v1`,
transaction rollback, historical-version reuse, and deterministic Electron
coverage for invalid-run/repair/`v1`. Verification included focused and full
orchestrator tests, workflow runner regression tests, the
`--workflow-version-commit-ordering-only` Electron workflow, a live E2E attempt
that failed in an existing semantic-cartographer wait, `./scripts/format.sh`,
and `./check_quality.sh --git-changes`.

## Track 6: Workflow Runner Post-Start Cleanup

Status: Completed 2026-07-03.

Implemented deterministic cleanup after `runner.Start` succeeds but post-start persistence fails: returned runner refs are now treated as required cleanup
identity, missing refs become explicit manual recovery without issuing a ref-less cancel request, successful cleanup cancels and fails the action while
preserving refs, and cancel failure records manual recovery with both the post-start and cancel errors. Startup recovery also marks active action nodes without
committed runner refs as manual recovery required with `workflow action runner identity was not committed` instead of asking runners to infer missing identity.

Coverage covers runner-ref/event persistence failures, cancel failure, missing
cleanup refs, restart recovery, later successful execution, and deterministic
Electron post-start failure recovery. Verification included focused/full
orchestrator tests, focused runtime startup/shutdown coverage,
`--workflow-runner-post-start-failure-only`, and live Codex E2E.

Remaining: the future prepare/commit runner API is not needed for the current Codex runner because returned runner refs are sufficient cleanup identity.

## Track 7: Workflow Definition File Atomicity

### Problem

Workflow definitions are stored as JSON files under `.setta/workflows`. The file contains the durable definition ID; the filename is derived from the display
name slug and the ID.

`internal/orchestrator/service_definition_files.go` currently handles a rename by writing the new file path and then deleting the old file path. A crash or
`os.Remove` failure after the new file is committed leaves two `.json` files with the same internal definition ID.

Subsequent listing and loading hard-fail when they see duplicate IDs. One partial rename can therefore wedge normal workflow reads for that workspace.

Concrete failure:

- existing file: `.setta/workflows/review--workflow_definition_123.json`;
- rename the workflow to `Review v2`;
- new file is written: `.setta/workflows/review-v2--workflow_definition_123.json`;
- app crashes or deleting the old file fails;
- both files remain and reads fail with "workflow definition id ... appears in both ...".

### Product Contract

- For each workflow definition ID, there must be exactly one authoritative JSON file after every successful operation.
- A failed write must leave the previous authoritative definition intact.
- Updating a definition's display name must not require a two-file commit.
- The loader should fail loudly on real duplicate corruption, but ordinary update code must not create that corruption.
- Do not add migrations or compatibility aliases for old filenames.

### Implementation Plan

#### 1. Decouple display-name edits from file renames

Treat the definition ID and current path as the storage identity for existing definitions. On `UpdateDefinition`, write the new payload back to `currentPath`
with the normal temp-file-plus-rename replacement. The JSON `name` field changes; the filename does not have to.

For new definitions, continue choosing an initial filename from the name and ID, or switch new files to an ID-stable filename such as `<definition_id>.json`. Do
not rename existing files just because the display name changed.

#### 2. Keep same-path writes atomic

Use the existing temp file in the workflow directory and `os.Rename(tempPath, currentPath)` for updates. That gives the desired invariant:

- before commit, the old file is authoritative;
- after commit, the same path contains the new payload;
- if the operation fails, there is still only one scanned `.json` file for the definition ID.

#### 3. Preserve duplicate detection as corruption handling

Keep the current duplicate-ID checks in listing/loading. They are useful for corrupt workspaces and manually edited files. The fix is to remove the normal write
path that creates duplicates, not to silently choose one duplicate file.

### Test Plan

Add focused Go tests:

- renaming a definition updates the JSON `name` but leaves only one `.json` file for the definition ID;
- update failures during temp write/rename leave the original file readable;
- a manually created duplicate ID still fails loudly with both paths in the error;
- repeated renames do not accumulate stale files;
- listing definitions after a rename succeeds and returns one definition.

Because this affects workflow persistence read/write behavior, add deterministic Electron workflow coverage that renames a workflow and reloads the workspace
with temporary app data. Verify the workflow list and graph projection still load.

### Progress 2026-07-03

- `UpdateDefinition` writes back to the loaded current JSON path; same-path
  temp-file-plus-rename updates leave the prior file readable on commit failure,
  new definitions keep the existing slug-plus-ID initial filename, and duplicate
  detection remains loud for corrupt/manual duplicates.
- Focused Go and deterministic Electron coverage now cover stable/repeated
  renames, injected commit failure, duplicate corruption, one on-disk JSON file,
  renderer reload, and list/read/graph projection after reload.

Verification performed:

- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(StoresDefinitionsAsWorkspaceJSONAndSnapshotsOnStart|WorkflowDefinitionRenameKeepsSingleStableFile|WorkflowDefinitionUpdateCommitFailureLeavesOriginalReadable|WorkflowDefinitionDuplicateIDFailsLoudly)'`
- `./scripts/go.sh test ./internal/orchestrator`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-definition-file-atomicity-only`

## Track 8: HTTP Request Boundary Limits

### Problem

The backend HTTP API decodes request bodies before applying any shared request size limit. `decodeRequest` passes `request.Body` directly into
`jsonio.DecodeSingle`, which creates a `json.Decoder` over the unbounded reader. The runtime HTTP server is also created without read/header timeouts or
`MaxHeaderBytes`.

This is broader than one endpoint because the endpoint registry routes most POST handlers through the same decode helper. A concrete failure is the chat image
bytes endpoint:

- a local client posts a JSON payload with `dataBase64` containing hundreds of megabytes of text;
- the shared decoder reads the full JSON value;
- `createChatImageAttachmentFromBytes` base64-decodes the full string;
- only then does the chat image domain reject payloads over the 20 MB image cap.

The terminal input path already shows the intended shape: it checks `base64.StdEncoding.DecodedLen` before decoding, then validates the decoded byte length
again.

### Product Contract

- Every HTTP request body must have a size limit before JSON decoding begins.
- The request size contract must be owned by the endpoint registry or the request-contract boundary, not by a separate hardcoded endpoint list.
- Upload-like endpoints may have explicit larger limits; ordinary JSON endpoints should use a small default limit.
- Base64 fields must be checked for encoded/decoded size before decoding, and must still be validated by the owning domain after decoding.
- The backend server must have bounded read/header behavior for local clients.
- Event-stream routes must remain compatible with long-lived responses; do not add a write timeout that breaks SSE.

### Implementation Plan

#### 1. Add request-size metadata to the endpoint registry

Extend the endpoint contract with an optional or required request body limit. Use a conservative default for ordinary POST endpoints, and set explicit limits
for endpoints that legitimately carry larger payloads.

Keep this metadata beside the endpoint registration so generated contract surfaces and handler behavior stay aligned with the Go-owned registry.

#### 2. Enforce the limit before decoding

Wrap POST request bodies with `http.MaxBytesReader` before calling `jsonio.DecodeSingle`. Oversized bodies should fail with a specific 413-style error before
handler code or domain services run.

Make the limit visible in error messages and tests, so failures are diagnosable without inspecting server logs.

#### 3. Harden base64 decoding at each bytes boundary

For `CreateChatImageAttachmentFromBytes`, reject `dataBase64` whose encoded or decoded length can exceed the image attachment byte cap before calling
`DecodeString`. Keep the existing domain validation after decode.

Use the terminal input handler as the local pattern:

- compute the decoded upper bound from the encoded string length;
- reject if it exceeds the domain maximum;
- decode;
- verify the exact decoded length.

#### 4. Add server read protections

Configure the backend `http.Server` with at least:

- `ReadHeaderTimeout`;
- `ReadTimeout` or an equivalent request-body read deadline strategy;
- `MaxHeaderBytes`.

Avoid a blanket `WriteTimeout` unless long-lived streaming routes are excluded or proven unaffected.

### Test Plan

Add focused HTTP tests:

- an oversized ordinary JSON request returns the chosen oversized-body error before the handler runs;
- an oversized chat image bytes request is rejected before base64 decode and before chat service persistence;
- a malformed but within-limit JSON request still returns the existing invalid JSON error shape;
- terminal input continues to reject oversized base64 data with its current specific error;
- the server exposes read/header timeout configuration without breaking event streams.

Because this touches generated backend contracts if endpoint metadata is added, regenerate affected TypeScript surfaces from the Go-owned endpoint registry.

### Progress

Status: Completed 2026-07-03. `ContractEndpoint` now owns positive POST
`RequestBodyLimitBytes`; ordinary JSON endpoints use a 4 MiB default, the chat
image bytes endpoint derives its larger request limit from the Go chat image
byte cap, and generated TypeScript endpoint descriptors include
`requestBodyLimitBytes`. Endpoint registration wraps POST bodies with
`http.MaxBytesReader` before JSON decoding, over-limit requests return
`413 request_body_too_large`, chat image base64 payloads are size-checked before
decode/persistence and validated again by the chat domain, and the runtime
server now sets read/header bounds without a write timeout for SSE.
Verification: `./scripts/go.sh test ./cmd/generate-contracts -count=1`;
`./scripts/go.sh test ./internal/httpapi -count=1`;
`./scripts/go.sh test ./internal/runtime -run 'Test(Start|InvalidStartupConfiguration|GracefulShutdown|HTTPServerUsesBoundedReadConfiguration)' -count=1`;
`pnpm -C desktop build`;
`node desktop/tests/electron/chat-workflows.test.mjs --image-attachment-only`;
`./scripts/format.sh`; `./check_quality.sh --git-changes` was attempted and
failed only in runtime live Codex tests for the local `on-failure` config
blocker;
`env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`;
`env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
was attempted with ChatGPT auth available, but local Codex `config/read`
returned unsupported `approval_policy = "on-failure"`, so Setta rejected
conversation creation as expected. This failed live-provider attempt is not
provider-integration proof. Track 9 is now complete; the Electron file-picker
path uses the path-based endpoint instead of reading/base64-encoding selected
files in main.

## Track 9: Chat Image Attachment File Selection Limits

### Problem

The Electron main process handles image selection by reading each chosen file fully into memory and then base64-encoding it before sending it to the backend.
This means a user can select a very large `.png`, `.jpg`, `.jpeg`, or `.gif` and freeze or crash Electron main before the backend applies the 20 MB image
attachment cap.

The backend already has the safer shape for path-based image creation: stat the source path, reject files over `maxImageAttachmentBytes`, then read with a
bounded reader. The picker path bypasses that shape by converting the file to a bytes payload in Electron main.

### Product Contract

- Selecting an oversized image must fail quickly with a user-visible validation error.
- Electron main must not read or base64-encode files that the backend will reject as too large.
- The image size limit must be owned by the Go chat/image attachment domain and exposed to TypeScript through a generated or explicit backend contract, not
  duplicated as an untracked constant.
- File selection must still use normal OS dialogs and temporary app data in tests.

### Implementation Plan

#### 1. Prefer a backend path-based attachment endpoint

Add a `CreateChatImageAttachmentFromPath`-style endpoint that accepts `workspaceID`, `conversationID`, and the selected local path. The Go service should own:

- path cleaning and validation;
- stat-before-read size enforcement;
- image decoding and dimension validation;
- persistence into the attachment store.

The Electron picker should pass selected paths to that endpoint instead of reading file bytes.

#### 2. Fallback not used
The byte-based picker preflight fallback and a separate limit metadata endpoint
were not added because the preferred path endpoint was practical.

### Test Plan

Add deterministic Electron coverage:

- create a temporary oversized image-like file with an allowed extension;
- select it through the picker path or invoke the picker handler with a controlled dialog result;
- assert the app rejects it before attempting full read/base64 conversion;
- assert the error is visible to the user and no attachment is persisted;
- assert a small valid image still attaches successfully.

Add Go HTTP/service tests for the new path endpoint if introduced:

- oversized path input is rejected after `stat` and before file read;
- directories and missing files fail with specific errors;
- valid images still produce the same attachment records as the bytes path.

Because this touches chat behavior and generated backend contracts if a new endpoint is added, regenerate affected TypeScript surfaces and run the required
deterministic app workflow coverage through Electron/main/preload/renderer/HTTP paths.

### Progress

Status: Completed 2026-07-03. Added the Go-owned path attachment endpoint,
regenerated TypeScript, and routed Electron main's picker through it so selected
local files are not read/base64-encoded before backend validation. The endpoint
stats before read, rejects oversized/missing/directory sources specifically, and
persists valid images like the bytes path; paste/drop still uses the bounded
bytes endpoint for browser `File` objects. Verification covered contract
generation, focused/full `internal/httpapi` and `internal/chat` tests, desktop
typecheck/Vitest/build, format/quality gates, and the deterministic image
Electron workflow. Live Codex remains blocked by local
`approval_policy = "on-failure"`; exact commands are in the implementation
order plan. Remaining: Track 4 next; Track 10 independent.

## Track 10: Terminal Pane Close Transaction

### Problem

The renderer removes a terminal pane before the backend confirms the terminal session was closed. `closePaneWithConfirmation` calls
`terminateTerminalSessionForPane`, then immediately closes the focused pane. `terminateTerminalSessionForPane` fire-and-forgets
`window.setta.terminal.close(sessionId, "terminate")`; failures are logged only to the console.

The backend `Manager.Close` marks and removes the session only after `closeProcess` succeeds. If the IPC/backend call rejects, times out, or fails to terminate
the process, the pane can disappear while the terminal session or child process remains alive. The user then loses the visible control needed to retry
termination.

Concrete failure:

- open a terminal pane and run `sleep 600`;
- simulate `window.setta.terminal.close` rejecting, or restart/unavailable the backend during close;
- close the pane and confirm;
- the pane is removed, the error is console-only, and the terminal process can remain live.

### Product Contract

- Renderer layout must not persistently remove a live terminal pane until the backend reports the session is closed.
- Terminal close failure must be visible and retryable from the pane UI.
- Backend terminal session state is the source of truth for whether the pane can be removed.
- Closing a non-terminal pane can remain synchronous; terminal panes need an async close transaction.
- Do not add a renderer-only cleanup illusion that hides backend/process lifecycle failure.

### Implementation Plan

#### 1. Make terminal pane close asynchronous

Split pane close handling by surface kind. For terminal panes:

- confirm if the session is running or starting;
- mark the pane as closing or disable destructive controls;
- await `window.setta.terminal.close(sessionId, "terminate")`;
- remove the pane only after the returned session status is closed.

If the close call fails, keep the pane visible and show a specific error with a retry affordance.

#### 2. Model terminal close state explicitly in renderer state

Avoid relying on a detached DOM dataset as the only source of close state. Track the terminal session ID/status in the pane or terminal adapter state that
drives rendering, and use that state for close decisions and retry UI.

The DOM dataset can remain an implementation detail for integration with the terminal host, but it should not be the only durable source for a destructive
action.

#### 3. Add force-kill escalation only as explicit product behavior

If graceful terminate fails, offer an explicit force-kill action only after the backend exposes and tests that path. Do not silently convert failed terminate
into kill without user-visible state and backend confirmation.

### Test Plan

Add deterministic Electron coverage through the production app path:

- closing a running terminal with a successful backend close removes the pane;
- forcing `terminal.close` to reject keeps the pane visible and shows a retryable error;
- after a failed close, retrying with a successful backend response removes the pane;
- the terminal process is not left running after successful close;
- reload/restart behavior preserves or reconciles a terminal pane whose close failed before removal.

Keep existing backend terminal manager tests for close success/failure, but do not treat direct IPC/backend happy-path close tests as sufficient for this UI
lifecycle contract.

## Deferred Findings

The repo review also identified seven issues that are intentionally out of scope for this remediation plan.

### Cartographer automatic review bypass

Automatic cartographer processing can apply semantic graph patches even when the model marks them as review-required, low-confidence, or high-impact. The
automatic worker passes `AutoApplyValidatedPatches: true`, the risk metadata is recorded as warnings, and the status decision still marks deterministic-valid
patches as applied.

This plan does not change automatic cartographer behavior. When it is picked up, treat it as a semantic graph safety issue: automatic processing should respect
review-required and risk metadata instead of turning it into audit-only diagnostics.

### Cartographer output contract drift

The semantic cartographer live-provider schema and Setta's accepted envelope contract have drifted. The provider receives a large strict JSON schema that
requires fields such as `modelInfo.provider`, `modelInfo.model`, `modelInfo.responseId`, and every payload key, while Setta's decoder and application validation
accept a smaller Go-shaped envelope. The scripted harness exercises the smaller accepted shape, so deterministic tests can pass without proving the live
provider contract works.

This plan does not change the cartographer schema, decoder, or tests. When it is picked up, make one owner-defined contract authoritative and generate or
validate all provider, scripted-harness, and application surfaces from that contract.

### Cartographer automatic workflow recording evidence race

The required `semantic-cartographer-auto` Electron workflow can fail its recording evidence check even when the app has rendered the expected chat pane and
composer. The workflow captures `long-running-after-restart.png` before calling `assertRecordingEvidence`, and that screenshot can show the chat surface while
`renderer-events.jsonl` still lacks a layout snapshot with chat regions. The recorder writes JSONL through `WriteStream.write()` without a drain or flush
acknowledgement, so the test can read stale evidence while the app is still running.

This plan does not change semantic cartographer E2E recording. When it is picked up, make renderer layout snapshot recording an acknowledged operation, or add a
recorder-side flush/close primitive that tests can await before reading JSONL. Do not weaken the evidence requirements, replace them with broad sleeps, or mark
the workflow as passing based only on screenshots.

### Workflow node activity output pagination loss

Workflow node details can make partial chat run output look complete. The details pane requests run activity with a small preview limit, but `RunActivityPage`
carries a flat `output` list and drops the `RunItemOutputPage.hasMore` and cursor metadata returned by the store. The renderer then adapts the preview into
per-run-item output state with `hasMore: false` and wires the shared activity list to a no-op output loader. Long command or tool output can therefore be
truncated in the workflow node details pane without a "Load more" affordance or any indication that the visible output is incomplete.

This plan does not change workflow node activity output loading. When it is picked up, make partial output explicit in the Go-owned run activity contract:
return per-run-item output pages, including `hasMore`, `loadedThroughOrdinal`, and `nextOrdinal`, instead of only a flat preview list. Regenerate the affected
TypeScript backend contract from the Go surface, then update workflow node details to preserve that pagination state and call the real run-item output endpoint
when the user loads more output. Add workflow-level behavior coverage with output longer than the initial preview limit, asserting that the UI shows the initial
truncation, exposes "Load more", and renders later output after loading. Do not paper over the bug by only raising the preview limit.

### Workspace browser snapshot retry behavior

`desktop/src/main/workspace-browser-views.ts` treats a failed browser-pane snapshot capture as fresh for the current snapshot key. A transient capture failure
can therefore suppress same-key retries and leave overview/browser snapshots missing or stale until another force path, URL change, or size change invalidates
the key.

This plan does not change that behavior. When it is picked up, treat it as a browser-pane visual freshness bug, not as part of chat run startup, Codex
permission policy, or Electron test-driver cleanup.

### Workspace activity projection panics

`internal/workspaceactivity/service.go` panics when chat or workflow event projection fails. Those projection errors are reachable from ordinary bad persisted
or provider-derived data, such as a `command_execution` run item that is missing typed command details, malformed runner approval payloads, unsupported approval
statuses, or a failed metadata lookup. Because workspace activity is a derived projection over chat and workflow state, one bad projected row should not
terminate the backend process.

When this is picked up, treat workspace activity as a fallible projection boundary. Replace the `panic(err)` paths with typed, attributable projection errors
that include the source kind, event ID or stream cursor, workspace ID, and any known conversation, run, workflow execution, or run-item IDs. Publish a
workspace-activity diagnostic or resync event so the UI and logs show the projection is degraded, then continue consuming events or trigger a bounded snapshot
rebuild from the chat/workflow source of truth. Do not silently drop the bad event, but do not crash the process for a derived-record failure.

### Unwired chat controls

The renderer exposes controls that are explicitly disabled or not implemented:

- retry/fork message actions render for completed messages but are disabled and titled as not wired;
- the composer renders a disabled voice-input button with a not-implemented tooltip.

This plan does not remove or implement those controls. When the UI work is picked up, decide directly whether each control should become real product behavior
or disappear from the interface. Do not keep fake affordances as a placeholder.

## Overall Non-Goals

- Do not fix unrelated UI controls, browser snapshot retry behavior, or other deferred findings in this plan.
- Do not change generated outputs manually.
- Do not add compatibility support for deprecated Codex values.
- Do not use renderer-only patches to hide backend state problems.
- Do not weaken E2E coverage while cleaning up test code.
- Do not add unowned TypeScript mirrors or hide terminal lifecycle failures by removing the pane before backend close succeeds.
- Do not add migrations or silent repair paths for workflow definition files unless that exact repair work is explicitly requested.

## Overall Done Criteria

- A post-commit chat startup failure cannot leave a conversation blocked by a non-executing `running` run.
- `on-failure` is rejected at Setta-owned runtime boundaries and is never sent back to Codex.
- Codex app-server read/protocol/shutdown failures cannot leave a live or unreaped child process behind the finished client.
- Large browser-side Electron test programs live in normal source modules, not multi-kilobyte string literals.
- Failed workflow run attempts do not create durable definition versions, and workflow action dispatch cannot leave a runner live without refs/cleanup/recovery.
- Workflow definition display-name updates cannot leave duplicate authoritative files for one definition ID; HTTP request bodies are bounded before JSON decoding.
- Chat image selection rejects oversized files before full read/base64/IPC/backend persistence; terminal panes are removed only after backend close succeeds.
- New tests cover the failure paths and guardrails above, and final verification follows the relevant workflow requirements in `AGENTS.md`.
