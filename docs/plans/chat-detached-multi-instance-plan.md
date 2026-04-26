# Chat Detached Surface Plan (Primary Off-Pane)

## Goal
Move Project AI Chat out of the left pane as its primary surface and make it behave like a desktop/web chatbot window:
- default docked at bottom-left or bottom-right of the viewport,
- minimizable,
- undockable/movable/resizable/snappable/fullscreen,
- multi-instance,
- openable in a dedicated route/tab/window (`/:projectConfigName/chat`),
- optional fallback to sidebar pane (lowest priority).

## Requirements Mapping
1. Bottom-corner chatbot style with minimize:
- Covered by docked mode + launcher + minimized state.
2. Undock/move/resize/snap/fullscreen:
- Covered by floating window mode with snap presets and fullscreen toggle.
3. Multiple instances:
- Covered by per-instance window manager + per-instance chat view state.
4. Open independently in new tab/window at `localhost:port/projectconfig/chat`:
- Covered by new router path `/:projectConfigName/chat`, new-tab button, and direct-load support.
5. Optional return-to-sidebar pane:
- Covered as P4 (lowest-priority fallback mode).

## Current Constraints (Code Reality)
- Project chat is currently rendered only as an Overview pane tab:
  - `frontend/src/components/Panes/Overview/Overview.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- Pane fullscreen is controlled by `PaneContainer` and is not chat-specific:
  - `frontend/src/components/Utils/PaneContainer.tsx`
- Global project-chat view state is singleton (`activeChatId`, `viewThreads`, etc.), which blocks multi-instance:
  - `frontend/src/state/definitions.ts` (`useAIStore`)
- Router currently has `/:projectConfigName` and `/:projectConfigName/view/:viewModeName`, but no dedicated chat route:
  - `frontend/src/components/Pages/router.tsx`

## Architecture Direction

## 1) Split Chat Content from Host Chrome
Create a reusable chat content component that is host-agnostic:
- Keep existing message/composer logic from `ProjectChat` + `ProjectChatCore`.
- Extract into shared module (example):
  - `frontend/src/components/Chat/ProjectChatSurface/ProjectChatSurface.tsx`
- Hosts:
  - docked window host,
  - floating window host,
  - dedicated route host (`/:projectConfigName/chat`),
  - optional Overview pane host (fallback mode).

## 2) Add Chat Window Manager State (Per Instance)
Introduce per-instance state in `useAIStore` (or a dedicated chat-window store), replacing singleton view state for windowed chat.

Suggested model (exact names can vary):
- `projectChatInstancesByProjectConfigId: Record<string, Record<string, ProjectChatInstance>>`
- `projectChatWindowOrderByProjectConfigId: Record<string, string[]>`
- `projectChatPrimaryInstanceIdByProjectConfigId: Record<string, string | null>`

`ProjectChatInstance` fields:
- `instanceId`
- `chatId: string | null | undefined`
- `mode: "docked" | "floating" | "fullscreen" | "pane" | "external"`
- `anchor: "bottom-left" | "bottom-right"` (for docked)
- `minimized: boolean`
- `bounds: { x: number; y: number; width: number; height: number }`
- `snap: "none" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right"`
- `zIndex`
- `viewState` (per-instance replacement for current global view toggles such as threads panel)

Important transition note:
- Keep `activeChatId` reads limited to the transition window.
- New work should read/write per-instance state.

## 3) New Global Chat Overlay Host
Mount a top-level chat window layer in `MainContainerCore` so chat can render independently from pane tab content.
- File: `frontend/src/components/Pages/MainContainerCore.tsx`
- New component example: `ProjectChatWindowLayer`
- Render above canvas/panes with deterministic z-index.

Default behavior:
- If no instances exist for project, create one docked instance at bottom-right.
- If minimized, show compact launcher pill/button.

## 4) Floating Behaviors
Implement window interactions using existing primitives (`re-resizable` + pointer drag logic), avoiding new dependency unless proven necessary.
- Resize: `re-resizable` (already used in repo).
- Drag: pointer-driven transform/bounds clamp (similar patterns already in `FloatingBox`).
- Snap:
  - drag-to-edge snap zones,
  - keyboard/menu snap actions (left/right/quadrants),
  - maintain snapped bounds on viewport resize.
- Fullscreen:
  - window fills viewport content area (excluding title/header bars as needed),
  - preserve previous bounds for restore.

## 5) Multi-Instance UX
Each chat window supports:
- New instance action (`+` or duplicate icon in window chrome).
- Independent `chatId` binding and thread selection.
- Independent window state (position, size, minimized/fullscreen/snap).
- Bring-to-front on focus.

Behavior decisions to lock in implementation:
- Unlimited instances or capped (recommend soft cap with warning, e.g. 6).
- Instance close behavior (close window only; preserve chat thread data).

## 6) New Dedicated Chat Route + New-Tab Button
Add dedicated route:
- `/:projectConfigName/chat`
- Optional query params:
  - `chatId=<id>`
  - `instanceId=<id>`
  - `mode=docked|floating|fullscreen` (optional)

