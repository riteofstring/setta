# Setta 4 Phase 0 Ownership And Foundation Inventory

Date: 2026-07-24

## Review boundary

This report closes three Phase 0 items in
`docs/plans/setta-4-director-command-center-plan.md`:

- item 2, the Niri/pane responsibility inventory with a retain, replace, or
  delete disposition for each unit;
- item 3, the conversation, approval, resource, speech, credential, and Electron
  production paths that must survive the cutover;
- item 4, the Master, conversation, renderer projection, speech, and performance
  foundations to reuse, rehome, reshape, or delete.

The source inventory was reviewed at Setta revision
`4662e670e7e5b80fe67ad00d00ee8fb558f01d40` with a clean worktree.

This is an ownership and deletion map, not permission to keep adapters between
the pane product and the Director command center. "Replace" means the named
responsibility moves to a Setta 4 owner and the old implementation is deleted
once the replacement owns the behavior. It does not mean a compatibility layer
that reads pane state.

Line and file counts include tests and fixtures, because the review surface for
the cutover diff includes them.

### Not covered by this report

Phase 0 items 1, 6, 7, and 8 are still open. Item 7 in particular is an
interactive measurement, not a repository edit: capturing the pre-cutover
interaction and rendering baseline requires running the Electron app on target
hardware with a real display refresh rate. That capture is recorded as a release
gate in the final section rather than asserted here.

### Codex protocol baseline at this review

`internal/codexapp/protocolschema/UPSTREAM` still records upstream commit
`2b9c05046038c038ec6bddb9db7d11394995372d`. The local Codex reference repo is at
`99744cfe04`. Refreshing the snapshot is Phase 1 item 2 and is not part of this
inventory.

## 1. Niri and pane ownership inventory

### 1.1 Renderer `workspace-layout/` — 101 files, 30,404 lines, 33 test files

The directory is one deletion unit at the end of Phase 5, but its internals do
not have one disposition. Grouped by responsibility:

| Responsibility group | Representative files | Disposition |
| --- | --- | --- |
| Column/pane geometry and persisted scene | `layout-engine*.ts`, `layout-store.ts`, `layout-reorder.ts`, `column-slots.ts`, `workspace-scene.ts`, `types.ts` | Delete. The Setta 4 shell has one fullscreen composition; there is no column model to preserve. |
| Overview camera, presentation modes, pan/zoom | `presentation-engine.ts`, `presentation-drop-preview.ts`, `presentation-pane-controls.ts`, `overview-pan-session.ts`, `overview-wheel-gesture.ts`, `workspace-overview-ghost.ts`, `pane-render-interpolation.ts`, `trackpad-navigation.ts` | Delete. Workstream navigation is previous/next plus direct selection, not a spatial camera over panes. |
| Manual layout gestures and chrome controls | `pane-drag-reorder.ts`, `pane-drop-intent-equality.ts`, `pane-resize-*.ts`, `resize-phase-tracker.ts`, `pane-focus-click.ts`, `workspace-interactions.ts`, `workspace-frame-actions.ts`, `workspace-shortcuts.ts`, `workspace-toolbar.tsx`, `workspace-mobile-controls.tsx` | Delete. The plan's hard lines forbid pane, tile, split, resize, reorder, and manual layout affordances in the Setta 4 UI. |
| Pane chrome and mount tree | `pane-title-icons.ts`, `pane-title-metadata.ts`, `pane-visual-frame.ts`, `workspace-ui-layout.tsx`, `workspace-layout-layers.tsx`, `workspace-layout-area-*.ts(x)`, `WorkspaceLayoutArea.tsx`, `workspace-availability-surface.tsx` | Delete. Replaced by the fullscreen graph canvas plus the Now/Artifacts rails and composer. |
| Surface hosting and per-pane DOM budget | `surface-registry.ts`, `surface-adapters.ts`, `surface-dom-content.ts`, `react-dom-surface-adapter.tsx`, `react-dom-surface-events.ts`, `runtime-policy.ts`, `workspace-runtime.ts`, `runtime-mode-options.ts`, `benchmark-scene.ts` | Delete. The pane-budget/snapshot-freeze machinery exists to bound many live DOM surfaces; Setta 4 bounds cost through graph level of detail and packed snapshots instead. |
| Native `BrowserView` proxying | `browser-surface-proxy-adapter.ts`, `native-view-bounds-batcher.ts` | Delete as pane surfaces. Native web content returns only if Phase 4 gives it a typed capability or artifact view; it must not return as a pane kind. |
| Conversation-to-pane coupling | `conversation-pane-coordinator.ts`, `conversation-pane-resource-binding.ts`, `conversation-pane-runtime.ts`, `master-pane-focus.ts`, `app-pane-layout-adapter.ts` | Replace. These hold the presentation authority the app-scoped workstream registry takes over in Phase 3. Delete after the registry owns selection, creation placement, and resource binding. |
| Frame scheduling and measurement | `frame-scheduler.ts`, `animation-clock.ts`, `metrics.ts`, `performance-report.ts` | Rehome before Phase 5 deletion. See section 3.5; these are the only renderer-side frame sampler, long-task observer, and report writer in production code. |

