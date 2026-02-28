## 2026-02-24 15:45:02 CST

### Consolidated Findings
1. The UI setting reveal websocket result path used an untyped side parse in addition to the typed adapter path, which increased complexity and made failures harder to reason about.
2. In multi-client/share-mode sessions, reveal acknowledgements were not bound to a specific frontend websocket, creating nondeterministic responses when multiple frontends were connected.
3. Frontend reveal logic could do broad DOM scans and plugin reveal errors were sometimes collapsed into generic messages.
4. Backend UI-setting flows still had compatibility-oriented fallback logic and redundant work in set+reveal paths.

### Proposed Fixes Implemented
1. Added a fully typed backend websocket message path for `UISettingRevealResult` and removed the untyped reveal-result fallback parser.
2. Added deterministic frontend websocket selection for reveal requests and bound reveal waiters to an expected websocket id.
3. Optimized reveal lookup to direct anchor selector access and preserved plugin reveal error detail in responses.
4. Removed compatibility-style fallback branches/no-op logic and eliminated duplicate registry rebuild work for set+reveal.
5. Added/updated unit, integration, frontend, and Playwright tests for deterministic reveal routing, error propagation, and reveal behavior.

### UX/DX Before and After
1. UX before: reveal completion could resolve from the wrong client tab/window.
2. UX after: reveal completion resolves only from the targeted frontend websocket, making behavior deterministic.
3. UX before: plugin reveal failures could appear generic.
4. UX after: plugin handler failure details are returned to users/tools directly.
5. UX before: reveal operations could do heavier DOM work on large pages.
6. UX after: reveal uses direct selector lookup, reducing DOM traversal overhead.
7. DX before: mixed typed/untyped websocket handling and fallback branches increased debugging cost.
8. DX after: single typed dispatch path and simpler control flow improve maintainability and diagnosis speed.

## 2026-02-24 16:37:37 CST

### Consolidated Findings
1. Plugin UI settings could disappear when shadowed status rows were keyed only by `pluginId` instead of unique plugin entries.
2. Backend UI-setting registration accepted invalid `valueSchema` payloads and failed later during registry/tool usage.
3. Reveal flow still had a compatibility fallback that could report success without frontend acknowledgement.
4. Frontend reveal behavior had timing races (plugin pane mount and fixed anchor timeout) and exceptions could degrade into backend timeouts.
5. Worker UI-setting registration mutated handler maps before host registration completed, allowing partial state leaks on failure.
6. Per-environment LLM API key anchors introduced non-canonical IDs not represented in the UI-setting registry.

### Proposed Fixes Implemented
1. Removed plugin status-map gating in registry construction and relied on active runtime plugin list semantics.
2. Validated backend registration `valueSchema` with `UISettingValueSchema.model_validate(...)` and failed fast with `PLUGIN_BACKEND_REGISTER_FAILED`.
3. Removed reveal-result fallback success behavior and required `ui_setting_reveal_result_hub` + explicit frontend acknowledgement for reveal success.
4. Replaced fixed anchor polling with duration-based deadline polling and added bounded plugin-handler retry while plugin panes mount.
5. Added exception handling around frontend reveal message processing and always returned structured failed `UISettingRevealResult` payloads on errors.
6. Made worker registration atomic by committing read/write handler maps only after successful `host.register_ui_setting`.
7. Removed non-canonical per-row LLM API key anchors from Project AI settings.
8. Added focused pytest, Vitest, and Playwright coverage for each corrected path.

### UX/DX Before and After
1. UX before: active plugin settings could vanish in shadowed installations.
2. UX after: active plugin settings remain discoverable and actionable.
3. UX before: invalid plugin setting schemas surfaced as delayed runtime failures.
4. UX after: schema issues fail immediately during plugin registration with clear context.
5. UX before: reveal operations could return false success or delayed generic timeout failures.
6. UX after: reveal results are acknowledgement-driven with immediate structured error details.
7. UX before: reveal reliability degraded on slower pane/DOM mount paths.
8. UX after: reveal reliability improves under delayed mount/render conditions.
9. DX before: fallback branches and partial worker side effects obscured root causes.
10. DX after: fail-fast validation and atomic registration simplify debugging and retries.

## 2026-02-25 10:10:25 PST

### Consolidated Findings
1. Reveal targets nested behind collapsed accordions/tabs were not deterministic from tools.
2. UI-setting read/write paths did not enforce runtime `valueSchema` on returned values.
3. `core.app.spec_path` could violate declared schema and app-setting writes failed before app spec creation.
4. Malformed plugin UI-setting metadata could poison global registry/load behavior.
5. Plugin tab key encoding mismatched frontend `encodeURIComponent` handling for punctuation-safe characters.
6. Reveal routing in multi-frontend sessions lacked explicit origin websocket preference.
7. Plugin reveal timeout behavior had a hard 2s retry cap that ignored requested duration.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added reveal activation-step metadata end-to-end; frontend now applies activation steps before anchor reveal.
2. Enforced runtime schema validation for get/set values and mutation old/new payloads with structured error codes.
3. Made app spec-path reads schema-consistent and materialized a minimal app spec on first app-setting write.
4. Isolated malformed plugin metadata per plugin and skipped only invalid contributions; added plugin `defaultValue` schema validation.
5. Aligned backend plugin tab key encoding with frontend/JS URI encoding-safe behavior.
6. Added optional preferred websocket id in agentic context and deterministic sender selection with explicit missing-id errors.
7. Removed plugin reveal hard 2s cap so retries honor full `durationMs`.
8. Added/updated backend unit+integration tests, frontend unit tests, and Playwright E2E coverage for these paths.

### UX/DX Before and After
1. UX before: reveal could fail or hang when targets were inside collapsed Project AI/Run Instructions sections.
2. UX after: reveal opens required containers first and consistently lands on the target setting.
3. UX before: users could read/write values that violated declared setting schemas.
4. UX after: invalid runtime values return structured validation failures immediately.
5. UX before: app setting flows could fail on clean projects before an app spec existed.
6. UX after: app-setting workflows operate from fresh state without manual bootstrapping.
7. UX before: one malformed plugin schema could hide unrelated settings/tools.
8. UX after: only the bad plugin contribution is isolated; core and healthy plugin settings remain available.
9. UX before: plugin reveal could timeout early despite longer requested duration.
10. UX after: reveal waits for the full requested deadline.
11. DX before: multi-frontend reveal attribution and plugin failure triage were ambiguous.
12. DX after: deterministic websocket targeting and structured plugin/validation errors simplify debugging and automation.

## 2026-02-25 11:21:35 PST

