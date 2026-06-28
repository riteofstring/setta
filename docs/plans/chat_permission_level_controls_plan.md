# Chat Permission Level Controls Plan

## Context

The chat composer currently renders a disabled gear + `Custom` pill through
`PermissionModeUnavailableButton`. Its tooltip says permission presets are not
wired to a current Setta API, so the control is only a placeholder today. The
adjacent model/reasoning picker is already wired through the chat command path,
Codex app-server RPCs, persisted conversation metadata, and generated renderer
contracts.

The goal is to replace the placeholder with real built-in permission controls
for chat conversations. Custom permission profiles are explicitly out of scope
for the first implementation.

## Compatibility Stance

This implementation must be a clean current-contract implementation. Do not add
backward compatibility shims, legacy support paths, migrations, transitional
adapters, dual-read/write paths, old-field aliases, or silent compatibility
fallbacks. Current Codex wire aliases accepted by the app-server protocol are
normalized at the protocol boundary; Setta must not persist aliases or create
alternate storage contracts for them.

Setta should persist and send only the new Setta-owned permission preset
contract and the current Codex app-server permission fields needed by that
contract. Existing conversations without permission settings should resolve
through the normal current default/effective-settings path, not through a
migration or legacy interpretation layer.

## Codex Reference Findings

The upstream Codex repo models permission level as a pair of:

- an approval policy, such as `on-request` or `never`;
- a permission profile, preferably selected by stable profile identity rather
  than inferred from a sandbox shape.

Relevant upstream sources:

- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/utils/approval-presets/src/lib.rs`
  defines built-in presets:
  - `read-only`: `AskForApproval::OnRequest`, active profile `:read-only`,
    concrete `PermissionProfile::read_only()`;
  - `auto`: `AskForApproval::OnRequest`, active profile `:workspace`,
    concrete `PermissionProfile::workspace_write()`;
  - `full-access`: `AskForApproval::Never`, active profile
    `:danger-full-access`, concrete `PermissionProfile::Disabled`.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/protocol/src/models.rs`
  defines `ActivePermissionProfile` as display/provenance metadata and states
  that the runtime must honor the concrete `PermissionProfile`.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
  exposes `approvalPolicy`, `permissions`, and legacy sandbox fields on
  `thread/start`, `thread/resume`, and `thread/settings/update`. The legacy
  sandbox fields are reference context only; Setta must not use them as a
  compatibility path.
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/tui/src/chatwidget/permission_popups.rs`
  applies built-in presets as a single operation that updates approval policy,
  permission profile, active profile metadata, and reviewer state, with an
  explicit confirmation for `full-access`.

In old product language, "YOLO mode" is the same operational posture as
upstream `full-access`: never ask for approval and disable the sandbox. Setta
should use the clearer label `Full Access`, and may describe it as the
YOLO-equivalent mode in warning copy or internal comments.

## Current Setta State

Setta already has some of the protocol pieces:

- `internal/codexapp/protocol_gen.go` includes `ThreadSettingsUpdateParams`
  fields for `approvalPolicy`, `sandboxPolicy`, and `permissions`.
- `ThreadSettings` includes `activePermissionProfile`, `approvalPolicy`, and
  `sandboxPolicy`.
- `ThreadSettingsUpdatedNotification` is handled, but Setta currently converts
  it only into model/reasoning fields.

The gaps are in Setta-owned chat state and UI contracts:

- `ChatCodexSettings` stores only `model` and `reasoningEffort`.
- `ChatCodexEffectiveSettings` stores only model, reasoning, and image support.
- `codexCommandThreadSettings` stores only model/reasoning display data.
- `applyInitialCodexSettings` injects only `model` and `effort` for new
  unlinked conversations.
- The renderer has no real permission picker or set-permission IPC/backend
  endpoint.

## Product Scope

Initial selectable modes:

- `Read Only`: Codex can read workspace files. Writes, network access, and
  broader filesystem access require approval.
- `Ask for approval`: Codex can edit the workspace and run commands. Network
  access or broader filesystem access requires approval. This maps to upstream
  `auto` / `:workspace`; upstream metadata names the built-in preset `Default`,
  but the Codex TUI shows it as `Ask for approval`.
- `Full Access`: Codex can access the broader filesystem and network without
  asking. This is the YOLO-equivalent mode and must require an explicit
  confirmation before applying.

The UI should not expose custom profiles yet. If Codex reports an effective
profile outside the three built-ins, Setta may display `Custom` as read-only
state, but it should not offer editing custom profile details in this feature.

Permission changes should be disabled while a run is active for the first
implementation. Changing permissions mid-run has ambiguous semantics and could
retroactively affect pending approval expectations. The disabled reason should
say the change applies after the current run.

## Architecture

### 1. Own a Setta Permission Preset Contract

Add a Go-owned chat contract for built-in permission presets, then regenerate
the TypeScript backend surface. Do not hardcode preset lists in the renderer.

Suggested backend types:

- `ChatPermissionPresetID`: `read-only`, `default`, `full-access`.
- `ChatPermissionPreset`: id, label, short description, approval policy,
  active permission profile id, and danger metadata.
- `ChatCodexPermissionSettings`: selected preset id plus the Codex values Setta
  must send (`approvalPolicy`, `permissions`).
- `ChatCodexEffectivePermissionSettings`: approval policy,
  active permission profile id/extends, display label, and whether the setting
  is one of Setta's built-in presets.

Keep the Codex built-in ids centralized in one integration-boundary file, for
example `internal/chat/codex_permission_presets.go`:

- `:read-only`
- `:workspace`
- `:danger-full-access`

The renderer should render generated preset data and selected effective state.
It should not duplicate the mapping between `Full Access`, `never`, and
`:danger-full-access`.

### 2. Extend Conversation Settings and Effective Settings

Extend `ChatCodexSettings` so an unlinked conversation can remember a selected
permission preset before the first Codex thread exists.

Extend `ChatCodexEffectiveSettings` so the composer can show the current
permission mode from backend state, alongside model/reasoning. The effective
settings should be updated from:

- `config/read` for conversations with no linked thread;
- `thread/start` / `thread/resume` responses for linked threads;
- `thread/settings/updated` notifications;
- explicit Setta permission-setting command results.

Do not infer a built-in preset from a raw sandbox JSON blob unless Codex did
not provide `activePermissionProfile`. Prefer Codex's profile identity whenever
available. If identity is unavailable or not built-in, show `Custom` as current
state.

### 3. Update the Codex Protocol Surface

Setta's generated protocol currently has permission fields on
`thread/settings/update`, but `thread/start` and `thread/resume` generated
types do not yet expose `permissions` or `activePermissionProfile`.

Add the relevant upstream experimental fields to
`internal/codexapp/protocolschema/supported_protocol.json`, refresh the copied
experimental schemas from the reference protocol snapshot, then regenerate:

- `thread/start.permissions`
- `thread/start.activePermissionProfile`
- `thread/resume.permissions`
- `thread/resume.activePermissionProfile`

For this built-in-only feature, `permissionProfile/list` is not required. Do
not expose custom profiles in the UI yet. A later custom-profile feature can
add `permissionProfile/list` and reuse the same preset/effective-settings
surface without replacing the composer control.

### 4. Add Backend Permission Commands

Use the existing chat command mutation pattern rather than local renderer
state. Permission changes are security-relevant and should be auditable in the
conversation transcript like model changes.

Add a permission command family:

- open picker: returns the built-in preset list, current effective preset, and
  disabled reasons if the harness/config rejects a preset;
- set preset: validates the requested preset id and applies its Codex values.

The set operation should behave like model/reasoning settings:

- If there is no linked Codex thread, persist the selected permission preset in
  `Conversation.CodexSettings`.
- When the first thread/turn starts, include both `approvalPolicy` and
  `permissions` so the thread is created with the selected permission posture
  before tools can run.
- If a linked Codex thread exists, call `thread/settings/update` with
  `approvalPolicy` and `permissions`.
- Persist the returned or derived effective settings to
  `Conversation.CodexEffectiveSettings`.
- Fail loudly if the current Codex app-server rejects `permissions`; do not
  silently fall back to legacy sandbox fields, aliases, or alternate request
  shapes.

For `Full Access`, require a confirmed request from the renderer before calling
the backend mutation. The backend should still enforce confirmation so the
dangerous mode cannot be selected by bypassing UI state.

### 5. Wire the Composer UI

Replace `PermissionModeUnavailableButton` with a real permission picker button:

- icon: existing settings/gear icon is acceptable;
- label: current effective mode (`Read Only`, `Ask for approval`,
  `Full Access`, or `Custom`);
- menu: built-in presets only;
- selection state: from `selectedConversation.codexEffectiveSettings`;
- disabled while no conversation is selected, while a run is active, or while a
  settings command is in flight.

Use a compact menu similar to the model picker, not a full settings page. The
full-access selection path should show a focused confirmation dialog explaining
that approvals and sandboxing will be disabled.

### 6. Keep Workflow/Automation Separate Initially

This feature targets the frontend chat composer. Workflow action side-effect
policy and workflow-owned Codex runs should not be changed in the first pass.
Once chat semantics are stable, evaluate whether workflow node settings should
offer the same built-in presets or continue using workflow-specific approval
policy controls.

## Implementation Phases

1. Protocol and contracts:
   - add generated protocol coverage for start/resume permission identity;
   - add Go-owned chat permission preset/value types;
   - regenerate backend TypeScript contracts.

2. Backend behavior:
   - extend conversation settings/effective settings;
   - parse permission fields from config/start/resume/settings notifications;
   - add open/set permission command endpoints;
   - apply unlinked settings on first thread/turn start.

3. Renderer behavior:
   - replace the disabled pill with a picker;
   - add full-access confirmation;
   - update store/preload/main IPC wiring;
   - keep the model picker unchanged.

4. Verification:
   - focused Go tests for preset mapping, command validation,
     linked-thread `thread/settings/update`, unlinked persistence, and
     full-access confirmation enforcement;
   - renderer/store tests for picker state and disabled states;
   - deterministic Electron workflow test that opens a workspace, creates a
     chat, selects each built-in mode, verifies persisted/reloaded composer
     state, starts a run after an unlinked selection, and asserts the fake
     Codex harness receives the expected `approvalPolicy` and `permissions`;
   - live Codex E2E only when local ChatGPT auth is available, with
     `OPENAI_API_KEY` unset.

## Open Decisions

- Resolved: the visible default label is `Ask for approval`, matching the Codex
  TUI. Upstream's stable preset id is `auto`, and its built-in metadata label is
  `Default`, but the effective profile maps to `:workspace`.
- Whether changing permission level should create a visible transcript command
  message every time. The recommended answer is yes for auditability.
- Whether to show `Custom` for unknown effective states or hide the control
  entirely. The recommended answer is to show `Custom` as current state and let
  the user select one of the built-ins to return to supported Setta behavior.
