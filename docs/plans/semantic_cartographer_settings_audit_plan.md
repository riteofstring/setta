# Semantic Cartographer Settings and Auditability Plan

- **Date:** June 15, 2026
- **Status:** Proposed
- **Scope:** Add first-class semantic cartographer configuration, persist model/reasoning/audit metadata in SQLite, and expose a settings UI that controls cartographer behavior independently from chat conversations.
- **Related docs:**
  - `docs/plans/semantic_cartographer_usefulness_plan.md`
  - `docs/plans/workspace_graph_performance_semantic_liveness_plan.md`
  - `docs/plans/setta_semantic_work_graph_implementation_plan.md`

## Position

Yes: the semantic cartographer needs its own settings page, and reasoning effort
belongs in SQLite cartographer state.

The current behavior is too implicit for a long-lived product surface:

- Automatic cartographer runs do not set their own model or reasoning effort.
- Completed run audit records persist the model reported by Codex, but not the
  requested or effective reasoning effort.
- Superseded and pre-start failed runs often have empty model fields because the
  harness was never reached.
- The failed `workflow_done` run in `~/.setta/semantic-graph.sqlite` showed an
  input-size failure before model audit was populated.
- Successful recent runs in `~/.setta` show `gpt-5.5`, confirming that the
  cartographer is using the Codex structured-task default model today.
- There is no reliable way to prove whether those runs used `xhigh`, `high`,
  or another reasoning effort.

That is both a product problem and an operations problem. The cartographer is
infrastructure, not the active user chat. It should have explicit cost/latency
settings, and every run should leave enough audit data to explain what was
requested, what was sent to the harness, what Codex reported back, and how long
each stage took.

## Principles

1. **Cartographer settings are not chat settings.**
   Per-conversation `/model` choices should not silently determine background
   semantic indexing behavior. The cartographer needs an independent settings
   surface with explicit defaults.

2. **Persist requested and observed metadata separately.**
   Store what Setta requested, what Setta effectively sent, and what the provider
   reported back. Do not pretend a provider-confirmed reasoning effort exists if
   Codex does not return one.

3. **SQLite audit is the source of truth for run reconstruction.**
   A completed or failed cartographer run should be explainable from
   `semantic-graph.sqlite` without relying on renderer recordings or transient
   console logs.

4. **Use Go-owned contracts and generated TypeScript.**
   The settings and audit types should be owned by `internal/semanticgraph` and
   exposed through `internal/httpapi`; renderer types must be generated.

5. **Separate live and final synthesis policy.**
   Incremental `workflow_window` runs need low-latency behavior. Final
   `workflow_done` synthesis can use a different model, reasoning effort, input
   budget, and queue priority.

6. **Fail loudly on invalid configuration.**
   Unsupported reasoning efforts, impossible concurrency limits, and unknown
   model-selection modes should fail validation instead of falling back silently.

7. **No backward compatibility, legacy support, migrations, or transitional code.**
   This is pre-release semantic infrastructure. If the SQLite schema shape
   changes, fail loudly on incompatible state and require a deliberate store
   reset. Do not add migrations, old-field aliases, legacy readers,
   dual-read/write paths, transitional adapters, compatibility layers, or
   silent compatibility behavior.

## Resolved Product Decisions

1. **Live reasoning defaults to low.**
   Live `workflow_window` cartography should favor fast, frequent,
   evidence-backed extraction. If measurement later proves low reasoning is too
   weak, raise it to medium in a normal settings/default change, not through a
   compatibility fallback.

2. **Final synthesis reasoning defaults to medium.**
   `workflow_done` final synthesis can spend more reasoning than live windows,
   but it should not default to high or xhigh until final input budgeting,
   latency audit, and failure handling are reliable.

3. **Provider default model is supported but explicit.**
   The default model-selection mode is `provider_default`, and every run audit
   must record that provider default was requested. Users who need predictable
   cost or latency can choose an explicit model. The UI should show the current
   reported provider model when it is known, such as `gpt-5.5`.

4. **Settings are global at first.**
   Use one global semantic cartographer settings record. Do not add workspace
   overrides in this implementation. Workspace overrides can be designed later
   as a separate feature only if real usage requires them.

5. **Old local cartographer audit data is reset, not migrated.**
   Existing cartographer rows cannot truthfully backfill requested/effective
   reasoning effort. During this schema change, reset cartographer tables or the
   whole semantic graph store. Do not preserve existing rows through migration,
   compatibility aliases, synthetic defaults, or transitional read paths.