### Consolidated Findings
1. Cross-source plugin UI-setting collisions (schema + backend registration) could still crash global registry build instead of isolating plugin faults.
2. Project AI reveal determinism was incomplete because `llm_api_keys` and `agent_profiles` lacked activation metadata for collapsed accordion state.
3. `set_ui_setting_value(..., revealAfterSet=True)` dropped section context and could fail right-pane reveal even when request metadata had `sectionId`.
4. Backend/frontend reveal contract drift persisted because generated frontend types omitted `revealActivationSteps`, forcing cast-based shadow typing.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added canonical plugin contribution indexing by `localSettingId` across schema/backend sources and isolated collisions into plugin-scoped errors instead of global registry failure.
2. Added required `revealActivationSteps` metadata for Project AI `llm_api_keys` and `agent_profiles` and added registry validation for required core activation-step coverage.
3. Added shared section-context resolution and wired `set_ui_setting_value(..., revealAfterSet=True)` to pass resolved section context into reveal flow.
4. Regenerated frontend websocket contract types so `UISettingRevealTarget` includes `revealActivationSteps`; removed frontend cast-based workaround typing.
5. Added/updated backend unit+integration tests, frontend unit/integration tests, and Playwright coverage for collision isolation, reveal metadata, and reveal context behavior.

### UX/DX Before and After
1. UX before: one plugin contribution collision could make UI-setting tools unavailable globally.
2. UX after: only conflicting plugin contributions are isolated while core and healthy plugin settings remain available.
3. UX before: revealing some Project AI settings depended on current accordion state.
4. UX after: reveal consistently expands the required accordion item first.
5. UX before: set+reveal could report reveal failure for right-pane settings despite available request context.
6. UX after: set+reveal uses request context deterministically and succeeds when valid section context is present.
7. DX before: generated contract mismatch required local casts and made payload shape less trustworthy.
8. DX after: reveal payload shape is represented directly in generated types, reducing workaround code and drift risk.

## 2026-02-25 12:13:40 PST

### Consolidated Findings
1. UI-setting tool boundaries had inconsistent canonicalization for `settingId`, so whitespace-equivalent IDs behaved differently across reveal/get/set.
2. Some write paths could mutate persisted plugin state before validating pre-write runtime schema invariants.
3. Frontend reveal timing semantics were not strictly request-bounded (batch processing and plugin handler waits could overrun requested budget).
4. Right-pane reveal preconditions were incomplete; unsupported section-type/tab combinations degraded into timeout-like failures instead of immediate contract errors.
5. Websocket reveal handling did not harden malformed payload paths enough to guarantee deterministic `UISettingRevealResult` acknowledgement behavior.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added shared `_normalize_setting_id(...)` and applied it uniformly to reveal/get/set entrypoints.
2. Enforced pre-write invariant validation in set paths by validating old value before write, then validating new value after write.
3. Updated plugin config and backend plugin write builders to validate old value against `valueSchema` before any write operation.
4. Switched frontend reveal to a request-level monotonic deadline budget with per-target remaining-time enforcement and bounded plugin handler execution.
5. Added fail-fast right-pane compatibility validation for section-type/tab support before attempting anchor polling.
6. Scoped reveal activation-step state writes strictly to request `projectConfigId` (no ambient active-project override).
7. Hardened websocket reveal message handling with runtime payload/target guards and guaranteed ACK emission for malformed payloads.
8. Added/updated backend unit+integration tests, frontend Vitest tests, and Playwright E2E coverage for these behaviors.

### UX/DX Before and After
1. UX before: whitespace-padded IDs could fail on get/set while reveal succeeded.
2. UX after: whitespace-equivalent IDs resolve consistently across all UI-setting tools.
3. UX before: a failed set could still partially mutate state when stored old values were already invalid.
4. UX after: failed invariant checks are side-effect free; successful responses align with persisted state changes.
5. UX before: reveal timing could appear nondeterministic in plugin-heavy or multi-target flows.
6. UX after: reveal succeeds/fails within one explicit request deadline with predictable timeout behavior.
7. UX before: unsupported right-pane tabs produced delayed, non-actionable failures.
8. UX after: incompatible tab/section-type combinations fail immediately with explicit error context.
9. DX before: malformed reveal payloads could obscure root cause behind timeout symptoms.
10. DX after: malformed payloads produce deterministic failed ACKs, improving observability and debugging.

## 2026-02-25 13:42:04 PST

### Consolidated Findings
1. Reveal origin context was not canonicalized across agentic entrypoints, so multi-frontend reveal requests could route to the wrong websocket.
2. Reveal timeout handling for plugin handlers did not provide cancellation, so timed-out requests could still produce late side effects.
3. Plugin config write traversal still failed open on structural corruption by coercing invalid shapes.
4. Right-pane reveal could mutate active section state before section/tab compatibility was validated.
5. `set_ui_setting_value` lacked an explicit guard for writer old-value drift against the validated pre-write snapshot.
6. Plugin reveal handler success was fail-open for non-boolean truthy returns.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added `frontend_websocket_id` as a first-class agentic context field and propagated it through session context, MCP headers/meta, tool runner, managed executor, and external agent runner.
2. Added reveal routing fail-fast behavior when multiple frontend sockets are connected and no origin websocket id is present.
3. Added backend right-pane section/tab compatibility validation before section activation so incompatible requests fail without mutating active selection.
4. Replaced permissive plugin config write traversal with strict root/intermediate type validation and removed silent structure repair.
5. Added a `set_ui_setting_value` postcondition guard that rejects mutations when writer `oldValue` does not match the validated pre-write value.
6. Added `AbortSignal` to plugin reveal handlers, abort-on-timeout behavior, and strict boolean success semantics (`handled === true` only).
7. Added/updated backend unit+integration tests, frontend unit tests, and Playwright coverage for routing, compatibility validation, strict write semantics, and plugin reveal contract enforcement.

### UX/DX Before and After
1. UX before: reveal requests in multi-frontend sessions could target the wrong tab/window.
2. UX after: reveal targets are deterministic to origin websocket or fail fast with an explicit routing error.
3. UX before: plugin reveal operations could still complete visually after timeout/error responses.
4. UX after: timed-out plugin reveals are aborted and treated as failed without late-success behavior.
5. UX before: corrupt plugin config structures could be silently rewritten during writes.
6. UX after: corrupt structures return explicit errors and writes are side-effect free.
7. UX before: incompatible right-pane reveal requests could still change active section focus.
8. UX after: incompatible requests fail immediately without changing `activeIds`.
9. DX before: truthy non-boolean plugin reveal returns masked contract violations.
10. DX after: malformed handler returns are surfaced immediately with explicit contract failures.
11. DX before: set-path old-value drift could create snapshot inconsistency during debugging.
12. DX after: old/new mutation semantics are enforced against a single validated pre-write snapshot.