### 1.2 Renderer stores

| File | Disposition |
| --- | --- |
| `stores/conversation-pane-store.ts` | Replace. It is the pane-identity index for conversations (`paneIdByConversationId`, `focusedPaneId`) and is fed from `WorkspaceScene`. The workstream registry replaces it. |
| `stores/workspace-store.ts` | Reshape. Folder workspaces stay as a resource concept; workspace selection must stop being the app's primary selection state. |
| `stores/conversation-store.ts`, `stores/conversation-projection.ts`, `stores/conversation-projection-runtime.ts` | Retain as canonical inputs. See section 3.3. |
| `stores/conversation-navigator-store.ts` | Reshape into the ordered workstream list, including folderless workstreams. |
| `stores/conversation-routing-store.ts` | Reshape into Director decision/clarification state. |
| `stores/runtime-derived-state.ts` | Reshape. It is the single reset path for renderer state on runtime switch and must keep that role for registry and graph state. |
| `stores/appearance-store.ts`, `stores/settings-navigation-store.ts`, `stores/runtime-store.ts` | Retain. |

### 1.3 App shell and CSS

`desktop/src/renderer/src/App.tsx` (782 lines) is pane-shaped: it imports
`WorkspaceLayoutArea`, `master-pane-focus`, `conversation-pane-coordinator`, and
`conversation-pane-store`, and it brokers pane placement preflight for
conversation creation. Disposition: replace with the fullscreen command-center
shell in Phase 4.

Pane CSS is a delete unit: `workspace-layout.css` (813),
`workspace-pane-chrome.css` (216), `workspace-pane-resize.css` (103),
`workspace-resize-preview.css` (35), `workspace-snapshot.css` (148).
`styles.css` (622) is retained and reshaped for the dark full-canvas hierarchy.

`features/easy-button/` (37 files, 9,678 lines) is the current conversation
surface. Its approval panel, resource-request affordance, rails, artifact and
terminal summaries, and composer bindings are the closest existing analogues of
the Setta 4 rails and composer, so they are **replace, not delete**: the product
behavior moves into the new shell while the pane-title, palette-identity,
lineage, and pane-chrome parts are deleted.

`features/global-master/` (20 files, 6,538 lines) holds pane-scoped Master
surfaces (`app-shell-master-pane-state.ts`,
`app-shell-master-pane-surface.tsx`). The controller, input validation,
transcript view, and conversation picker are replaced by the Director composer
and top workstream navigation.

### 1.4 Electron main, preload, and shared

| Unit | Disposition |
| --- | --- |
| `main/app-pane-layout-ipc.ts` (33), `main/workspace-ui-ipc.ts` (33) | Delete with their endpoints. |
| `main/workspace-browser-views.ts` (949) | Delete as pane-bound native view management. |
| `main/workspace-actions.ts` (57) | Reshape into folder-resource selection, not pane placement. |
| `shared/ipc.ts` channels `appPaneLayoutRead`, `appPaneLayoutSave`, `workspaceReadUILayout`, `workspaceSaveUILayout`, `workspaceBrowserView*` and messages/events `workspaceBrowserViewBatch`, `workspaceBrowserViewKey`, `workspaceBrowserViewSnapshot` | Delete. |
| `shared/conversation-ipc.ts`, `shared/master-ipc.ts`, `shared/speech-ipc.ts`, `shared/role-configuration-ipc.ts` | Retain; rename Master to Director where the concept becomes the product role. |
| `main/session-recorder.ts` (881), `preload/renderer-recorder.ts` | Retain. Repo-local recording under `.recordings/` is measurement infrastructure the cutover needs. |

### 1.5 Go backend

