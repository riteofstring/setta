# Agent Chat SDK + Modular UX Roadmap

## Goal
Deliver a best-in-class agentic chat UI in Setta that is SDK-first across providers, explicit about real settings vs prompt guidance, and materially better than raw CLI flows for daily work.

## Scope
- In scope: remove misleading non-enforceable chat controls, introduce modular optional adapter architecture for provider SDK integrations, redesign slash command plumbing/capabilities, improve reliability diagnostics, and ship the multi-thread chat UX features discussed (history column, thinking states, fork/split flows, section parity).
- Out of scope: full backward compatibility with old chat settings payloads, full voice conversation mode, and provider-specific feature parity on day one.

## Product Principles
1. Real settings must map to enforceable runtime behavior; soft prompt hints cannot be presented as hard toggles.
2. SDK/provider-native integrations are preferred over OS/browser shims when they provide better reliability and capability.
3. Adapter integrations must be replaceable and optional; missing/broken adapters must degrade to sane defaults.
4. Slash command interactions should be low-friction, discoverable, and not pollute chat history by default.
5. Every new chat surface must support model/thinking control and be controllable programmatically.

## Workstreams

## 1) Remove Non-Enforceable Controls as "Hard Settings"
### Objective
Remove current UI and slash affordances that imply advisory behavior is an enforceable runtime switch.

### Plan
1. Remove non-enforceable execution controls from chat composers.
2. Remove slash commands that only toggle advisory behavior.
3. Keep advisory behavior in prompt/profile-level policy only (explicit language in system prompt templates and profile docs).
4. Remove or de-emphasize persisted advisory-only setting surface area from chat settings views so existing state does not imply hard enforcement.
5. Add migration logic for existing project/chat state entries that include deprecated advisory-only flags.

### Acceptance Criteria
- No visible non-enforceable execution toggles in project chat or section chat.
- No slash command suggestions or command handling for advisory-only toggles.
- Documentation and UI copy make it clear advisory behavior is prompt/profile policy unless a provider exposes a hard enforcement API.

### Verification
- Update Vitest coverage for chat composer controls and slash command definitions.
- Update Playwright chat composer coverage.

## 2) SDK-First Modular Adapter Layer
### Objective
Use provider SDKs/protocols as the first-class runtime path, with optional adapters and graceful fallback.

### Plan
1. Define `AgentProviderAdapter` contract:
   - run/session lifecycle
   - message send/stream
   - approval interactions
   - command capability discovery
   - model capability discovery
   - permission/search capability reporting
2. Introduce adapter registry + health checks:
   - load built-in adapters
   - optionally load external adapters
   - expose adapter availability/capabilities to frontend
3. Add fallback policy:
   - if adapter missing/unhealthy, fallback to current default execution path
   - emit explicit diagnostics and non-blocking warnings
4. Provider mapping:
   - Claude: SDK path
   - Codex: app-server and/or SDK path when available
   - OpenCode: verify ACP support path and formalize adapter accordingly
5. Add contract tests per adapter and parity tests for shared behavior.

### Acceptance Criteria
- Adapter availability/capabilities are queryable and used by chat runtime.
- Swapping or disabling an adapter does not break chat; runtime falls back cleanly.
- Provider integrations are isolated behind stable interfaces.

### Verification
- Backend tests for registry lookup, fallback behavior, and capability reporting.
- End-to-end smoke tests per enabled adapter in disposable test workspaces.

## 3) Slash Command Capability System
### Objective
Generate slash command UX from capability metadata (global + provider-specific), not from a static hardcoded list.

### Plan
1. Split commands into:
   - core Setta commands (`/new`, `/resume`, `/fork`, `/model`, etc.)
   - adapter-provided commands and arguments
2. Add command metadata endpoint and cache:
   - command id
   - label/help
   - argument schema
   - visibility rules by chat context/provider
3. Keep command execution out of chat history by default:
   - action-only commands should execute silently with compact status feedback
   - optional setting to emit command transcript for audit/debug