## Target Product Behavior

Settings should let the user control:

- Automatic cartographer processing enabled/disabled.
- Live window model and reasoning effort.
- Final synthesis model and reasoning effort.
- Automatic processing concurrency and per-source concurrency.
- Per-source queue cap.
- Lease duration.
- Observation/window limits that affect latency and input size.
- Final synthesis input budget.
- Debug/audit capture level.

The default experience should be:

- Both live and final profiles start with `provider_default` model selection
  that is recorded explicitly in audit state.
- Live windows use `low` reasoning for low-latency updates.
- Final synthesis uses `medium` reasoning after deterministic input budgeting.
- Live windows use a fast, bounded configuration suitable for frequent updates.
- Final synthesis uses a stronger configuration, but with explicit input-size
  controls so it cannot exceed Codex turn limits.
- Run details show model, reasoning, queue wait, harness duration, input size,
  close reason, trigger kind, status, and failure/no-op reason.
- Recordings include cartographer settings and recent run audit snapshots.

## Phase 0 - Audit Current State and Reset Store Version

Before implementation, capture a short appendix report under
`docs/reports/performance/` or `docs/reports/semantic-cartographer/` with:

- Recent counts from `semantic_cartographer_runs` grouped by status, trigger,
  model, and error.
- Distinct models currently recorded.
- Number of runs with empty model.
- Number of failed `workflow_done` runs caused by input length.
- Current table schema for `semantic_cartographer_runs`.
- The exact store reset command or developer action used before verification.

Decision:

- Treat schema change as a cartographer store-version change.
- Do not preserve legacy cartographer rows.
- Do not implement migrations or transitional schema readers.
- Fail loudly on incompatible state and require a fresh semantic graph store.

Implementation note:

- Phase 0 captured the baseline in
  `docs/reports/performance/semantic-cartographer-settings-audit-phase-0.md`
  and bumped the semantic graph store version to `10` as a reset gate.
- Version `10` is a Phase 0-only store shape: it still has the old
  cartographer run schema and no persisted cartographer settings table.
- The first schema-changing phase must bump the semantic graph store version
  again, from `10` to `11`, and must reject version `10` stores instead of
  silently adding missing tables or columns through `CREATE TABLE IF NOT EXISTS`.

## Phase 1 - Semantic Cartographer Settings Domain

Add a semanticgraph-owned settings model, for example:

```text
SemanticCartographerSettings
  schemaVersion
  automaticProcessingEnabled
  liveTaskConfig
  finalSynthesisTaskConfig
  processingConfig
  observationConfig
  auditConfig
  updatedAt

SemanticCartographerTaskConfig
  modelSelection
  modelId
  reasoningEffort
  inputBudget

SemanticCartographerProcessingConfig
  maxConcurrent
  perSourceConcurrent
  maxQueuedPerSource
  leaseDurationSeconds

SemanticCartographerObservationConfig
  maxWindowEvents
  maxWindowContentBytes
  assistantThresholdBytes
  outputThresholdBytes
  priorSummaryLimit
  tokenBudget
  quietCloseAfterSeconds
```

`modelSelection` should be explicit:

- `provider_default`: do not send a model id; audit that the provider default
  was requested.
- `explicit`: send the configured model id.

Reasoning effort should not have an implicit unknown path for configured runs.
The settings default is `low` for live windows and `medium` for final synthesis.
Both defaults must be validated against the available Codex model options before
they are sent.

Persist settings in `semantic-graph.sqlite`, not in appearance settings:

- The semantic graph service owns cartographer behavior.
- Settings and run audit should live in the same durable domain.
- Renderer appearance settings should not become a generic app-settings drawer.
- The settings table starts fresh with the new schema; no migration path is
  required.
- Adding the settings table is a schema change. Bump `semanticStoreVersion` to
  `11` in the same commit as the table and reject version `10` stores with the
  existing reset guidance.
- Do not rely on `CREATE TABLE IF NOT EXISTS` to upgrade a version `10`
  database in place. A version `10` database represents pre-settings state and
  must fail on open.

Recommended SQLite shape:

```text
semantic_cartographer_settings
  id TEXT PRIMARY KEY
  schema_version INTEGER NOT NULL
  settings_json TEXT NOT NULL
  settings_hash TEXT NOT NULL
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

Keep the row count to one global app-level settings record at first. Workspace
overrides can be added later only if real usage requires them.

Phase 1 implementation boundary:

- Implement backend domain types, default construction, validation, canonical
  JSON persistence, and settings hash calculation in `internal/semanticgraph`.
- Add store methods to read the singleton settings row, create defaults for a
  fresh store, and update the row after validation.
- Keep Phase 1 backend-only. Do not add HTTP endpoints, IPC/preload surfaces,
  generated TypeScript, renderer settings UI, model catalog calls, or harness
  behavior changes until the later phases that own those surfaces.
- Keep existing constructor options useful for tests, but persisted settings
  should become the service-owned source for default cartographer configuration.
- Separate defaulting from validation. Default construction may fill omitted
  values for a fresh store, but loading or updating persisted settings must fail
  loudly on invalid enum values, impossible concurrency limits, invalid lease or
  window budgets, or inconsistent `modelSelection`/`modelId` pairs.
- Validate reasoning effort values against the shared chat/Codex
  `ReasoningEffort` enum in this phase. Model-specific compatibility validation
  belongs to the model catalog phase because it requires provider model options.
- Add focused semanticgraph tests for fresh-store default creation, persistence
  across store reopen, settings hash stability, invalid settings rejection, and
  version `10` rejection.

Implementation note:

- Phase 1 was implemented by adding `SemanticCartographerSettings` persistence,
  the singleton `semantic_cartographer_settings` row, canonical settings JSON,
  settings hash validation, service default application, and the store version
  bump to `11`.
- Version `11` is the current settings-store shape, but it still has the old
  `semantic_cartographer_runs.model` audit field and does not yet persist
  requested/effective/reported model and reasoning metadata.

## Phase 2 - Run Audit Schema

Replace the single ambiguous `model` audit field with explicit requested,
effective, and reported metadata.

Implementation boundary:

- Phase 2 is a backend run-audit schema and lifecycle phase. It may update
  existing Go HTTP contract types and regenerate existing TypeScript surfaces
  because `CartographerRun` is already exposed, but it should not add the new
  settings endpoints, settings UI, model catalog endpoint, or final-synthesis
  input budgeting.
- Do not change the cartographer harness request policy in this phase beyond
  recording what was actually sent. Sending configured model/reasoning belongs
  to Phase 3.
- Do not add migrations, transitional reads, dual writes, old-field aliases, or
  compatibility shims for the old `model` field.
- Bump `semanticStoreVersion` from `11` to `12` in the same commit as the run
  audit schema change. Version `11` stores must fail on open with reset
  guidance.

Recommended run audit fields:

```text
settings_hash
task_profile                  -- live_window | final_synthesis | manual | retry | review
requested_model_selection     -- provider_default | explicit
requested_model
effective_model
reported_model
requested_reasoning_effort
effective_reasoning_effort
reported_reasoning_effort
reasoning_effort_reported     -- boolean
queue_wait_ms
harness_duration_ms
validation_duration_ms
application_duration_ms
total_duration_ms
input_bundle_bytes
input_bundle_character_count
output_schema_bytes
raw_harness_response_bytes
close_reason
```

Semantics:

- `settings_hash` is copied from the singleton settings row at run/window
  creation time. Later settings changes must not rewrite historical run meaning.
- `requested_*` comes directly from the saved settings snapshot at
  run/window creation time and is copied onto the run. Do not depend on looking
  up a mutable settings row later to explain an old run.
- `effective_*` is what Setta actually sent to `chat.HarnessStructuredTask`.
  Until Phase 3 sends configured reasoning effort, `effective_reasoning_effort`
  should stay empty for current harness calls instead of pretending the
  configured value was sent.
- `reported_model` is what the Codex structured-task audit reports.
- `reported_reasoning_effort` is only populated if the provider returns it.
- `reasoning_effort_reported` is `false` when provider audit has no typed
  reasoning-effort signal.
- Existing `model` should be removed from the run schema and Go/TypeScript
  contract surfaces rather than retained as a compatibility alias.
- Timings should be measured across queue, harness, validation, and application
  stages, not overwritten by the final patch application timestamp.
- Existing cartographer audit rows are not migrated into these fields.
- `task_profile` is derived deterministically from the trigger:
  `workflow_window` -> `live_window`, `workflow_done` -> `final_synthesis`,
  `manual` -> `manual`, `explicit_retry` -> `retry`, and `explicit_review` ->
  `review`.
- Until manual/retry/review get dedicated task-profile settings, they should
  record their specific `task_profile` value but use the live task config for
  requested model/reasoning defaults. `workflow_done` uses final synthesis
  settings; `workflow_window` uses live settings.

The cartographer run record should be updated at each lifecycle transition:

- Queued: settings hash, requested config, trigger, close reason, input counts.
- Running: lease metadata, started timestamp, effective model/reasoning.
- Harness completed: reported model/response id, raw response size, harness
  duration.
- Applied/no-op/rejected/failed/cancelled: terminal status, terminal timestamp,
  diagnostics, total duration.

Phase 2 must also fix the current timing bug:

- `beginCartographerWindowProcessing` should preserve the original `created_at`
  and set `started_at` only when processing starts.
- `ApplyCartographerPatchEnvelope` should update the existing run audit instead
  of rebuilding a fresh run with `created_at`, `started_at`, and `completed_at`
  all set to the application timestamp.
- Queue wait should be computed from `started_at - created_at`.
- Harness duration should measure only the structured harness call.
- Validation and application durations should measure their own stages.
- Total duration should be `completed_at - created_at`.

Recommended Phase 2 tests:

- Fresh semantic graph store opens at version `12`; version `11` stores are
  rejected with reset guidance.
- Saving and reading a cartographer run persists the new requested/effective/
  reported model and reasoning fields, settings hash, profile, close reason,
  byte counts, and durations.
- `model` is absent from the current SQLite run schema and generated
  TypeScript `CartographerRun` contract.
- Queued runs snapshot the current settings hash and requested config.
- A settings change after queueing does not rewrite the queued run's requested
  audit fields.
- Processing a run records effective fields from the actual harness task and
  reported fields from harness audit.
- Successful, no-op, rejected, failed, and cancelled terminal paths preserve
  the original `created_at`/`started_at` and record nonnegative durations.

Implementation note:

- Phase 2 was implemented by replacing `semantic_cartographer_runs.model` with
  the requested/effective/reported model and reasoning audit fields, adding
  timing/input-size audit, regenerating the existing generated TypeScript
  `CartographerRun` surface, and bumping the semantic graph store version to
  `12`.
- `HarnessStructuredTask` already has an optional `ReasoningEffort` field, and
  Codex structured turns already add `effort` to `turn/start` when it is set.
  Phase 3 should use that existing path instead of adding another provider
  request surface.
- `HarnessAuditMetadata` has reported-reasoning fields, but Codex structured
  task audit does not currently populate them. Do not fake reported reasoning
  from the requested or effective value.

## Phase 3 - Harness Configuration Path

Extend the cartographer harness task path so settings flow through one typed
configuration object.

Backend changes:

- Add reasoning effort to `CartographerHarnessTask` as a typed
  `chat.ReasoningEffort`.
- Set `chat.HarnessStructuredTask.ReasoningEffort`.
- Preserve existing strict JSON output contract and no-tools/no-mutation policy.
- Use the `CartographerRun` fields created in Phase 2 as the source of truth:
  `taskProfile`, `requestedModelSelection`, `requestedModel`, and
  `requestedReasoningEffort`.
- Use the run's Phase 2 settings hash and requested config snapshot when
  building the harness task. Do not re-read current mutable settings in a way
  that changes the meaning of already queued runs.
- Set `effective_model` and `effective_reasoning_effort` from the actual
  structured task request before the harness starts, so failed and cancelled
  runs still show what Setta attempted to send.
- Do not bump `semanticStoreVersion` in Phase 3 unless the implementation adds
  another persistent schema field. The expected implementation uses the Phase 2
  run audit fields.

Codex structured-task behavior:

- Send `model` only when `requested_model_selection` is `explicit`; leave model
  empty for `provider_default` and audit that the effective model was empty
  because no model id was sent.
- Send `effort` from `requested_reasoning_effort` for every cartographer run.
- Capture the model returned by thread/turn audit.
- Capture reported reasoning effort only if Codex exposes it in a typed response
  or notification. If not exposed, leave it empty and mark
  `reasoning_effort_reported=false`.
- If Codex rejects the model/reasoning combination, persist a normal failed run
  with the requested/effective audit fields and the provider error. Do not
  silently retry with another model, another reasoning effort, or provider
  defaults.

Recommended Phase 3 tests:

- `CartographerHarnessTask` forwards reasoning effort to
  `chat.HarnessStructuredTask`.
- Explicit model selection sends the requested model and records
  `effective_model`.
- Provider-default model selection sends no model id and leaves
  `effective_model` empty while still sending `effort`.
- Harness failures preserve requested/effective model and reasoning fields.
- Reported reasoning remains empty with `reasoning_effort_reported=false` when
  the provider audit has no typed reasoning signal.
- A settings change after queueing does not change the model/reasoning sent for
  an already queued run.
- Fake Codex structured-task tests assert the `turn/start` params contain the
  configured `effort` and only contain `model` for explicit model selection.
- Because this phase touches Codex harness behavior and cartographer execution,
  run the required deterministic end-to-end app workflow coverage through the
  production Electron/main/preload/renderer/HTTP/store paths. If local ChatGPT
  auth is available, also run the live Codex E2E flow; do not use
  `OPENAI_API_KEY` for that live check.

Implementation note:

- Phase 3 was implemented by adding typed reasoning effort to
  `CartographerHarnessTask`, deriving effective model/reasoning from the queued
  run snapshot, sending `effort` through the existing Codex structured-task
  path, omitting `model` for provider-default runs, and preserving requested/
  effective audit fields on success and failure.
- The expected Phase 3 persistent shape reused the Phase 2 run audit fields, so
  the semantic graph store remains version `12`.
- Focused backend verification covered `internal/chat` and
  `internal/semanticgraph`. The broader deterministic app E2E and live-Codex
  checks remain required whenever an implementation commit touches this harness
  path.

## Phase 4 - Model and Reasoning Option Source

The settings UI needs model and reasoning options without abusing an active chat
conversation.

Create a shared Codex model catalog path:

- Extract model listing and reasoning-effort validation out of the `/model`
  chat command flow into a reusable chat/Codex catalog method.
- Keep Phase 4 backend-only. Do not add the settings HTTP endpoint, IPC/preload
  wrappers, generated TypeScript contracts, or renderer UI until Phase 5/6.
- Add an explicit service/harness catalog path, for example a chat service
  method plus a Codex harness catalog interface. It may start a short Codex
  app-server session for `model/list`, but it must not create or resume an
  active chat conversation and must not execute `/model` through command
  plumbing just to fetch options.
- Make the existing `/model` command picker call the shared catalog path so
  pagination, hidden-model filtering, provider-drift validation, and reasoning
  option mapping are not duplicated.
- Return `chat.ChatModelOption` unless a real semanticgraph-specific contract
  need appears. `ChatModelOption.model` is the value sent to Codex and the value
  stored as an explicit cartographer model; `ChatModelOption.id` is an option
  identity/display key and must not be persisted as the explicit model value
  unless Codex also reports it as `model`.
- Include supported reasoning efforts per model.
- Include the provider default model/effort using the provider-reported default
  model option and default reasoning flag. Do not create a fake
  `provider_default` model option; provider default remains the separate
  settings mode that sends no model id.
- Add a reusable validation helper for semantic cartographer settings against a
  model catalog. Explicit model settings should fail if the configured model is
  absent or the configured reasoning effort is unsupported for that model.
  Provider-default settings should validate against the provider default model
  only when the catalog reports one; do not silently switch modes or substitute
  another model.
- Keep store-level settings validation provider-independent. Catalog validation
  belongs at service/API boundaries where Codex model options are available.
- Do not bump `semanticStoreVersion` in Phase 4 unless the implementation adds
  persistent schema.
- Do not add model-list caching unless invalidation and stale-catalog behavior
  are explicit and tested.

The renderer should not hardcode model ids or reasoning effort availability.

Recommended Phase 4 tests:

- The Codex catalog method follows pagination, filters hidden models, and fails
  loudly on malformed provider model/reasoning payloads.
- The `/model` command picker and cartographer model catalog use the same
  catalog implementation.
- Catalog lookup works without an active conversation or thread ref.
- Explicit cartographer settings validate against `ChatModelOption.model`, not
  renderer/display-only ids.
- Provider-default cartographer settings remain valid without persisting a fake
  model id.
- Unsupported saved explicit model and unsupported reasoning effort produce
  specific validation errors with no silent fallback.

Implementation note:

- Phase 4 was implemented by adding a reusable chat harness model-catalog path,
  `Service.ListCodexModelOptions(workspaceID)`, and
  `CodexHarness.ListModelOptions`.
- The shared catalog path is now used by the existing `/model` command picker,
  so pagination, hidden-model filtering, provider-drift validation, and
  reasoning option mapping stay in one backend implementation.
- Catalog lookup resolves a workspace and may start a short Codex app-server
  session, but it does not require an active conversation or thread ref.
- `ValidateSemanticCartographerSettingsAgainstModelCatalog` validates explicit
  cartographer models against `ChatModelOption.model`, accepts
  `provider_default` without storing a fake model id, and rejects unsupported
  model/reasoning combinations with no fallback.
- No persistent schema changed in Phase 4, so the semantic graph store remains
  version `12`.

## Phase 5 - HTTP, IPC, and Generated Contracts

Phase 5 is ready to implement. It should expose the Phase 1 settings state and
Phase 4 model catalog through Go-owned contracts. It should not add duplicate
run-audit endpoints: `ReadCartographerRun` and `ListCartographerRuns` already
expose the Phase 2 audit fields and should remain the run-audit read path.

Add Go-owned endpoints:

```text
ReadSemanticCartographerSettings
UpdateSemanticCartographerSettings
ListSemanticCartographerModelOptions
```

Recommended contract shape:

- `ReadSemanticCartographerSettings` can use an empty request and should return
  `semanticgraph.SemanticCartographerSettingsRecord`.
- `UpdateSemanticCartographerSettings` should take `workspaceId` plus the
  editable semantic cartographer settings fields. The settings remain global;
  the workspace id exists only so the backend can resolve the Codex catalog used
  for model/reasoning validation. `updatedAt`, `settingsHash`, `createdAt`, and
  the singleton row id are backend-owned response fields, not renderer-edited
  input.
- `ListSemanticCartographerModelOptions` should take `workspaceId` and return
  the `[]chat.ChatModelOption` catalog from the Phase 4 chat service path. Do
  not create renderer-owned model ids, hardcoded model lists, or a fake
  `provider_default` option.

Backend behavior:

- Extend `internal/httpapi.ChatService` with the Phase 4
  `ListCodexModelOptions(workspaceID string)` method.
- Extend `internal/httpapi.SemanticGraphService` with settings read/update
  methods, and implement matching methods on `semanticgraph.Service`.
- Settings updates must validate with
  `semanticgraph.ValidateSemanticCartographerSettingsAgainstModelCatalog` before
  persistence. The HTTP handler should fetch the workspace catalog through the
  chat service, then call a semantic graph service update method that stamps the
  backend-owned `updatedAt`, validates the candidate settings against the
  catalog, persists the canonical row, and returns the saved record.
- The semantic graph service update path should persist the canonical settings
  record and immediately re-apply the runtime automatic-processing and
  observation defaults from the saved settings. It must not rewrite already
  queued run snapshots.
- Keep store-level settings validation provider-independent; catalog validation
  belongs at the service/API boundary where Codex model options are available.
- Do not bump `semanticStoreVersion` in Phase 5 unless the implementation adds
  another persistent schema field.

The existing processing state endpoint should include:

- Current settings hash.
- Effective processing config.
- Last processed run model/reasoning summary, including task profile,
  requested/effective/reported model, requested/effective/reported reasoning,
  input size, harness duration, total duration, and terminal status.
- Last failure input-size and model/reasoning summary. This should be derived
  from the existing `CartographerRun` audit record when a run id is available,
  not from a second audit table or duplicate endpoint.

After editing contracts:

- Regenerate generated TypeScript surfaces.
- Update preload/main IPC wrappers.
- Keep endpoint request/response contracts owned by `internal/httpapi`.
- Do not maintain a separate generated-type list or manually edit generated
  TypeScript.

Recommended Phase 5 tests:

- HTTP tests cover reading settings, listing model options for a workspace,
  updating settings with a supported explicit model/reasoning pair, rejecting an
  unsupported explicit model, rejecting unsupported reasoning for the selected
  model, and accepting `provider_default` without persisting a fake model id.
- Semantic graph service tests cover immediate runtime config application after
  a settings update and confirm already queued runs keep their Phase 2 settings
  snapshot.
- Existing `ReadCartographerRun` and `ListCartographerRuns` tests should remain
  the audit endpoint coverage; do not add parallel run-audit handler tests for
  new duplicate endpoints.
- Generated TypeScript/preload/main tests cover the new settings and model
  option IPC surfaces.
- Because this phase touches HTTP contracts, generated backend contracts, IPC,
  preload, and settings persistence, run deterministic end-to-end app workflow
  coverage through the production Electron/main/preload/renderer/HTTP/store
  paths before committing implementation code.

Implementation note:

- Phase 5 was implemented by adding `ReadSemanticCartographerSettings`,
  `UpdateSemanticCartographerSettings`, and
  `ListSemanticCartographerModelOptions` as Go-owned endpoints.
- The update contract now accepts `SemanticCartographerSettingsInput`, while
  `updatedAt`, `settingsHash`, `createdAt`, and the singleton row id remain
  backend-owned response fields.
- Settings updates fetch the workspace Codex model catalog through the chat
  service, validate the candidate settings against that catalog, persist the
  canonical settings row, and re-apply runtime cartographer defaults without
  rewriting already queued run snapshots.
- `CartographerProcessingState` now includes `settingsHash`,
  `effectiveProcessingConfig`, `lastProcessedRunSummary`, and
  `lastFailureRunSummary`.
- The existing `ReadCartographerRun` and `ListCartographerRuns` endpoints remain
  the run-audit read path; no duplicate run-audit endpoints were added.
- Generated TypeScript, main IPC, preload IPC, and shared renderer types expose
  the new settings and model-option APIs. The contract generator now supports
  non-struct endpoint response types so the model-options endpoint can return
  `[]chat.ChatModelOption` directly.
- No persistent schema changed in Phase 5, so the semantic graph store remains
  version `12`.

## Phase 6 - Settings UI

Phase 6 is ready to implement. It should add a `Cartographer` subtab to the
existing Settings panel and keep the UI as a client of the Phase 5 backend
contracts.

One backend-backed UI metadata gap remains: reset-to-default needs a
backend-owned default settings input. Do not hardcode cartographer defaults,
numeric bounds, or validation relationships in the renderer. Recommended first
step for Phase 6:

- Add or extend a Go-owned settings metadata/read contract that returns the
  current `SemanticCartographerSettingsRecord`, a
  `defaultSettings: SemanticCartographerSettingsInput`, and any field bounds or
  relationship descriptors needed for numeric controls.
- Regenerate TypeScript and update IPC/preload only if this metadata surface is
  added. No persistent schema change is expected.

Renderer integration:

- Before exposing settings edits in the UI, verify runtime settings application
  is synchronized: observation config changes should be applied under the
  cartographer observer mutex, and automatic-processing config changes should be
  applied under the automatic-processing mutex. Add a focused regression test or
  race-oriented service test if this path changes.
- Add a renderer store, for example
  `desktop/src/renderer/src/stores/semantic-cartographer-settings-store.ts`,
  instead of mixing cartographer settings into `appearance-store`.
- The store should hold status, error, current record, draft
  `SemanticCartographerSettingsInput`, model options for the selected workspace,
  processing state, dirty state, and save/revert/reset actions.
- Resolve the selected workspace from `useWorkspaceStore.session`. Settings are
  still global, but model option listing and settings updates require
  `workspaceId` for Codex catalog validation.
- If no workspace is selected, the tab can still show already loaded global
  settings as read-only, but model-dependent controls and Save should be
  disabled until a workspace is available.
- Track request generation or workspace id on async loads so a slow model
  catalog request from an old workspace cannot overwrite the current selected
  workspace's options.
- Load on tab activation, selected workspace change, save/revert/reset, and
  explicit refresh. Do not add polling; use existing semantic graph events or a
  manual refresh action if the audit summary needs to be refreshed while the tab
  is open.

Controls:

- Toggle automatic processing.
- Segmented control for task profile: `Live` and `Final`.
- For each task profile, use an explicit model-selection control with
  `Provider default` and `Explicit model` modes. Provider default is a settings
  mode, not a fake model option.
- Show the provider-reported default model from `ChatModelOption.isDefault` when
  the catalog reports one.
- Explicit model select options must use `ChatModelOption.model` as the saved
  value and `displayName`/`description` only for presentation.
- Reasoning effort options must come from the selected model's
  `supportedReasoningEfforts`. For provider default, use the default model's
  supported efforts when the catalog reports a default model.
- Numeric inputs or steppers for concurrency, per-source concurrency, queue cap,
  lease duration, and input budgets.
- Reset-to-default and save/revert actions.
- Read-only audit summary for the last few runs: status, profile, model,
  reasoning effort, duration, input size, and error/no-op reason.
- Include the compact runtime summary from `ReadCartographerProcessingState`,
  especially settings hash, effective processing config, last processed run, and
  last failure run.

UI requirements:

- Keep the settings screen operational and compact, not a marketing surface.
- Do not put settings cards inside other cards.
- Do not expose unsupported model/reasoning combinations as selectable.
- If a saved setting is no longer present in the current model catalog, show the
  unsupported value with a field-level validation error and require an explicit
  user edit before Save succeeds.
- Show validation errors next to the relevant control.
- Keep advanced processing/window-size controls grouped separately from common
  model/reasoning controls.
- Keep display text sized for the existing settings panel. Avoid hero-scale
  headings, oversized explanatory copy, and card-heavy layouts.

Recommended Phase 6 tests:

- Store tests cover loading settings, loading model options for the selected
  workspace, save/revert/reset behavior, backend validation errors, and stale
  workspace-load protection.
- Settings panel tests cover the new `Cartographer` subtab, disabled state with
  no selected workspace, provider-default vs explicit model mode, reasoning
  option filtering, unsupported saved model/reasoning display, and save button
  dirty/busy behavior.
- If a metadata/defaults contract is added, add HTTP, generated TypeScript, IPC,
  and preload tests for that surface.
- Run focused renderer checks:

```text
pnpm -C desktop exec vitest run src/renderer/src/stores/semantic-cartographer-settings-store.test.ts src/renderer/src/components/settings-panel.test.tsx
pnpm -C desktop typecheck
```

- Because the implementation is a user-facing settings workflow that persists
  through production renderer/preload/main/HTTP/store paths, include a
  deterministic Electron E2E that opens a workspace, opens Settings ->
  Cartographer, edits model/reasoning or processing settings, saves, reloads,
  and verifies the persisted values are shown.

## Phase 7 - Final Synthesis Input Budgeting

The failed `workflow_done` run in local state shows that final synthesis can
exceed the Codex maximum input length.

Fix final synthesis before increasing reasoning effort or concurrency:

- Measure serialized input size before calling Codex.
- Apply deterministic truncation/summarization before the harness call.
- Record `input_bundle_bytes`, truncation reasons, and dropped/folded window
  counts in run audit.
- Add a hard validation error when the input still exceeds the provider limit.
- Keep the final synthesis budget configurable but bounded.

This phase should make failed final synthesis explainable and prevent an
expensive high-reasoning task from being started with impossible input.

## Phase 8 - Recording and Debug Integration

Extend recording capture so future reports answer the model/reasoning question
without manual SQLite queries.

Record:

- Current cartographer settings.
- Cartographer processing state.
- Recent run audit list.
- Recent failed/no-op/applied runs.
- Run model/reasoning fields.
- Queue wait and harness duration.
- Input size and close reason.
- Last failure message and diagnostics.

Renderer graph debug mode should include the same compact cartographer runtime
summary that the Settings page shows.

## Phase 9 - Verification

Focused backend checks:

```text
./scripts/go.sh test -count=1 ./internal/semanticgraph
./scripts/go.sh test -count=1 ./internal/httpapi
./scripts/go.sh test -count=1 ./internal/chat
```

Renderer checks:

```text
pnpm -C desktop exec vitest run src/components/settings-panel.test.tsx
pnpm -C desktop exec vitest run src/features/workspace-graph/semantic-graph-state.test.ts
pnpm -C desktop build
```

Required E2E coverage:

- Fake Codex structured cartographer receives configured model and reasoning
  effort.
- Run audit persists requested/effective/reported model fields.
- Run audit persists requested/effective reasoning effort.
- Settings persist across restart.
- Invalid settings fail loudly.
- Final synthesis input over budget is truncated or fails before harness start
  with a clear audit diagnostic.
- Recording output includes settings and recent run audit.

If local ChatGPT auth is available, run the live Codex E2E flow that exercises
semantic cartographer configuration. Do not use `OPENAI_API_KEY` for live Codex
verification.

Before any implementation commit that changes executable code, contracts,
generated outputs, or tests:

```text
./scripts/format.sh
./check_quality.sh --all
```

## Open Decisions

None. The product decisions above are resolved for this implementation pass.

## Success Criteria

- The Settings panel has a Cartographer tab with explicit model and reasoning
  controls.
- Automatic cartographer runs no longer inherit chat defaults accidentally.
- SQLite run audit can answer: what model and reasoning effort did this run
  request, what did Setta send, what did Codex report, how long did it take, and
  why did it no-op/fail/apply?
- Recordings include enough cartographer audit data to diagnose slow or missing
  semantic updates.
- Final synthesis cannot fail invisibly due to oversized input.
- The implementation keeps cartographer settings independent from chat
  conversation settings and uses generated frontend contracts.