| Unit | Files / lines | Disposition |
| --- | --- | --- |
| `internal/applayout` | 4 / 1,255 | Delete. App-scoped pane layout persistence, including `AppPaneSurfaceKind`, `AppPaneTone`, and `ConversationPaneConfig`. Its `ConversationPaneResourceBinding`/`FolderResourceBinding` shapes are the only reusable content and must be rehomed as workstream resource bindings before deletion. |
| `internal/workspaceui` | 6 / 1,209 | Delete, and it can go early: the renderer persists layout only through `applayout`, and `ReadWorkspaceUILayout`/`SaveWorkspaceUILayout` plus their `workspaceReadUILayout`/`workspaceSaveUILayout` IPC have no renderer caller. The generated `WorkspaceUILayout` type is still the renderer's in-memory scene shape via `app-pane-layout-adapter.ts`, so it is deleted with `workspace-scene.ts`. Includes `workspaceui/conversationpalette`. |
| `internal/runtime/app_pane_layout_bindings.go`, `internal/runtime/workspace_ui_pane_bindings.go` | — | Delete. These are the layout observers that project pane layouts into `conversation.Store` through `ReplaceWorkspacePaneBindings` and `ReplaceFolderlessPaneBindings`. |
| `internal/conversation/store_pane_bindings.go` | — | Delete. `WorkspacePaneBinding` and `FolderlessPaneBinding` make pane identity a durable routing target. |
| `internal/conversation/store_master_presentation.go`, `store_master_route_*.go`, `service_master_route_commands.go`, `router_context.go`, `input_routing.go` | — | Replace. Route authority, target state, and presentation records stay; their pane fields become workstream fields. |
| `internal/master/route_context.go` | `PaneID`, `OriginatingPaneID`, `OpenPaneIDs`, and `OpenPaneCount` in trusted context | Replace with workstream identity and workstream counts. Removing pane ids from model-facing context is required by the plan's decision protocol. |
| `internal/master/contracts.go` presentation intents `focusExistingConversationPane`, `openConversationPane` | — | Replace with workstream presentation intents (Phase 3 item 7). |
| `internal/conversationindex/contracts.go` | `MaxOpenPaneIDs`, per-card `OpenPaneIDs`/`OpenPaneCount` | Replace. Candidate ranking may use workstream activity; it must not use pane ids. |
| `internal/appearance/settings.go`, `color_schemes.go` | `PaneSurface`, `PaneTitleBarSurface`, `PaneEdge`, `PaneSelectedOutline`, `PaneSelectedGlow`, `AllowResizedPanesToOverflowViewport` | Replace with the Setta 4 luminous graph palette tokens. `WorkspaceNavigation` and `MasterVoice` shortcut settings are retained and renamed to workstream navigation and Director voice. |
| `internal/workspace`, `internal/workspacesession` | 2 / 604, 4 / 978 | Retain as folder-resource management. They must stop being a prerequisite for starting work. |
| HTTP endpoints `ReadAppPaneLayout`, `SaveAppPaneLayout`, `ReadWorkspaceUILayout`, `SaveWorkspaceUILayout` | — | Delete from `internal/httpapi/endpoints.go`, then regenerate `desktop/src/generated/backend.ts`. |

### 1.6 Electron E2E workflows

`desktop/tests/electron/workflows.mjs` registers 33 workflows. Pane-specific
workflows are a delete unit once Phase 4 owns the product surface:
`app-pane-layout`, `pane-focus-click`, `pane-resize-handles`, `pane-drag-drop`,
`pane-drag-drop-benchmark-performance`, `overview-zoom-performance`,
`niri-navigation-performance`, `workspace-ultrawide-live-panes`,
`mobile-layout`, `topic-conversation-pane-projection`.

Their supporting drivers and probes go with them: `app-pane-layout-driver.js`,
`pane-focus-click-driver.js`, `pane-resize-handles-driver.js`,
`pane-drag-drop-performance-driver.js`, `pane-drag-feature-probe.mjs`,
`pane-drag-oscillation-probe.mjs`, `overview-performance-driver.js`,
`workspace-overview-performance-helpers.mjs`,
`workspace-ultrawide-live-panes-driver.js`,
`topic-conversation-pane-projection-driver.js`,
`topic-conversation-pane-binding-assertions.mjs`,
`topic-conversation-master-pane-routing.mjs`,
`topic-conversation-layout-recording.mjs`.

`mobile-layout` is a **replace**, not a plain delete: the phone-sized viewport
requirement survives the cutover, so an equivalent Setta 4 phone-viewport
workflow must exist before the pane version is removed.