4. Improve selection flow:
   - pressing Enter on a command token accepts/runs the selected suggestion
   - no user-message echo unless explicitly requested
5. Add structured command errors with fix suggestions.

### Acceptance Criteria
- Slash list is dynamic and context/provider-aware.
- Command execution does not create noisy chat messages by default.
- `/model` and `/resume` flows support quick selection from suggestions.

### Verification
- Vitest for parsing/suggestion ranking/execution behavior.
- Playwright for keyboard-only and mouse selection flows.

## 4) Hard Runtime Enforcement Priority
### Objective
Prioritize enforceable runtime controls (permissions/search/tooling) over prompt-only flags.

### Plan
1. Build capability matrix per provider:
   - what can be enforced
   - what is advisory-only
2. UI renders controls only when enforceable for current provider/context.
3. If advisory-only, present as profile/prompt hint controls with explicit labeling.
4. Add backend validation to reject unsupported "hard setting" combinations.

### Acceptance Criteria
- UI never implies hard enforcement where none exists.
- Runtime payloads align with provider capabilities.

### Verification
- Backend unit tests for capability validation.
- Frontend tests for conditional control rendering.

## 5) Reliability + Diagnostics for "AI Request Failed"
### Objective
Make failures actionable from UI and logs without digging through sparse backend output.

### Plan
1. Standardize error envelope:
   - user-safe summary
   - provider code/detail
   - run id/request id
2. Surface request/run ids in frontend notifications and chat status row.
3. Add structured logging around adapter startup, command dispatch, streaming lifecycle, and failure points.
4. Add a "copy diagnostics" action in chat error UI.

### Acceptance Criteria
- Generic failure toasts are replaced by structured, actionable diagnostics.
- Engineers can correlate frontend error with backend logs via shared ids.

### Verification
- Backend tests for error envelope shape.
- Playwright tests for error display and diagnostic copy action.

## 6) Multi-Thread Chat UX Roadmap
### Objective
Ship the conversation management UX needed to outcompete CLI flows.

### Plan
1. Responsive two-column project chat:
   - conversation list column appears when width threshold is met
   - list shows active thinking/running states
2. Split and fork actions:
   - split current conversation into a section
   - fork from any historical message into a new branch/chat instance
3. Section chat parity:
   - optional left-side conversation/history list in sections
   - auto-hide to compact view below width threshold
4. Controls parity:
   - thinking toggle and model selector on all chat surfaces
   - keyboard/slash/programmatic control paths for both
5. Branch model alignment:
   - unify project chat and section chat branch semantics where feasible.

### Acceptance Criteria
- Users can see and manage concurrent conversations with active-state visibility.
- Fork/split actions are one-click and preserve context deterministically.
- Project and section chat controls are consistent and scriptable.

### Verification
- Playwright scenarios: fork from history, split to section, responsive column behavior, active-state indicators.
- Vitest coverage for branch state transitions and selection logic.

## 7) Delivery Sequence
1. Remove non-enforceable execution toggles and related slash commands.
2. Add adapter capability contracts and runtime capability endpoint.
3. Move slash commands to dynamic capability-driven list.
4. Add enforceability-aware control rendering.
5. Ship diagnostics improvements.
6. Deliver UX wave: two-column list, fork/split, section parity.

## Risks
- Provider APIs/SDKs drift; adapter contracts must be versioned and tested.
- Capability mismatches can create confusing UI unless enforceability labels are strict.
- Fork/split can regress branch consistency if chat id lineage is not normalized.

## Open Questions
1. OpenCode ACP: confirm exact protocol/runtime path we should standardize on for production.
2. Codex runtime: choose long-term default between app-server and SDK once SDK capabilities are fully validated.
3. Command transcript policy: default silent commands vs explicit command audit mode.

## Definition of Done
- Non-enforceable execution toggles removed from user-facing chat controls.
- Provider SDK/adapters are modular, optional, and capability-driven.
- Slash command system is dynamic and non-noisy by default.
- Error diagnostics are actionable.
- Conversation management UX (list + active states + fork/split + section parity) is implemented with automated coverage.