## 2026-02-25 14:53:43 PST

### Consolidated Findings
1. Plugin operational-state handling was inconsistent across UI-setting discovery/read/write/reveal paths (`pending_restart` and mixed `shadowed`+`active` status ordering).
2. Plugin config read traversal still failed open on structural corruption while write traversal failed closed.
3. Reveal acknowledgements could be produced against the wrong project context because frontend reveal execution did not gate on requested `projectConfigId`.
4. Frontend plugin reveal loops retried terminal handler failures until timeout, creating duplicate side-effect risk.
5. Multi-frontend websocket affinity was enforced at reveal-time but not fully sourced at managed/external chat and `runMcpTools` ingress.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added shared plugin runtime availability/state helpers and operational-state predicate; applied them to registry build/runtime checks and MCP reveal support checks.
2. Updated runtime plugin checks to resolve across all status rows and accept operational states (`active`, `pending_restart`), including mixed `shadowed`+`active` ordering.
3. Unified plugin config read traversal with strict write-style validation so structural mismatches return explicit `mutation_failed` errors while missing leaf keys still return defaults.
4. Added frontend fail-fast reveal project-context gate; mismatched `projectConfigId` now returns structured failed statuses and performs no pane/DOM mutation.
5. Changed plugin reveal handler loop semantics to stop on terminal failures once tab availability is confirmed.
6. Added frontend websocket affinity state/actions and propagated `frontendWebsocketId` through managed/external chat ingress, `AgentRunner` context construction, generated request types, and listener `runMcpTools` routing.
7. Added/updated backend pytest, frontend Vitest, and Playwright tests covering all corrected behaviors.

### UX/DX Before and After
1. UX before: plugin settings could disappear or be marked unavailable during `pending_restart` or mixed status-row ordering.
2. UX after: plugin settings remain operationally available whenever runtime state is operational and an active runtime entry exists.
3. UX before: corrupted plugin config shape could appear valid on read, then fail later on write/reveal.
4. UX after: structural corruption is surfaced immediately and consistently during reads/writes.
5. UX before: reveal could report success/failure for the wrong project after fast project switching.
6. UX after: cross-project reveal mismatch fails explicitly with deterministic, per-target failure statuses.
7. UX before: persistent plugin reveal failures could retrigger handler execution repeatedly until deadline.
8. UX after: terminal plugin reveal failures return once, reducing repeated side effects and noisy retries.
9. UX before: multi-frontend reveal flows could fail due to missing origin websocket affinity at ingress.
10. UX after: origin websocket affinity is propagated end-to-end, enabling deterministic routing in multi-frontend sessions.
11. DX before: plugin/runtime availability logic was duplicated and order-dependent across modules.
12. DX after: shared availability helpers provide one semantics path across registry and MCP tool layers.

## 2026-02-25 15:35:24 PST

### Consolidated Findings
1. Frontend websocket affinity still depended on `AllConnections` snapshot timing and address matching, leaving multi-frontend reveal routing nondeterministic for newly connected tabs.
2. UI-setting tool execution context was not resolved from one canonical source, so project/section/share/frontend scoping could diverge between request metadata and session agentic context.
3. In share-scoped paths, project-manager lookup was not consistently session-scoped, allowing hard `Missing share session id` failures at runtime.
4. `set_ui_setting_value` could still report drift-related failures after side effects when writer logic did not enforce pre-write old-value preconditions.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added explicit frontend websocket identity handshake (`FrontendIdentity`) on connect and frontend-side identity storage as the primary affinity source.
2. Added IDE-mode `AllConnections` rebroadcast immediately after `CurrentAddressUpdate` and pathname-change current-address updates for already-open sockets.
3. Added shared canonical UI-setting context resolver (`projectConfigId`, `sectionId`, `chatId`, `shareSessionId`, `frontendWebsocketId`) and applied it across UI-setting tool paths.
4. Unified project-manager resolution through a shared context-aware resolver that always threads `share_session_id` when present.
5. Added structured reveal failure behavior when manager resolution fails in share-scoped contexts.
6. Added preconditioned write support (`expected_old_value`) and enforced pre-write drift guards in core/plugin UI-setting writers before mutation.
7. Added/updated backend websocket tests, MCP/UI-setting tests, Vitest websocket-affinity tests, and Playwright multi-frontend reveal-routing E2E coverage.

### UX/DX Before and After
1. UX before: valid tabs in multi-frontend sessions could fail reveal due to ambiguous routing or unresolved affinity.
2. UX after: each tab receives deterministic websocket identity early and reveal requests route to the initiating frontend reliably.
3. UX before: share-scoped UI-setting operations could fail deep in manager lookup with missing-session errors.
4. UX after: context and manager selection are session-aware and consistent across read/write/reveal.
5. UX before: stale-snapshot drift handling could surface failure responses after state mutation.
6. UX after: precondition checks reject stale writes before mutation, keeping failure semantics aligned with persisted state.
7. DX before: debugging required tracing multiple context/fallback paths with timing-dependent behavior.
8. DX after: one canonical context path plus explicit websocket identity significantly reduces ambiguity and triage time.

## 2026-02-25 16:13:47 PST

### Consolidated Findings
1. UI-setting project resolution still allowed explicit `projectConfigId` arguments to diverge from active agentic context project scope.
2. Right-pane `reveal_ui_setting` could mutate `activeIds` before frontend routability preconditions were satisfied.
3. Frontend websocket affinity was not socket-lifecycle scoped, so stale `frontendWebsocketId` values could leak across socket replacement/session switches.
4. Write precondition enforcement still had a non-strict path for writers missing `expected_old_value`, allowing mutation-before-failure semantics.
5. Plugin drift/precondition diagnostics could surface non-canonical internal IDs instead of canonical `settingId` values.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Enforced agentic context as canonical project scope source for UI-setting tools and fail-fast mismatch rejection when explicit `projectConfigId` conflicts.
2. Added explicit `/__setta__/tools/call` invalid-argument mapping for these contract violations, including direct and wrapped mismatch failures.
3. Refactored reveal ordering to complete section/tab compatibility checks and websocket routing preflight before section activation writes; activation now occurs only after routability is confirmed.
4. Removed writer fallback behavior in tool execution: missing `expected_old_value` support now fails before invocation.
5. Added registry-time signature enforcement for writable UI-setting entries so misconfigured writers are rejected at build/registration time.
6. Threaded canonical `settingId` through plugin schema/backend writer precondition checks and drift error paths.
7. Reworked frontend websocket affinity lifecycle to be generation-scoped, with immediate clear on replacement, stale-generation event rejection, and active-generation-only repopulation.
8. Added/updated backend pytest, frontend Vitest, and Playwright coverage for mismatch guards, reveal side-effect safety, strict precondition semantics, canonical diagnostics, and websocket-affinity lifecycle behavior.