The remaining 23 workflows must survive with retargeted selectors:
`topic-conversation-creation`, `topic-conversation-provider-thread-lifecycle`,
`topic-conversation-archive`, `topic-conversation-artifact-unresolved`,
`topic-conversation-crash-recovery`, `topic-conversation-palette-identity`,
`master-folderless-routing`, `folderless-conversation-local-voice`,
`topic-conversation-speech-arbitration`, `global-speech-session`,
`microphone-permissions`, `local-macos-voice-capture`,
`instant-voice-capture-phase0-audioworklet`,
`instant-voice-capture-phase0-live-openai`,
`instant-voice-capture-phase4-workflow`,
`easy-button-presentation-recovery-phase0`, `workspace-first-run-recovery`,
`settings-page`, `runtime-picker`, `app-window-drag`,
`topic-conversation-role-configuration`,
`topic-conversation-presentation-configuration`,
`topic-conversation-performance`.

`easy-button-presentation-recovery-phase0` has no pane references today, so it is
a selector retarget only. `topic-conversation-palette-identity` asserts
conversation identity presentation, which workstream navigation still needs, but
its pane-tone vocabulary changes with the palette work in section 1.5.

## 2. Production paths that must survive the cutover

"Survive" means the behavior keeps working through the production
Electron/main/preload/renderer/HTTP/store path across the cutover, even while
its owner is renamed or reshaped. Each row names what breaks if the path is not
carried forward.

### 2.1 Conversation execution and durability

| Path | Owner today | Must survive because |
| --- | --- | --- |
| Durable conversation creation, archive, folderless creation | `internal/conversation/service.go`, `service_archive.go`, HTTP `CreateTopicConversation`, `ArchiveTopicConversation` | Workstreams are conversations in the initial cutover mapping. |
| Turn submit, queue, promote, steer, stop | `service_turns.go`, `service_controls.go`, HTTP `SubmitConversationInput`, `StopTopicConversationTurn` | The Director decision protocol's send/queue/steer/cancel decisions have no other execution path. |
| Trajectory event commit and ordering | `trajectory.go`, `trajectory_validation.go`, `store_trajectory_records.go`, `store_events.go` | The graph projector is defined as a projection of these events. |
| Snapshot + cursor reads and event stream | `store_snapshot*.go`, HTTP `ReadConversationSnapshot`, `ConversationEventStream` | Push-driven live updates and replay depend on cursored subscription. |
| Outbox and committed-event wake | `store_outbox.go`, `store_transaction.go` | Removing this forces polling, which the plan forbids. |
| Side conversations, forks, branch decisions | `service_sides.go`, `service_side_turns.go`, `service_forks.go`, `branch*.go` | Delegation and child-workstream edges map onto these. |
| Provider thread binding and agent recovery | `service_thread_binding.go`, `service_agent_*.go`, `agent_recovery.go`, `store_agent_recovery.go` | Blocked/retry/recovery graph states require the typed lifecycle facts these commit. |
| Narrator context, output commit, and recovery | `internal/narration` (38 files, 16,460 lines), `narrator_*.go` in `internal/conversation` | Public summaries and Director interpretations need a validated model-output commit path with recovery. |
| Role/model configuration | `role_configuration_service.go`, `role_profile*.go`, HTTP `Read*RoleConfiguration`, `Update*RoleProfiles` | Runtime/model identity is required provenance on interpretation nodes. |

### 2.2 Approvals

`service_agent_approvals.go`, `internal/agent/approvals.go`, trajectory kinds
`approval_requested` and `approval_resolved`, HTTP
`SubmitTopicConversationApproval`, and the renderer approval projection in
`features/easy-button/easy-button-approval-projection.ts` plus
`easy-button-approval-panel.tsx`. Secret approval questions are already modeled
(`TrajectoryApprovalQuestion.Secret`), and that redaction boundary must survive
into public graph state.

### 2.3 Resource requests

This is the weakest surviving path and needs work in Phase 1.

Today the only typed fact is the routing failure code
`conversation_resource_required`. The renderer converts it to an affordance in
`easy-button-conversation-commands.ts`, and that conversion is gated on a
non-null pane id, so the "choose a folder" action literally cannot render
without pane identity. Folder binding itself is durable
(`service_resources.go`, HTTP `BindTopicConversationFolder`).

Disposition: retain folder binding, and add durable resource-request and
resolution records with lifecycle so `resource_required` nodes have an owner.
Do not carry the pane-gated derivation forward.

### 2.4 Speech and voice

