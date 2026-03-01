# Chat Windowing v1 Plan

## Context
This plan defines a new chat windowing model for Setta, implemented in a new worktree/branch named `chat-windowing` from `main`.

Primary user outcomes:
- Project AI chat is no longer tied to left panes.
- Chat is always available from the bottom and can be floated/maximized.
- Chat can become a canvas section and use the same core chat component.
- Architecture is reusable so non-chat sections can adopt the same window controls later.

## Locked Decisions
- V1 excludes left-pane chat docking and left-pane chat icon UX.
- V1 chat placements are `bottom-docked`, `floating`, `maximized`, and `canvas-section`.
- One chat instance renders in one placement at a time.
- Bottom bar uses X-style chat pills with no heavy tray background.
- `+` creates a new chat instance that is immediately open and docked.
- Multiple docked chats can be visible simultaneously.
- Docked chats support equal-width layout with manual resize handles.
- Overflow behavior is compression (`title -> icon`) plus left/right cycle controls.
- Layout behavior is overlay (chat overlays canvas region), not canvas reflow.
- Floating windows use z-order and bring-to-front on focus.
- Floating windows allow partial off-screen placement, but at least title bar and `120px` remain visible.
- Viewport resize auto-corrects windows to preserve minimum grabbable visibility.
- Snap includes drag ghost zones plus keyboard snapping.
- V1 snap presets are halves and quarters; custom grids are later.
- Maximize restores to immediate prior state and prior geometry.
- Close action hides chat instance (does not delete threads/state).
- When last chat is closed, zero visible chats is allowed; bottom `+` remains available.
- Default startup behavior auto-creates one docked chat unless disabled via File Menu settings JSON.
- Runtime chat/window state persists per project in DB-backed project state, not settings JSON.
- `project-ai mode` uses shared project-level threads.
- Project-ai agent behavior remains thread-driven in v1 (no new per-window agent pinning).
- `section mode` uses section-local threads keyed by section id.
- Section mode context access is direct outgoing connected nodes only (direction-aware).
- Incoming edges alone do not grant section-mode access.
- Section mode with zero eligible nodes still allows chat send, but no Setta node/tool access.
- Zero-scope warning appears as a header icon plus dismissible inline banner (dismissed per session).
- Canvas section chats can switch modes (`section mode` <-> `project-ai mode`).
- Switching back to section mode reapplies previous edge-based scope.
- Chat-to-chat edge behavior is tool-call style invocation, not recursive direct chat.
- Tool-call recursion guard is enforced with cycle detection and depth cap `1`.
- Undocking a canvas chat shows a translucent Setta-colored placeholder on canvas.
- Placeholder is visual-only in v1 (non-interactive).
- Boot-to-canvas uses cursor position when available, else canvas center.
- Old section-chat compatibility/migration is intentionally out of scope.

## Goals (v1)
- Deliver robust multi-instance chat windowing for project chat.
- Unify project chat and section chat into one component with mode-aware behavior.
- Preserve thread continuity and instance state across reloads via per-project persistence.
- Provide predictable keyboard/mouse controls for move, snap, maximize, minimize, and canvas visibility.
- Build window manager primitives so non-chat sections can adopt the same controls in future phases.

## Non-Goals (v1)
- Left-pane chat reintroduction.
- Full generic section windowing UI rollout (non-chat sections stay on existing UX).
- Custom snap grid editor.
- New intermediate access mode ("all nodes but not full Setta app") is deferred.
- Section thread group deletion/management UX beyond existing per-thread capabilities.
- Legacy section-chat migration shims.

## UX and Interaction Model

## Bottom Dock
- Bottom strip hosts chat pills and a persistent `+`.
- Each pill can represent minimized or open-docked state.
- Multiple open docked chats are shown side-by-side.
- Docked windows overlay the canvas area and can coexist with view-mode tabs.
- Width-constrained behavior compresses titles first, then icon-only pills, then shows left/right cycle controls for additional instances.

## Floating and Maximize
- Any docked chat can undock to floating.
- Floating windows support drag, resize, z-order focus, and snap.
- Maximize is a window state over the current instance.
- Unmaximize returns to exact prior placement and geometry.
- Global canvas visibility toggle is available when overlays/maximized state obscure canvas.

## Canvas Section Mode
- A chat can be moved to canvas as a section representation.
- The same unified chat component powers both project and section representation.
- When moved from canvas-section to floating, canvas keeps a non-interactive translucent placeholder.
- Placeholder includes clear visual identity (Setta tint + centered icon/title treatment) so users know a section is currently externalized.