### UX/DX Before and After
1. UX before: a scoped agent could be checked against one project while reads/writes/reveals targeted another.
2. UX after: UI-setting tools resolve to one canonical project scope and reject divergent explicit project targets.
3. UX before: failed right-pane reveal attempts could still change active section focus.
4. UX after: reveal failures before dispatch are side-effect free for section activation state.
5. UX before: reconnect/session-switch windows could emit stale websocket affinity and fail routing intermittently.
6. UX after: outbound requests use current-generation affinity or null fallback; stale-id windows are removed.
7. DX before: mutation failures could mask side effects and drift errors could reference internal handler/path IDs.
8. DX after: failure semantics are deterministic, side-effect boundaries are explicit, and diagnostics consistently reference canonical `settingId`.

## 2026-02-25 16:26:44 PST

### Consolidated Findings
1. Regressions were recurring in the same UI-setting contract surfaces because precedence and side-effect invariants were spread across modules/tests rather than asserted in one matrix.
2. Context precedence (agentic vs explicit vs request meta vs defaults) needed direct, parameterized coverage to prevent accidental inversions.
3. Tool-level acceptance coverage was missing for key precedence ties: frontend websocket affinity, share-session resolver precedence, and explicit section override precedence.

### Proposed Fixes Implemented
1. Added a dedicated backend matrix test module for UI-setting context resolution precedence and fallback behavior (`projectConfigId`, `sectionId`, `frontendWebsocketId`, `shareSessionId`, and project-manager lookup scoping).
2. Added MCP UI-setting acceptance tests asserting:
   - explicit right-pane section override wins over agentic/request-meta section context,
   - resolved share-session id wins over request-meta share-session id and is propagated to reveal dispatch,
   - agentic `frontend_websocket_id` wins over request-meta websocket affinity.
3. Ran Ruff and targeted backend pytest for the new matrix and acceptance tests.

### UX/DX Before and After
1. UX before: subtle precedence regressions could silently reintroduce wrong-target reveal routing or wrong-scope context use.
2. UX after: precedence behavior is now asserted with focused matrix and acceptance tests, making regressions fail fast in backend CI.
3. DX before: context behavior required cross-file reasoning and was easy to change accidentally.
4. DX after: canonical precedence contracts are encoded in dedicated tests with explicit scenarios.

## 2026-02-25 17:08:49 PST

### Consolidated Findings
1. Frontend websocket error handling still mixed replacement and transport-failure semantics, allowing `error -> close` reconnect suppression when generation advanced too early.
2. UI-setting reveal dispatch was not delivery-aware, so disconnected/undeliverable targets could degrade into timeout-class failures instead of immediate transport failures.
3. Backend plugin UI-setting writes still had a compare/check/write race window because precondition checking and mutation were not atomic under one lock.
4. `/__setta__/tools/call` still over-classified broad `ValueError` paths as `422 InvalidToolArguments`, obscuring backend invariant/runtime failures.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Split frontend websocket shutdown semantics into replacement-close vs transport-error paths; `error` now closes only the active originating socket without generation pre-bump so active close handlers own reconnect.
2. Made websocket send operations return delivery status and wired UI-setting reveal dispatch to treat non-delivery as immediate failure.
3. Added reveal waiter cancellation on dispatch failure and fail-fast reveal result mapping for undeliverable selected websocket targets.
4. Added atomic `compare_and_write_backend_ui_setting_value` in `PluginManager` and routed backend plugin UI-setting writes through that API.
5. Added explicit plugin stale-precondition error code mapping to canonical `mutation_failed` UI-setting errors.
6. Introduced `InvalidToolArgumentsError` and narrowed `422` mapping to explicit argument-contract failures (plus schema validation); plain/unexpected `ValueError` paths now surface as `500`.
7. Updated MCP tool argument guards to raise the explicit argument-contract exception where applicable.
8. Added/updated backend pytest coverage, frontend Vitest coverage, and Playwright E2E coverage for reconnect behavior, reveal delivery semantics, atomic backend writes, and tools-call status classification.

### UX/DX Before and After
1. UX before: transient websocket transport errors could leave the client disconnected with no reconnect attempt.
2. UX after: transport errors trigger deterministic reconnect flow via the active socket close path.
3. UX before: reveal requests targeting stale/disconnected frontends often returned slow timeout failures.
4. UX after: undeliverable reveal targets fail immediately with transport-accurate error context.
5. UX before: concurrent backend plugin writers could pass stale precondition checks and still mutate.
6. UX after: stale writes fail atomically before mutation under one lock.
7. DX before: internal invariant/runtime `ValueError` failures were mislabeled as caller argument errors.
8. DX after: 4xx/5xx boundaries align with fault domain, improving observability and triage.

## 2026-02-25 17:57:54 PST

### Consolidated Findings
1. Schema-backed plugin UI-setting writes still checked `expected_old_value` outside the final persisted mutation lock, leaving a stale-write clobber window.
2. UI-setting right-pane reveal activation could mutate `activeIds` before delivery was confirmed, so dispatch failures were not side-effect free.
3. Tool argument classification still leaked caller-contract failures as `500` in multiple paths (`search_ui_settings` blank queries, `search_mcp_tools` tokenless queries, and `read_file_range` out-of-root paths).

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added atomic schema config-path compare-and-write in `PluginManager` under one mutation lock, including precondition check, path mutation, schema validation, persistence, and `(old,new)` return.
2. Routed schema-backed UI-setting writers through the new manager compare-and-write API and mapped stale precondition failures to canonical UI-setting mutation errors.
3. Added reveal rollback behavior: snapshot prior `activeIds`, activate only for the reveal attempt, and restore/broadcast prior `activeIds` when dispatch is undeliverable.
4. Enforced explicit invalid-argument boundaries:
   - `search_ui_settings` now rejects blank queries with `InvalidToolArgumentsError`.
   - `search_mcp_tools` maps tokenization `ValueError` to `InvalidToolArgumentsError`.
   - `read_file_range` maps workspace-boundary `ValueError` to `InvalidToolArgumentsError`.
5. Added/updated backend unit and integration tests covering atomic schema compare-and-write behavior, stale precondition handling, reveal rollback semantics, and `/__setta__/tools/call` 422 contract responses.