`internal/speech` (22 files, 5,094 lines) keeps the external provider boundary:
capabilities, transcription session creation, synthesis resolve/synthesize,
voice selection for Director and narrator. Renderer
`features/global-speech/` (48 files, 12,785 lines) keeps buffered microphone
capture with its AudioWorklet path, realtime transcription transport, capture
availability and arbitration, and local macOS capture/output providers. Main
process keeps `speech-ipc.ts`, `microphone-permissions.ts`,
`local-macos-voice-helper.ts`, and model download management.

Phase 4 connects these through the same Director intents as text; the capture
and playback controllers must not gain pane awareness in the interim.

### 2.5 Credential storage

`main/speech-credential-vault.ts` with Electron `safeStorage`,
`main/speech-credential-coordinator.ts`,
`main/speech-provider-selection-store.ts`, and backend
`internal/runtime/speech_credential_management.go` /
`speech_credential_policy.go`, with HTTP validate/load/clear endpoints. The
privacy boundary enforced by `internal/runtime/speech_privacy_test.go` must
survive: credentials never enter durable semantic events, snapshots,
recordings, or reports.

`internal/codexaccount` and `internal/runtimeauth` similarly survive: ChatGPT
auth is the required provider path, and no OpenAI API key requirement may be
introduced.

### 2.6 Electron production paths

`main/index.ts` window and app lifecycle, `main/backend-supervisor.ts` and
`backend-status.ts` for the Go backend process, `main/backend-auth-fetch.ts` and
`backend-request-lifecycle.ts`, `main/conversation-event-stream.ts` and
`conversation-event-registry.ts` for cursored event forwarding,
`main/conversation-ipc.ts`, `master-ipc.ts`, `runtime-ipc.ts`,
`runtime-registry.ts`, `runtime-pairing.ts`, `known-runtime-store.ts`,
`editor-apps.ts`, `window-drag.ts`, and `preload/index.ts` typed API exposure.

## 3. Reusable foundation inventory

### 3.1 Master routing → Director decision protocol

`internal/master` (26 files, 8,826 lines) already provides the shape Phase 3
needs: strict structured route output (`route_output.go`), trusted route context
with allowed decision kinds (`route_context.go`), durable route decision records
and commands (`route_command*.go`, `route_decision_values.go`), clarification,
cancellation (`input_routing_cancellation.go`), and route recovery.

The existing decision catalog is `send_to_agent`, `queue_agent_turn`,
`steer_active_turn`, `ask_narrator`, `focus_conversation`, `create_conversation`,
`create_side_conversation`, `fork_conversation`, `clarify`, `answer_global`.

Reshaping required:

- targets carry `PreferredPaneID` and `applayout.ConversationPaneResourceBinding`
  today (`clonePresentationTarget`); both become workstream-owned fields, and
  `internal/master` must stop importing `internal/applayout`;
- `focus_conversation` becomes workstream selection, and the two
  pane-presentation intents in `contracts.go` become workstream presentation;
- the model-facing context must lose `PaneID`, `OriginatingPaneID`,
  `OpenPaneIDs`, and `OpenPaneCount`;
- product-facing naming moves from Master to Director where it is the product
  role; `MasterVoice*` and `master`-prefixed IPC and endpoints are included.

### 3.2 Durable event catalog

`internal/conversation/trajectory.go` already commits 27 typed trajectory event
kinds: `user_input_accepted`, `turn_queued`, `turn_promoted`, `turn_started`,
`turn_steered`, `turn_interrupted`, `turn_completed`, `turn_failed`,
`agent_public_text_delta`, `agent_message_completed`,
`public_reasoning_summary_updated`, `plan_changed`, `activity_started`,
`activity_progressed`, `activity_completed`, `activity_failed`,
`file_change_proposed`, `file_change_completed`, `approval_requested`,
`approval_resolved`, `subagent_started`, `subagent_updated`,
`subagent_completed`, `artifact_emitted`, `agent_liveness_changed`,
`provider_lifecycle_changed`, `model_rerouted`.

That covers most of the plan's initial event-mapping table directly, which is why
Phase 1 extends contracts instead of inventing an event model. `TrajectoryEventKind`
is already generated into TypeScript through the contract value sets in
`internal/conversation/contracts.go`.

### 3.3 Renderer conversation projection

`stores/conversation-projection.ts` already models bounded snapshot loading,
cursor-ordered event application, and six typed resync reasons
(`collection_window_overflow`, `event_before_snapshot`, `event_schema_changed`,
`event_sequence_gap`, `event_stream_changed`, `server_required`).
`stores/conversation-projection-runtime.ts` already does reference-counted
retention, per-animation-frame flush batching, and referential stability across
unrelated conversations.