## Keyboard Defaults (Configurable)
- Canvas visibility toggle: `Shift+Esc`
- Maximize focused chat/window: `Mod+Shift+Enter`
- Minimize focused chat/window: `Mod+Shift+M`
- Snap focused floating chat: `Mod+Alt+Arrow`

All shortcut defaults are configurable in File Menu settings JSON. Runtime state remains DB-backed project state.

## Mode and Scope Model

## Modes
- `project-ai mode`: scope is full project + Setta app-level capabilities; threads use shared project-level namespace; agent selection stays aligned with existing thread-level behavior.
- `section mode`: scope is direct outgoing connected nodes only; threads use section-local namespace keyed by section id.

## Scope Evaluation Rules (section mode)
- Evaluate graph connections from chat section by outgoing edges only.
- Include directly connected target nodes only (no traversal beyond 1 hop).
- Ignore incoming-only connections for access.
- Allow send even when zero targets; mark limited access state with warning UI.
- Recompute eligible scope live when edges are edited.

## Chat-to-Chat Tool Invocation
- If a chat section targets another chat section via outgoing edge, treat the target as a tool endpoint call.
- Return a bounded tool result payload to caller chat.
- Enforce recursion safety with cycle detection and max tool-call depth of 1.

## Settings Visibility
- In section rendering, settings are exposed via right pane only.
- Thread list remains visible inside chat UI.
- Section header/right-pane mode controls can switch between `section mode` and `project-ai mode`.

## State and Persistence Design

## Persistence Boundaries
- Persist per project in existing DB-backed project state system.
- Do not store runtime window/session state in settings JSON.
- Settings JSON only stores defaults/preferences (for example, auto-create behavior and shortcut mappings).

## Suggested Entity Shapes
- `chatInstancesByProjectId`
- Fields include `instanceId`, `placement`, `isMinimized`, `isClosed`, `isMaximized`, `bounds`, `dockMetrics`, `zIndex`, `lastPlacementBeforeMaximize`, `mode`, `sectionIdOrNull`, and `lastFocusedAt`.
- `chatInstanceOrderByProjectId`
- Holds focus/z-order and dock ordering.
- `projectChatThreadNamespace`
- Holds shared namespace metadata for project-ai mode.
- `sectionChatThreadNamespaceBySectionId`
- Holds section-local namespace pointers and metadata.
- `uiSessionFlags`
- Holds per-session dismissals (for example zero-scope warning dismissed).

## Close/Hide Behavior
- `close` hides instance from current surface but keeps instance/thread state for reopen and undo semantics.
- Reopen is managed from right-pane Chat Manager in v1.
- Reopen restores previous placement and geometry.

## Settings JSON Additions (Defaults/Preferences Only)
- `chatWindowing.autoCreateInitialChat` (default `true`)
- `chatWindowing.shortcuts.canvasToggle`
- `chatWindowing.shortcuts.maximizeFocused`
- `chatWindowing.shortcuts.minimizeFocused`
- `chatWindowing.shortcuts.snapLeft`
- `chatWindowing.shortcuts.snapRight`
- `chatWindowing.shortcuts.snapTop`
- `chatWindowing.shortcuts.snapBottom`
- `chatWindowing.restorePriorStateOnUnmaximize` (default `true`)

## Architecture and Implementation Plan

## 1) Unify Chat Surface
- Extract a host-agnostic chat core component used by bottom-docked, floating/maximized, and canvas section hosts.
- Remove current separate section chat implementation and replace with unified component modes.

## 2) Introduce Chat Window Manager (Chat-First, Generic-Friendly)
- Add window manager state/actions with chat-specific adapters.
- Keep abstractions generic so non-chat sections can adopt later.
- Implement placement transitions for `bottom-docked <-> floating`, `bottom-docked <-> maximized`, `canvas-section <-> floating`, and `canvas-section <-> maximized`.

## 3) Bottom Strip Host
- Add global bottom chat strip renderer with pills, `+`, and overflow cycling controls.
- Implement multi-docked layout and resize handles.
- Ensure rendering is lightweight when many instances exist.

## 4) Floating Window System
- Drag/resize logic with viewport guardrails.
- Snap ghost zones (halves/quarters).
- Keyboard snapping.
- Focus/z-order handling.

## 5) Canvas Section Integration
- Add boot-to-canvas action and cursor/center placement logic.
- Add undock-to-floating action with placeholder rendering on canvas.
- Keep placeholder visual-only in v1.