### UX/DX Before and After
1. UX before: concurrent schema-backed writes could silently overwrite newer values despite precondition intent.
2. UX after: stale schema-backed writes fail deterministically before mutation.
3. UX before: failed right-pane reveal dispatch could still change active section focus.
4. UX after: undeliverable reveal dispatch restores prior section focus, keeping failure paths side-effect free.
5. UX before: user-fixable input mistakes intermittently surfaced as server failures.
6. UX after: caller mistakes consistently return actionable `422 InvalidToolArguments`.
7. DX before: conflict and error telemetry mixed caller errors and server faults, and reveal failures were harder to reason about.
8. DX after: atomic write invariants and clear 4xx/5xx boundaries improve observability, retries, and triage.

## 2026-02-25 18:49:58 PST

### Consolidated Findings
1. Right-pane `reveal_ui_setting` still had non-timeout failure paths that could leave temporary `activeIds` mutations applied after reveal failure.
2. Share-scoped UI-setting resolution still fell back to main-manager defaults when `projectConfigId` was omitted, risking cross-scope target selection.
3. Core UI-setting stale-write checks were still split between read-time and write-time paths, leaving race windows for clobbering newer values.
4. Persisted plugin config roots that were non-object values could still flow into path writes and attempted rewrites instead of fail-fast invariant errors.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added reveal activation rollback for all non-success outcomes (dispatch-undeliverable, timeout, missing frontend status, and frontend failed status) and enforced share-scope routing affinity by rejecting caller-supplied `frontendWebsocketId`.
2. Updated share-scoped context resolution so omitted `projectConfigId` resolves from the share session manager default project, with fail-fast `KeyError` when absent.
3. Added serialized manager-level compare-and-set APIs for core settings (`watch_code.enabled`, `watch_code.folders`, `watch_code.files`, `project.name`, `project.show_param_display_names`) and routed registry writers through those atomic mutation boundaries.
4. Added strict plugin config root validation in config-path compare-and-write to reject non-object persisted roots before mutation/persistence.
5. Added backend matrix/integration tests and Playwright reveal regression coverage for these paths, plus shared UI-setting mismatch error plumbing to avoid import cycles.

### UX/DX Before and After
1. UX before: reveal failures could still leave section focus changed in some failure classes.
2. UX after: reveal failure paths restore prior `activeIds`, so failed reveal attempts are side-effect free for focus state.
3. UX before: share-scoped calls without explicit project id could read/write/reveal against the wrong default project.
4. UX after: share-scoped calls consistently bind to the share session default project or fail explicitly when missing.
5. UX before: concurrent writes to core settings could pass stale checks and still overwrite fresher values.
6. UX after: stale writes are rejected inside serialized mutation boundaries before state changes.
7. DX before: plugin config corruption at root could surface later as harder-to-diagnose mutation failures.
8. DX after: invalid persisted root structure fails fast with explicit invariant diagnostics, preserving existing persisted data.

## 2026-02-25 19:30:07 PST

### Consolidated Findings
1. Share-scoped reveal routing was internally contradictory: ingress propagated `frontendWebsocketId` while reveal rejected share+frontend affinity.
2. Stale-write preconditions for core settings (`python_codegen_enabled`, `core.app.*`) were still non-atomic across read/check/write boundaries.
3. Share-scoped agentic/meta paths still carried caller-controlled frontend affinity, creating mode-specific routing drift.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added manager-level atomic compare-and-set APIs for `core.run_instructions.python_codegen_enabled` and app metadata fields (`catalog_id`, `spec_version`, `spec_path`, `theme_mode`) so stale-check and mutation execute in one serialized boundary.
2. Refactored UI-setting registry writers for those settings to use only the new manager compare-and-set APIs.
3. Made share-scoped routing server-authoritative by resolving `frontendWebsocketId` to `None` whenever a share session is active and by removing share-scope reveal self-rejection.
4. Dropped share-scoped frontend affinity at ingress/meta boundaries (AI route, listener route, toolkit runner, and managed action executor).
5. Added/updated backend unit+integration tests and Playwright E2E coverage for atomic stale-precondition failures/no-clobber and share-scoped reveal success when affinity metadata is present.

### UX/DX Before and After
1. UX before: valid share-mode reveal calls could fail with `cannot provide frontendWebsocketId`.
2. UX after: share-scoped reveals are routed via server-managed session context and complete deterministically.
3. UX before: concurrent writes to core app/codegen settings could overwrite fresher state while returning success.
4. UX after: stale writes fail at commit boundary and do not clobber newer updates.
5. DX before: split precondition/mutation logic across layers made concurrency behavior difficult to reason about.
6. DX after: one compare-and-set boundary per setting class and one share-routing contract simplify debugging and retry logic.

## 2026-02-25 20:18:42 PST

### Consolidated Findings
1. Right-pane reveal rollback still lacked ownership checks, so failure-path rollback could overwrite newer user-driven `activeIds`.
2. Reveal routing ambiguity and target selection still considered stale frontend sockets by presence rather than deliverability (`CONNECTED` state).
3. IDE-mode routing still accepted caller-provided `shareSessionId` metadata, allowing non-authoritative share-scope influence.
4. `core.project.name` mutation semantics were still split by entrypoint, so rename side effects (metadata broadcast + persistence) were inconsistent.
5. MCP caller-contract failures were still leaking as server faults in key paths (`read_file_range` non-UTF8 decode and `stream_app_definition` malformed/invalid patches).
6. Backend plugin UI-setting compare-and-write still allowed post-write schema-invalid outcomes without transactional failure semantics.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added reveal rollback ownership gating: rollback now executes only when current `activeIds` still match reveal-owned temporary activation state.
2. Enforced reveal candidate filtering to deliverable frontend sockets (`WebSocketState.CONNECTED`) before ambiguity checks and selection.
3. Made share-session scope server-authoritative in IDE mode by ignoring caller/meta `shareSessionId` unless deployment/share scope is active.
4. Unified project rename commit semantics by moving route rename to manager compare-and-set flow and ensuring that flow always broadcasts metadata and persists.
5. Normalized MCP argument-contract errors:
   - `read_file_range` now maps decode-time UTF-8 failures to `InvalidToolArgumentsError`.
   - `stream_app_definition` now maps patch parse/apply validation failures to `InvalidToolArgumentsError`.
6. Extended backend plugin UI-setting compare-and-write with schema validation callbacks for old/new values and explicit rollback semantics for invalid post-write outcomes, including rollback-failure diagnostics.
7. Added/updated backend unit+integration coverage and Playwright E2E coverage for reveal concurrency safety, routing authority, argument classification, rename durability, and plugin write rollback semantics.

