# UI Setting Reveal Coordinator Plan

## Problem
Reveal behavior is still brittle because routing, scope resolution, state mutation, and ACK validation are spread across tool logic, manager helpers, and websocket handling. This creates repeated regressions around affinity, share scope, rollback ownership, and timeout-class errors.

## Goals
- One authoritative backend reveal execution path.
- One canonical resolved context shape for reveal (`ide` vs `share`) used end-to-end.
- No backend project-state `activeIds` mutation for reveal execution.
- Strict reveal protocol matching (`requestId`, `projectConfigId`, `settingIds`, websocket origin).
- Keep affinity token server-issued and capability-based (no caller websocket ids).

## Non-goals
- Redesigning plugin reveal handler API.
- Changing user-visible reveal semantics beyond removing backend-side section focus mutation.
- Reworking websocket transport broadly outside reveal protocol boundaries.

## Architecture
### 1. Backend RevealCoordinator (single entry)
Create `backend/setta/ui_settings/reveal_coordinator.py` with a single orchestrator class that performs:
- runtime entry resolution + target construction,
- canonical context resolution,
- routing preflight and target websocket selection,
- reveal dispatch + waiter registration,
- strict ACK/result resolution and mapping to tool result statuses.

`reveal_ui_setting` and `set_ui_setting_value(..., revealAfterSet=True)` will call this coordinator only.

### 2. Canonical reveal context union
Add a coordinator-local resolved context model:
- `scope`: `"ide" | "share"`
- `projectConfigId`, `shareSessionId`, `chatId`
- `frontendWebsocketId` (resolved from affinity token if present)

This context is resolved once and reused; no additional reveal-time fallbacks.

### 3. Remove backend reveal mutation path
Drop reveal-time backend `activeIds` mutation/rollback orchestration from tool flow.
- Keep validation that a reveal request targets a valid section/tab combination.
- For right-pane reveal, send an optional `activeSectionId` in the reveal request payload.
- Frontend applies this selection as request-scoped local reveal mutation only.

### 4. Protocol hardening
Coordinator enforces and depends on strict hub contract matching:
- expected websocket id,
- expected project id,
- expected setting ids.

Envelope mismatches are protocol failures (fail-fast), not timeout-class failures.

### 5. Frontend request-scoped section activation
Extend `UISettingRevealContent` with optional `activeSectionId`.
- In `receiveUISettingReveal`, apply `activeSectionId` as local request mutation before tab/anchor reveal.
- Track ownership in existing reveal mutation lease logic.
- Rollback only if the lease still owns the mutated local fields.

## Implementation Steps
1. Add coordinator module and migrate reveal orchestration out of `mcp/tools/ui_settings.py`.
2. Update websocket reveal content schema (`activeSectionId`) in backend types.
3. Regenerate frontend generated types.
4. Update frontend reveal action to apply/rollback local active section activation under lease ownership.
5. Remove old backend reveal activation calls from tool path.
6. Update/add tests for:
   - coordinator routing + ambiguity behavior,
   - right-pane reveal with explicit section activation without backend state mutation,
   - ACK mismatch fail-fast behavior,
   - frontend local section activation rollback ownership.

## Acceptance Criteria
- `reveal_ui_setting` uses only `RevealCoordinator` for dispatch/wait/result mapping.
- No call path from UI setting reveal to manager `set_active_ids_for_ui_setting_reveal` / rollback APIs.
- Right-pane reveal still works with `sectionIdToActivate` through frontend-local activation.
- Reveal protocol mismatches fail immediately and deterministically.
- Targeted backend and frontend tests pass.
