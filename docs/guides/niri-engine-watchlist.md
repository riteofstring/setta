# Niri Engine Watchlist

Use this when changing the Niri workspace engine, presentation layer, or pane
surface adapters. The detailed architecture lives in
`docs/plans/niri_style_electron_plan_dom_preserved.md`; this guide is the short
operational checklist.

## Core Rule

Niri is a pane manager and presentation engine, not a custom DOM renderer and
not a whole-workspace GPU compositor.

The intended frame path is:

```txt
input
-> layout store / layout engine
-> render items
-> runtime policy
-> DOM transform and size writes
-> batched native browser view bounds
```

React, Pixi, xterm, browser views, workers, and canvas renderers are pane
contents or isolated surface implementations. They must not leak into the core
layout engine.

## Things To Watch

### React in the hot path

Pane movement, overview animation, focus navigation, and resize should not
trigger per-pane React renders. React mounts the shell and React-backed surface
islands; the frame loop should write host transforms and dimensions
imperatively through the presentation engine.

Watch for:

- `setState` or store notification calls inside animation-frame movement paths.
- Rendering pane hosts from changing React arrays during normal movement.
- Surface adapters that rerender full React trees for viewport-only changes.

Prefer measuring `reactCommitsDuringMovement` and
`reactCommitsDuringResize` before calling a Niri performance change done.

### Surface adapter lifecycle

Every surface adapter must handle the full lifecycle explicitly:

```txt
mount -> setViewport -> setVisible/setFocused -> freeze/resume -> unmount -> destroy
```

Hidden, snapshotted, throttled, and destroyed panes need deterministic cleanup.
Do not leave RAF loops, workers, observers, terminal listeners, native views, or
canvas renderers running after freeze, unmount, or teardown.

Watch for:

- Adapters that treat `hidden`, `snapshot`, and `destroyed` as equivalent.
- Cleanup hidden in broad catch blocks or silent fallbacks.
- Pane state that persists in DOM attributes after a host is reused for another
  pane.

### Browser native views

Browser panes are Electron `WebContentsView`s, not renderer DOM nodes. The
renderer owns the proxy host and sends batched bounds/focus/runtime updates; the
main process owns native view creation, bounds, visibility, focus, and teardown.

Watch for:

- Treating browser panes like iframes or ordinary divs.
- Sending one native bounds IPC per pane when a single batch is possible.
- Letting native views remain visible while active resize makes their bounds
  visibly lag the DOM proxy.
- Focus routing that traps arrow-key navigation inside the native view.

### Snapshots and overview

Snapshots are a performance tool, but capturing or swapping snapshots at the
wrong time can create worse hitches than keeping panes live.

Watch for:

- Snapshot capture on transition start causing a long frame.
- Stale or empty snapshot textures in overview.
- A snapshot policy that hides useful focused content.
- Snapshot placeholders becoming a substitute for fixing lifecycle leaks.

### Canvas and GPU boundaries

Canvas, Pixi, WebGL, or WebGPU belong inside heavy visual panes such as the
workflow graph. They are not the workspace compositor.

Watch for:

- Importing Pixi/WebGPU/terminal/browser modules into the layout engine.
- Promoting a pane-specific renderer into shared workspace infrastructure.
- Keeping hidden canvas panes rendering.
- Assuming GPU acceleration removes DOM, accessibility, focus, or input costs.

### Verification scope

For narrow layout math changes, focused unit tests are usually enough. For
changes that affect the frame loop, runtime policy, surface lifecycle, native
browser views, terminal panes, or pane interaction flows, use the relevant
Electron workflow or visual/performance checks so production main, preload,
renderer, IPC, and store paths are exercised.

Record performance-relevant before/after results under
`docs/reports/performance/` when the change is intended to improve Niri
performance.