### UX/DX Before and After
1. UX before: reveal timeout/failure could jump focus back to stale section selections after user navigation.
2. UX after: reveal failure paths preserve newer `activeIds` and remain side-effect free with respect to superseding navigation.
3. UX before: ambiguity errors and reveal targeting could fail intermittently during reconnect/disconnect churn.
4. UX after: ambiguity and routing decisions reflect live, deliverable frontend sockets only.
5. UX before: IDE requests carrying `shareSessionId` metadata could influence routing mode unexpectedly.
6. UX after: IDE routing remains deterministic and server-authoritative unless runtime is truly in deployment/share scope.
7. UX before: project-name writes via UI-setting path could diverge from route rename visibility/persistence behavior.
8. UX after: rename behavior is uniform across entrypoints and survives reload/restart consistently.
9. DX before: caller input mistakes and server/runtime faults were still partially conflated in tools-call status mapping.
10. DX after: contract failures are consistently classified as `422 InvalidToolArguments`, improving telemetry and triage boundaries.
11. DX before: backend plugin UI-setting failures could return after committing schema-invalid state with unclear recovery.
12. DX after: post-write invalid states trigger explicit rollback attempts and explicit error classes for rollback success/failure paths.

## 2026-02-25 21:50:02 PST

### Consolidated Findings
1. Right-pane reveal activation and rollback still spanned tool-layer and manager-layer mutations, which left concurrency/ownership guarantees weaker than other serialized project-state mutations.
2. Plugin config root validation behavior diverged by path: some read/mutation flows normalized non-object roots while others failed, producing inconsistent runtime/tool errors.
3. Plugin missing-setting diagnostics were keyed only at plugin scope, so one invalid contributed setting could mask unknown IDs from the same plugin namespace.
4. Required right-pane section/tab compatibility logic was duplicated between backend and frontend, creating drift risk.
5. Frontend websocket identity handshake used ad-hoc message typing instead of a fully typed backend/frontend union contract.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added manager-owned queued APIs for reveal activation and conditional rollback of `activeIds`, and routed UI-setting reveal tool flow through those APIs.
2. Enforced strict plugin config object-root validation for runtime-state resolution and config-path compare-and-write, with consistent `PLUGIN_CONFIG_INVALID` semantics.
3. Added setting-level plugin error indexing (`pluginId` + `localSettingId`) and updated missing-setting classification to return `setting_not_found` for unknown IDs not explicitly marked invalid.
4. Introduced a shared canonical section/tab compatibility artifact (`section_ui_editor_tab_compatibility.json`) consumed by both backend and frontend, with coverage tests on both sides.
5. Added typed `FrontendIdentity` websocket message models/enums, updated backend on-connect emission to typed payloads, regenerated unions/types, and removed frontend ad-hoc identity parsing.
6. Added/updated backend unit/integration tests, frontend Vitest coverage, and Playwright reveal-routing coverage for all corrected paths.

### UX/DX Before and After
1. UX before: reveal activation/rollback behavior depended on mixed-layer sequencing and could be harder to reason about under concurrent updates.
2. UX after: reveal activation/rollback now follows one serialized manager boundary with deterministic ownership checks.
3. UX before: corrupt plugin config roots could surface as different error classes across read/write/runtime paths.
4. UX after: corrupt roots fail fast with one consistent invalid-config contract.
5. UX before: unknown plugin setting IDs could be reported as plugin-unavailable due to unrelated invalid contributions.
6. UX after: only explicitly invalid contributed settings return plugin-unavailable; unrelated unknown IDs return setting-not-found.
7. UX before: backend/frontend tab-compatibility drift could produce mismatched reveal behavior.
8. UX after: both sides consume one compatibility source with parity tests.
9. DX before: websocket identity handling required custom parsing paths and increased contract drift risk.
10. DX after: typed union-based identity handling improves maintainability, type safety, and debugging clarity.

## 2026-02-25 22:42:38 PST

### Consolidated Findings
1. Frontend reveal processing still had race windows across websocket generation rollover and project-context changes, and ACK dispatch was not generation-bound.
2. Frontend reveal payload validation duplicated generated schema contracts with literal guards, increasing drift risk.
3. Backend reveal ACK acceptance remained permissive on envelope fields (project + setting set), and rollback ownership still relied on value equality (`activeIds`) with ABA exposure.
4. Share-scoped default project resolution still bypassed the switcher contract path in helper logic.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Introduced generation-scoped reveal queue handling in frontend websocket receive flow, with generation-aware ACK sending and stale-generation drop behavior.
2. Switched frontend reveal payload validation to generated `UISettingRevealContentSchema.safeParse` and removed duplicated manual reveal-target literals.
3. Added reveal execution-context checks in frontend reveal pipeline so project/generation mismatches fail deterministically before further mutations/ACK.
4. Extended backend reveal result hub waiter envelope binding (`expected_websocket_id`, `expected_project_config_id`, `expected_setting_ids`) and fail-closed resolution.
5. Added manager-issued reveal activation leases and lease-gated rollback semantics to eliminate ABA ownership overwrite risks.
6. Updated share default project resolution to always use `project_manager_switcher.get(..., share_session_id=...)`, mapping share-scope `ValueError` to `InvalidToolArgumentsError`.
7. Added/updated backend unit/integration tests, frontend Vitest tests, and Playwright E2E coverage for reveal queueing, stale generation behavior, envelope validation, and ABA rollback protection.

### UX/DX Before and After
1. UX before: reveals could visually execute but timeout or ACK incorrectly after websocket rollover/project switch races.
2. UX after: stale reveal executions are canceled/fail deterministically with no stale-generation ACK emission.
3. UX before: backend could accept envelope-mismatched ACKs and report false reveal success.
4. UX after: reveal success is accepted only for exact websocket/project/setting envelope matches.
5. UX before: failed right-pane reveals could rollback to stale `activeIds` under ABA user navigation.
6. UX after: rollback applies only to the owning reveal lease and does not clobber newer user navigation.
7. DX before: reveal contract behavior required tracing split validation paths and weak ownership semantics.
8. DX after: schema-driven validation, explicit execution context, and lease/envelope contracts make failures reproducible and debuggable.

## 2026-02-25 23:29:15 PST