These are the direct inputs to the app-scoped Director subscription and to the
`resync_required` contract. Reshaping required: the projection is
conversation-scoped and keyed by `workspaceId`/`conversationId`; the Setta 4
registry needs app-scoped versioning plus aggregation across workstreams.

### 3.4 Speech foundations

Reusable as-is for Phase 4 wiring: fast buffered capture with a sample ring,
provider coordination and selection, desktop credential storage with safe
restoration into the runtime, and the existing speech arbitration between
Director and conversation destinations
(`features/global-speech/speech-capture-destination.ts`,
`global-speech-conversation-submission.ts`).

### 3.5 Performance measurement foundations

Reusable without change:

- `desktop/tests/electron/performance-frame-budget.mjs` already encodes the
  120 Hz target (8.33 ms), p95/p99 multipliers, slow-frame ratio, dropped-frame
  and long-task assertions;
- `desktop/tests/electron/electron-workflow-harness.mjs`,
  `electron-cdp-harness.mjs`, `cdp-client.mjs` for production-path E2E;
- `main/session-recorder.ts` and `preload/renderer-recorder.ts` with
  `scripts/dev_record_desktop_session.sh` and `scripts/prod_record_desktop_session.sh`;
- the append-only report format under `docs/reports/performance/`.

Must be rehomed before Phase 5 deletion:

- `workspace-layout/metrics.ts` is the only production renderer frame sampler and
  long-task observer (`WorkspaceMetricsCollector`, 315 lines, `targetFrameMs = 8.33`);
- `workspace-layout/performance-report.ts` is the only writer of the
  `__settaWorkspacePhaseSixReports` / `__settaWorkspaceReadPhaseSixReports` /
  `__settaWorkspaceWritePhaseSixFiveResizeReport` globals that every performance
  E2E reads;
- `workspace-layout/frame-scheduler.ts` and `animation-clock.ts` own the
  draw-only-when-needed loop the WebGL2 renderer needs an equivalent of.

Must be retargeted, not deleted: `topic-conversation-performance-driver.js`
injects its own frame profiler and long-task observer, so its sampling survives,
but its DOM assertions query `easy-button-surface`,
`.workspace-frozen-dom-visual`, and `.workspace-snapshot-texture`. Those
selectors must move to Setta 4 equivalents in the same change that replaces the
shell, not one failure at a time.

## 4. Gaps this inventory found

These are inputs to Phase 1 and are recorded here so they are not rediscovered
during implementation:

1. No durable resource-request record exists; see section 2.3.
2. No app-scoped workstream registry exists. `internal/appstate` (2 files, 421
   lines) persists only `SelectedWorkspaceID`, `ActiveWorkspaceIDs`, and
   `RecentWorkspaces`. Selected-workstream persistence without pane identity is
   new state.
3. `conversation.PlanStep` has `Text` and `Status` and no id, so `plan_changed`
   step nodes need ids derived from source event id plus index unless the
   contract adds step ids.
4. Pane identity is durable in three separate places — `internal/applayout`,
   `internal/workspaceui`, and `conversation.store_pane_bindings.go` — and is
   projected into the conversation store by `internal/runtime`. All three must
   be removed together with their projection, not one at a time.
5. Pane identity is inside model-facing trusted context
   (`master/route_context.go`) and inside candidate ranking
   (`conversationindex`). Both must be reshaped before the Director decision
   protocol can claim it has no pane presentation authority.
6. `internal/master` imports `internal/applayout` for resource bindings, so the
   applayout deletion is blocked until workstream resource bindings exist.
7. The renderer frame sampler and performance-report globals live inside the
   Phase 5 deletion scope; see section 3.5.
8. The Codex protocol snapshot is behind the local reference repo; see the
   review boundary.

## 5. Release gates for unavailable verification

The following cannot be produced from repository edits and are recorded once as
release gates rather than repeated as blockers:

- **Pre-cutover performance baseline (Phase 0 item 7).** Requires an interactive
  Electron session on target hardware with a real display refresh rate and
  device pixel ratio. Not captured in this environment.
- **Mockup side-by-side fidelity review (Phase 4 exit gate).** Requires driving
  the built app and the committed mockup on a real display to produce
  screenshots and recordings.
- **Live Codex E2E (Phase 6).** Requires the local Codex CLI signed in with
  ChatGPT auth and no `OPENAI_API_KEY` in the environment.
