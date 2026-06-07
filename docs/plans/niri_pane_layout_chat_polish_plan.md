# Niri Pane Layout And Chat Polish Plan

## Ground Rules

- Make frequent, descriptive git commits while iterating. Each commit should cover one coherent fix, for example pane gaps, chat width, drag feedback, pane chrome controls, or app drag regions.
- Do not run `./check_quality.sh --all` until explicitly asked. It slows iteration too much for this phase.
- Use focused checks and visual/browser verification while iterating.

## Current Findings

- Pane drag/reorder is custom pointer-event code in `desktop/src/renderer/src/niri-workspace/pane-drag-reorder.ts`, not `dnd-kit`.
- Current drag only marks a drop target during drag and commits reorder on pointer-up. Overview drag also commits only on pointer-up. That is why there is no live pane movement or reordering.
- `@dnd-kit` is not currently installed.
- The pane titlebar is translucent in `desktop/src/renderer/src/niri-pane-chrome.css`, so content like the chat goal can show through.
- Drag dots are prepended in DOM, but CSS sets `order: 2`, so they do not reliably stay on the left.
- Chat transcript is currently wider than the `new-layout-styles` branch. Current rows use `max-w-3xl`, while `new-layout-styles` used `max-w-2xl` with side padding and tighter user message widths.

## Phase 1: Restore Pane Gaps Without Breaking Resize Handles

- Reintroduce visual gaps between panes in normal mode.
- Keep resize handles centered in the space between panes instead of requiring panes to touch.
- Update layout geometry so gaps are part of pane placement, while resize handles use neighbor midpoint geometry.
- Verify stacked panes and side-by-side panes both retain visible separation.
- Commit: `Restore pane gaps around resize handles`.

## Phase 2: Match Chat Widths To `new-layout-styles`

- Restore transcript row width from `max-w-3xl` to `max-w-2xl`.
- Restore horizontal transcript padding behavior from `new-layout-styles`.
- Restore composer width to match transcript width, not the other way around.
- Keep newer chat functionality, but bring back the sizing contract:
  - transcript rows constrained to the same readable column as composer
  - user bubbles constrained inside that column
  - approvals, empty state, jump-to-latest, and search UI aligned to the same column
- Commit: `Restore new layout chat widths`.

## Phase 3: Make Pane Drag/Reorder Visible In Real Time

- Keep the current custom drag system unless a short spike proves `dnd-kit` is worth the dependency.
- Add live drag feedback:
  - source pane follows pointer or uses a drag overlay
  - target panes animate/reflow while dragging
  - reorder preview updates during drag, not only on pointer-up
  - overview mode supports the same live preview
- Compatibility note: Niri can support `dnd-kit` conceptually, but it is not drop-in. Pane hosts are managed by an imperative `PresentationEngine`, use transform-based positioning, and may contain native BrowserViews. A custom preview layer may fit better than moving all pane chrome into React just for `dnd-kit`.
- Commit: `Preview pane reorder while dragging`.

## Phase 4: Fix Pane Titlebar Chrome

- Make pane titlebars opaque.
- Move draggable dots to the left side and remove the CSS order that pushes them later.
- Ensure the title text remains readable and truncates cleanly.
- Keep chat goal below the titlebar and prevent it from visually sitting under translucent chrome.
- Commit: `Make pane titlebars opaque`.

## Phase 5: App Top Bar Drag Region

- Ensure the app top bar uses `app-drag` anywhere there are no buttons, inputs, or menus.
- Keep every actionable control marked `app-no-drag`.
- Verify macOS/window drag behavior does not interfere with toolbar buttons.
- Commit: `Expand app toolbar drag region`.

## Phase 6: Move Pane Controls To Focused Pane Chrome

- Show per-pane controls only on the focused pane:
  - split controls
  - add pane above
  - add pane below
  - close button at far right
- Keep global zoom in/out and new pane controls in the top toolbar.
- Add close handling through the existing layout store/engine path.
- Ensure controls are hidden or disabled in overview/maximized states where appropriate.
- Commit: `Move pane actions into focused pane chrome`.

## Verification During Iteration

- Use focused visual/browser checks after each phase.
- Add or update narrow tests for:
  - gap geometry plus resize handles
  - focused-only pane controls
  - close pane behavior
  - live drag preview state/reorder commit
  - chat width constraints
- Skip `./check_quality.sh --all` until requested.