### Consolidated Findings
1. Share-scoped reveal routing still had context-precedence drift, including ambiguity behavior that depended on transport internals instead of canonical resolved scope + origin affinity.
2. Plugin UI-setting schema parsing and value-schema validation still had fail-stop/coarse-contract gaps, causing valid sibling settings to disappear and structured input mistakes to surface as generic mutation failures.
3. Frontend reveal processing still serialized unrelated requests globally and allowed stale execution-context races to mutate pane/tab/accordion state before failure.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Made share-scope reveal routing context-authoritative: agentic frontend affinity is honored in share scope, request-meta frontend affinity is ignored there, ambiguity handling is explicit by scope, and share/non-share nullification branches were removed.
2. Refactored plugin schema contribution parsing to per-entry isolation with per-setting error indexing so invalid entries are isolated while healthy entries remain discoverable/usable.
3. Extended `UISettingValueSchema` to support recursive structured constraints (`items`, `properties`, `requiredProperties`, `additionalProperties`) and routed watch-code structured writes through canonical typed validation paths.
4. Removed global frontend reveal FIFO request serialization; reveal messages now execute concurrently per request while mutation-critical sections are lock-scoped.
5. Added frontend reveal mutation snapshot/lease rollback semantics so generation/project mismatch failures are side-effect free for local storage pane/tab/accordion mutations.
6. Added/updated backend pytest, frontend Vitest, and Playwright E2E coverage for share routing affinity/ambiguity, plugin mixed-validity schema behavior, structured validation contracts, concurrent reveal handling, and stale-context rollback.

### UX/DX Before and After
1. UX before: share-session reveal targeting could become ambiguous or misrouted under multi-frontend conditions despite valid context.
2. UX after: reveal targeting is deterministic from canonical context or fails fast with explicit ambiguity diagnostics.
3. UX before: one malformed plugin schema entry could hide healthy plugin settings, and structured input mistakes could return opaque `mutation_failed` errors.
4. UX after: malformed settings are isolated, healthy siblings stay available, and structured input mistakes return actionable typed validation errors.
5. UX before: concurrent reveal traffic could block unrelated requests and stale requests could still shift visible pane/tab/accordion UI state.
6. UX after: reveal requests are independently processed and stale-context failures do not leave residual UI state drift.
7. DX before: reveal behavior depended on split context/transport checks and plugin/schema debugging required plugin-level inference.
8. DX after: context precedence, schema contracts, and reveal rollback behavior are explicit, typed, and covered by targeted backend/frontend/e2e tests.

## 2026-02-26 00:04:34 PST

### Consolidated Findings
1. Share-scope frontend affinity was being stripped at ingress/tool-meta boundaries, causing reveal routing ambiguity in multi-frontend sessions even when canonical agentic affinity existed.
2. Right-pane reveal lease ownership was not superseded for newer reveals targeting the same `activeIds`, allowing stale timeout rollbacks to clobber successful newer reveals.
3. `core.run_instructions.python_codegen_enabled` compare-and-set could report unchanged while still mutating persisted state/history on same-value writes.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Preserved canonical `frontendWebsocketId` propagation across AI/listener ingress and toolkit/managed-action tool meta for share scope, while keeping request-meta share precedence rules in context resolution.
2. Added fail-fast ingress validation for malformed `frontendWebsocketId` values (whitespace-only rejected as `400`).
3. Updated manager-owned reveal activation leasing so every reveal request acquires/supersedes lease ownership, even when target `activeIds` already match.
4. Kept reveal no-op activations side-effect free for persisted state by skipping broadcast when `activeIds` do not change.
5. Made `compare_and_set_python_codegen_enabled` truly idempotent for same-value writes with early return before history/save/broadcast mutation.
6. Added/updated backend unit and integration coverage for share-affinity propagation, malformed-affinity validation, reveal lease supersession, and codegen CAS no-op behavior.

### UX/DX Before and After
1. UX before: share-mode reveals could fail as ambiguous despite valid origin affinity.
2. UX after: reveal routing keeps canonical origin affinity across share-scope execution paths.
3. UX before: stale timed-out reveal requests could roll focus back after a newer successful reveal to the same section.
4. UX after: newer reveals supersede stale rollback ownership, preventing focus jump-back regressions.
5. UX before: setting the already-enabled Python codegen value could still create hidden ordering/history churn.
6. UX after: same-value writes are true no-ops with no persisted side effects.
7. DX before: concurrency behavior depended on mode-specific affinity stripping and mutation-dependent lease ownership.
8. DX after: one canonical affinity contract and deterministic lease ownership semantics reduce race debugging overhead.

## 2026-02-26 09:12:21 PST

### Consolidated Findings
1. Generation/cleanup normalization had not yet been run after the latest backend/frontend reveal and routing fixes.
2. Top-level `review*.md` files were temporary review inputs and should not remain once findings are consolidated.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Ran `pnpm gcf` in `frontend/` to execute generation, cleanup, pruning, and formatting synchronization.
2. Recorded this timestamped cumulative review entry to capture the finalized state after cleanup.
3. Removed top-level `review*.md` files from the workspace.

### UX/DX Before and After
1. UX before: stale generated/cleanup drift could reappear in downstream builds and reviews.
2. UX after: generated outputs are aligned with the implemented fixes and cleanup pipeline.
3. DX before: review context was split across transient top-level docs and cumulative history.
4. DX after: review history is centralized in `cumulative_review.md` with transient inputs removed.

## 2026-02-26 10:03:15 PST

### Consolidated Findings
1. Post-fix generation/cleanup synchronization still needed to be executed and recorded for the current workspace state.
2. Top-level `review*.md` source docs remained in the root workspace and needed removal after consolidation.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Ran `pnpm -C frontend gcf` (equivalent execution path for `pnpm gcf` in this repo layout) to regenerate, prune, clean up, and format outputs.
2. Removed all top-level `review*.md` files from the repository root.
3. Captured this run as a new timestamped entry in `cumulative_review.md`.

### UX/DX Before and After
1. UX before: generated artifacts could drift from the latest backend/frontend fixes until cleanup was rerun.
2. UX after: generated and cleaned outputs are synchronized with the current codebase.
3. DX before: temporary review inputs remained alongside canonical cumulative review history.
4. DX after: only consolidated review history remains, reducing review-surface noise.

## 2026-02-26 11:03:02 PST

### Consolidated Findings
1. The earlier cleanup run was interrupted before completion, leaving generation/cleanup state potentially partial.
2. Top-level `review*.md` documents were still present after consolidation and needed removal from the root workspace.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Re-ran `pnpm -C frontend gcf` to completion (generation, cleanup, pruning, and formatting).
2. Removed all top-level `review*.md` files from the repository root.
3. Appended this timestamped entry to keep cumulative review history authoritative.