Router updates:
- File: `frontend/src/components/Pages/router.tsx`
- Route order must place `/:projectConfigName/chat` before `/:projectConfigName` to avoid accidental catch by the generic project route.

Window action:
- Add button next to fullscreen control in chat window chrome:
  - `Open in new tab/window`
  - `window.open(url, "_blank", "noopener,noreferrer")`
- URL should resolve to `/${encodeURIComponent(projectConfigName)}/chat` with optional params.

Installability:
- Existing `site.webmanifest` has `scope: "/"` and `display: "standalone"`, so this route should already be installable if it loads the same app shell.
- Verify install flow from the new chat route and confirm launch lands on chat route when opened from that context.

## 7) Optional Sidebar Pane Fallback (Lowest Priority)
Keep/restore ability to show chat in Overview pane:
- Add mode switch:
  - `Chat Surface: Floating (default) | Sidebar Pane`
- In sidebar mode:
  - existing `OverviewTabNameEnum.ProjectAIChat` remains usable.
- In floating-primary mode:
  - chat icon can open/focus floating chat instead of being the primary content surface.

## Delivery Phases

## Phase 0: Foundations and Extraction
- Extract shared project chat content from pane-specific wrapper.
- Introduce per-instance state model and migration layer from singleton fields.
- Add window layer host in `MainContainerCore`.

## Phase 1: Docked Primary Chat
- Implement default docked bottom-corner chat.
- Implement minimize/restore and anchor side switch (left/right).
- Switch Overview chat tab action to focus/open chat window (not primary render).

## Phase 2: Floating Window Controls
- Undock toggle.
- Drag/resize.
- Snap to sides + quadrants.
- Fullscreen/restore.
- Z-order bring-to-front.

## Phase 3: Multi-Instance
- Add create/duplicate instance actions.
- Per-instance chat/thread state.
- Instance close semantics and persistence.

## Phase 4: Dedicated Route + New Tab/Window
- Add `/:projectConfigName/chat` route + host.
- Add open-in-tab/window button near fullscreen.
- Support route direct-load hydration and optional `chatId` query param.

## Phase 5: Optional Sidebar Return (Cherry on Top)
- Add explicit toggle to render chat in Overview pane.
- Ensure mode switch is reversible without data loss.

## Testing Plan

## Vitest
- New reducers/state tests for:
  - instance create/focus/close,
  - dock/undock/minimize/fullscreen transitions,
  - snap behavior mapping,
  - migration from singleton chat state.
- Component tests:
  - docked launcher and window chrome,
  - new-tab button URL generation,
  - route host rendering for `/:projectConfigName/chat`.

## Playwright E2E
- `chat-floating-primary.spec.ts`:
  - default docked open, minimize/restore.
- `chat-window-controls.spec.ts`:
  - undock, drag, resize, snap left/right/quadrants, fullscreen restore.
- `chat-multi-instance.spec.ts`:
  - create two instances, independent thread selection.
- `chat-route.spec.ts`:
  - open new tab from button,
  - verify URL `/:projectConfigName/chat`,
  - direct navigation restores expected chat context.
- `chat-pane-fallback.spec.ts` (if Phase 5 implemented):
  - switch to pane mode and back.

## CDP / Perf Verification
- Profile before/after on large message histories with one and multiple windows:
  - ensure no uncontrolled re-renders when moving/resizing windows,
  - ensure minimized/hidden windows do not render heavy message lists unnecessarily.
- Record profiling notes under `perf/` (append-only).

## Risks and Mitigations
- Risk: singleton chat state causes cross-instance interference.
  - Mitigation: move to explicit per-instance state early (Phase 0).
- Risk: route conflicts with `/:projectConfigName`.
  - Mitigation: add specific chat route before generic project route.
- Risk: performance regressions with multiple mounted chat lists.
  - Mitigation: render-throttle inactive windows, avoid unnecessary subscriptions, profile with CDP.
- Risk: UX confusion between pane and floating modes.
  - Mitigation: one explicit “surface mode” setting with clear labels.

## Open Decisions To Confirm Before Implementation
1. Should there be a hard cap for open chat instances?
2. Should new instances default to:
   - current active chat thread, or
   - blank/new thread?
3. Should `/:projectConfigName/chat` open:
   - a dedicated single-instance chat shell, or
   - the full multi-window manager surface?
4. In pane fallback mode, should floating windows auto-close or stay available in parallel?

## Acceptance Criteria
- Project chat has first-class surfaces outside the Overview pane.
- A docked bottom-corner chat exists with minimize support.
- Users can undock, drag, resize, snap, and fullscreen chat windows.
- Multiple chat windows can be opened and used independently.
- A button near fullscreen opens chat on `/:projectConfigName/chat` in new tab/window.
- Optional pane fallback exists (if Phase 5 delivered) without losing chat state.