## 6) Mode/Scope Integration
- Implement mode toggle control and right-pane settings behavior.
- Implement section-mode outgoing-edge scope filter.
- Implement zero-scope warning UI and per-session dismissal.
- Preserve previous section scope behavior when switching back from project-ai mode.

## 7) Right-Pane Chat Manager (v1 Reopen + Basic Management)
- List chat instances and their current placement/state.
- Reopen hidden chats to previous placement.
- Provide a path for group-level management follow-up (future thread/group delete UX).

## 8) Tool-Call Safety for Chat-to-Chat Edges
- Implement chat-target tool invocation bridge.
- Enforce cycle detection and max depth `1`.
- Return bounded payload artifacts/messages to caller.

## Delivery Phases

## Phase 0: Foundation
- Build unified chat surface API.
- Create window manager state model and persistence wiring.
- Add settings JSON defaults plumbing for shortcuts and auto-create.

## Phase 1: Bottom Dock + Multi-Instance
- Ship bottom strip, pills, `+`, multi-open docked windows, resize handles, overflow behavior.
- Ship close-as-hide and right-pane reopen flow.
- Ship startup auto-create rule with settings override.

## Phase 2: Floating + Maximize + Canvas Toggle
- Ship floating drag/resize/z-order.
- Ship maximize/unmaximize and restore-prior-state behavior.
- Ship global canvas toggle button and shortcut.
- Ship viewport visibility guardrails.

## Phase 3: Snap System
- Ship ghost zone drag snapping (halves/quarters).
- Ship keyboard snapping.

## Phase 4: Canvas Section Unification
- Replace section chat with unified component in section host.
- Ship boot-to-canvas placement and undock placeholder behavior.
- Ship mode switching and right-pane-only settings in section rendering.

## Phase 5: Scope + Chat-to-Chat Tool Guard
- Ship outgoing-edge-only section scope logic.
- Ship zero-scope warning UX.
- Ship chat-to-chat tool-call bridge with recursion guard.

## Testing and Verification

## Vitest
- Window manager reducer/action tests for placement transitions, maximize/restore geometry, close-as-hide with reopen restore, and persistence hydration/dehydration.
- Scope/mode tests for outgoing-edge filtering, incoming-edge exclusion, mode-switch namespace swap, and zero-scope warning state.
- Recursion guard tests for depth cap and cycle detection.

## Playwright
- Bottom dock behavior: auto-create, `+` creation, multi-open layout, overflow compression/cycling, and resize handles.
- Floating behavior: undock, drag, resize, z-order, and viewport correction.
- Maximize/canvas toggle behavior: keyboard shortcuts and button behavior.
- Snap behavior: ghost zones and keyboard snap commands.
- Canvas section behavior: boot-to-canvas placement, undock placeholder, mode switch, and outgoing-edge scope.
- Chat-to-chat edge behavior: tool invocation result and recursion guard.

## CDP and Performance
- Capture baseline before implementation for large chat history rendering, multiple open docked/floating chats, and mode switching with section graph updates.
- Capture post-change measurements for identical scenarios.
- Record append-only reports under `perf/` with run metadata and observations.

## Risks and Mitigations
- Risk: cross-instance state leakage.
- Mitigation: strict per-instance state boundaries + targeted reducer tests.
- Risk: rendering regressions with many open windows.
- Mitigation: memoized window shells, minimized hidden content, profiling gates.
- Risk: keyboard shortcut conflicts on different OSes.
- Mitigation: configurable mappings in settings JSON + documented defaults.
- Risk: chat-to-chat recursion or accidental cycles.
- Mitigation: explicit depth cap `1` + cycle detection + bounded payload contract.
- Risk: user confusion around hidden vs deleted chats.
- Mitigation: right-pane Chat Manager labels hidden state and restore target.

## V1 Acceptance Criteria
- Project chat is no longer pane-dependent.
- Users can operate multi-instance chats via bottom dock, floating, and maximize states.
- Section chat and project chat use one unified component with mode switching.
- Section mode access is direct outgoing-edge-only and direction-aware.
- Zero-scope section mode allows send with clear warning signals.
- Chat-to-chat section edges execute as bounded tool calls with recursion safety.
- State persists per project and restores instance placement/geometry/mode.
- Old section-chat compatibility is intentionally not preserved.
- Automated tests (Vitest + Playwright) cover core workflows.
- CDP visual/perf verification is completed and recorded in `perf/`.

## Deferred Follow-Ups (Post-v1)
- Reintroduce optional left-pane docking if desired.
- Expand window controls to all section types with shared primitives already in place.
- Add advanced chat history management by instance/group in right-pane manager.
- Add custom snap grid templates.