### UX/DX Before and After
1. UX before: generated/cleanup artifacts could remain in an interrupted intermediate state.
2. UX after: cleanup and generated outputs are synchronized with the current code changes.
3. DX before: transient top-level review docs still added noise to the repository root.
4. DX after: review history is centralized in `cumulative_review.md` and root-level transient review docs are removed.

## 2026-02-26 11:57:49 PST

### Consolidated Findings
1. Workspace cleanup/generation synchronization for the current fix set needed to be executed in the repo's effective frontend package context.
2. Temporary top-level `review*.md` inputs remained present and needed removal after consolidation.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Attempted `pnpm gcf` at repo root, then ran `pnpm -C frontend gcf` (effective equivalent in this repo layout) to complete generate/cleanup/prune/format workflows.
2. Appended this timestamped cumulative entry to record the finalized cleanup state.
3. Removed top-level `review*.md` files from the workspace.

### UX/DX Before and After
1. UX before: generated/cleanup artifacts could be out of sync with the latest implemented fixes.
2. UX after: generation and cleanup outputs are synchronized with the current codebase.
3. DX before: transient review inputs remained alongside canonical review history.
4. DX after: consolidated review history remains in one place (`cumulative_review.md`) with root-level transient files removed.

## 2026-02-26 21:27:50 PST

### Consolidated Findings
1. Frontend reveal affinity was still tied to per-socket identity, so websocket reconnects could invalidate in-flight reveal routing for the same tab.
2. Reveal ACK envelope mismatches (project/setting contract drift) were still surfacing as timeout-class failures instead of immediate protocol errors.
3. Plugin compare-and-set write paths could return `changed=false` while still executing backend write handlers or schema config persistence/rescan side effects.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Added stable tab-scoped affinity rebinding in websocket manager using the `#setta-ws-affinity=` address marker; affinity tokens now rebind to the latest websocket for the same tab/session.
2. Updated frontend receiver identity flow to re-emit typed `FrontendIdentity` after current-address updates so reconnects converge to the canonical affinity token.
3. Added `RevealResultContractMismatchError` and converted reveal result hub envelope mismatches into fail-fast waiter exceptions.
4. Mapped reveal contract-mismatch exceptions to immediate structured `mutation_failed` responses in `reveal_ui_setting`.
5. Added manager-level no-op gates in plugin backend/schema CAS flows so same-value writes return early before handler invocation, persistence, or rescan.
6. Added/updated backend unit/integration tests and Playwright E2E coverage for affinity rebinding, reveal fail-fast mismatch behavior, and plugin CAS no-op side-effect guarantees.

### UX/DX Before and After
1. UX before: reconnecting a tab during long-running reveal/tool flows could make affinity routing fail as unavailable.
2. UX after: reconnects are transparent for the same tab and reveal routing remains valid.
3. UX before: envelope mismatches looked like slow timeouts, delaying actionable feedback.
4. UX after: contract mismatches fail immediately with explicit mismatch diagnostics.
5. UX before: same-value plugin writes could still trigger hidden side effects despite unchanged responses.
6. UX after: same-value plugin writes are true no-ops, reducing unnecessary work and side-effect risk.
7. DX before: debugging mixed transport/protocol/no-op behavior required tracing across timeout paths and plugin internals.
8. DX after: explicit fail-fast protocol errors and manager-owned no-op gates make behavior deterministic and easier to reason about.

## 2026-02-26 22:05:26 PST

### Consolidated Findings
1. Frontend affinity capability was still derivable/rebindable through mutable `CurrentAddressUpdate` markers and rebroadcast addresses.
2. Initial agentic requests could still be sent before canonical frontend identity readiness, allowing missing affinity submissions.
3. Reveal ACK websocket-origin mismatches could degrade to timeout-class outcomes instead of immediate contract failure.
4. Plugin backend write RPC still coupled mutation classification to serialization of an unused write-handler return payload.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Removed address-derived affinity rebinding/caching from websocket manager and sanitized `#setta-ws-affinity=` marker material out of stored/broadcast `currentAddress`.
2. Kept frontend affinity server-issued per socket and stopped identity re-emission on `CurrentAddressUpdate`.
3. Added generation-scoped frontend affinity readiness gating (`waitForFrontendAffinityToken`) and updated AI submit paths to fail fast when identity is not ready (no null-affinity emission).
4. Converted reveal ACK websocket mismatch handling to immediate `RevealResultContractMismatchError` fail-fast behavior.
5. Simplified plugin write RPC contract to fixed `{"ok": true}` acknowledgements without serializing write return values.
6. Added/updated unit, integration, Vitest, and Playwright coverage for affinity ownership/sanitization, identity readiness gating, reveal mismatch fail-fast, and non-serializable plugin write return handling.
7. Ran `pnpm -C frontend gcf` to execute generation, cleanup, prune, and formatting flows for the updated workspace state.

### UX/DX Before and After
1. UX before: multi-frontend routing could be influenced by mutable address markers and stale rebinding state.
2. UX after: affinity routing is origin-scoped to server-issued socket identity and no longer mutable via address updates.
3. UX before: first requests after generation rollover could go out without canonical frontend identity.
4. UX after: requests are either affinity-ready or fail fast client-side with explicit identity-readiness errors.
5. UX before: wrong-websocket reveal ACKs surfaced as delayed timeout-like failures.
6. UX after: websocket-origin contract violations fail immediately with explicit mismatch diagnostics.
7. DX before: plugin write handlers could mutate state but still fail due to irrelevant return serialization constraints.
8. DX after: write success/failure aligns with mutation/readback invariants and a minimal write ACK contract.

## 2026-02-27 08:41:13 PST

### Consolidated Findings
1. Root-level `pnpm gcf` is not directly runnable in this repo because the root has no `package.json` importer.
2. The wrapper path `./gcf.sh` reached `frontend/scripts/gcf.sh`, but sandbox restrictions blocked its `/dev/fd` tee redirection.
3. Top-level `review*.md` files were not present at the time of cleanup.

### Proposed Fixes Implemented (No Backward-Compatibility Workarounds)
1. Ran `source activate.sh && cd frontend && pnpm generate && pnpm full-cleanup && pnpm f` to execute the exact `gcf` workflow steps without the blocked `/dev/fd` redirection.
2. Appended this timestamped `cumulative_review.md` entry to record the finalized run state.
3. Executed root cleanup for `review*.md` targets.

### UX/DX Before and After
1. UX before: cleanup synchronization depended on a wrapper path that can fail in restricted environments due to shell redirection mechanics.
2. UX after: generation/cleanup/format steps are completed and synchronized for the current workspace state.
3. DX before: this run state was not yet recorded in cumulative review history.
4. DX after: the run outcomes and constraints are explicitly documented in `cumulative_review.md`.
