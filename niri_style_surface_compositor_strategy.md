# Niri-Style Pane Performance Strategy for an Electron App

## Core recommendation

Do **not** treat pane movement as a screenshot problem.

Treat the app as a small compositor:

> **Navigation should only move a camera over a logical workspace. It should not trigger screenshots, layout, rasterization, texture allocation, or texture uploads.**

The best model is:

```txt
Workspace
  camera position
  pane surfaces
  latest frame per pane
  input routing
  dirty-region updates
```

For a niri-style workflow, panels should behave like compositor surfaces, not like DOM elements that are repeatedly captured and rehydrated.

---

## Why navigation-time screenshots are the wrong primitive

Capturing a pane when it goes out of view creates work at exactly the worst time: during interaction.

Problems with navigation-time capture:

- It can force layout, paint, rasterization, or GPU upload.
- DOM screenshot tools are approximate and slow relative to moving an existing surface.
- Multiple panes moving on an ultrawide monitor can multiply this cost.
- Heavy panes such as terminals, node graphs, browser panes, and chat threads may all dirty at once.
- It introduces jank during the user’s most latency-sensitive action: navigation.

The correct approach is to **maintain a last-known-good visual frame continuously**, then use that frame only when a pane is not live or not hot.

---

## The surface model

Each pane should expose a surface-like interface.

```ts
interface PaneSurface {
  id: string
  rect: Rect // position in world coordinates

  // The latest renderable visual representation.
  currentTexture?: GPUTexture | WebGLTexture | ImageBitmap | HTMLCanvasElement

  // Static fallback for paused or offscreen panes.
  cachedFrame?: ImageBitmap

  // Called when content changes.
  onDirty?: (rect: Rect) => void

  // Route input into this pane.
  sendInput?: (event: InputEvent, localPoint: Point) => void

  // Adjust update/render priority.
  setPriority?: (priority: 'hot' | 'warm' | 'cold') => void
}
```

The compositor draws visible panes using their latest available frame. If a pane misses an update, the compositor should draw the previous frame rather than blocking.

---

## Camera-first navigation

Navigation should look like this:

```ts
function navigateTo(targetCamera: CameraPosition) {
  ensureHotSurfacesAround(targetCamera)
  camera.animateTo(targetCamera)
}
```

It should **not** look like this:

```ts
function navigateTo(targetCamera: CameraPosition) {
  for (const pane of panesLeavingView) {
    screenshot(pane)
    uploadTexture(pane)
    hideLiveDom(pane)
  }

  camera.animateTo(targetCamera)
}
```

The only thing changing during navigation should be the camera transform.

---

## One logical workspace, many textures

Avoid making one giant texture for the entire workspace.

Use:

```txt
one logical world coordinate space
many pane surfaces/textures
one final output/compositor surface
```

Avoid:

```txt
one giant rasterized workspace texture
```

A giant texture has several problems:

- It scales poorly with ultrawide and high-DPI displays.
- It makes invalidation expensive.
- One small terminal scroll can dirty part of a huge texture.
- It complicates hit testing and input routing.
- It makes browser panes and live interactivity harder.
- It increases GPU memory pressure.

For example, a `5120 × 1440` ultrawide viewport at `devicePixelRatio = 2` is roughly:

```txt
5120 * 1440 * 2 * 2 * 4 bytes ≈ 112.5 MB
```

That is one raw RGBA frame. Double buffering, triple buffering, overscan, and cached surfaces multiply the cost.

---

## Pane priority states

Use three states for panes.

### HOT

Visible or very close to visible.

Behavior:

- Fully live.
- Immediately interactive.
- Updated at full frame rate when dirty.
- Receives pointer, wheel, and keyboard input.

Examples:

- Panes currently visible on the ultrawide display.
- Panes one navigation step away.
- Focused or recently focused panes.

### WARM

Nearby but not currently central.

Behavior:

- Keeps state alive.
- Keeps a recent visual frame.
- May update at reduced frequency.
- Can become hot quickly.

Examples:

- Panes just outside the viewport.
- Panes likely to enter view during the next left/right/up/down navigation.

### COLD

Far from the active area.

Behavior:

- Renderer may be paused or unmounted.
- State is retained separately.
- Visual representation may be a cached frame or placeholder.
- Rehydration can happen before the pane becomes visible.

Examples:

- Far-away workspace regions.
- Old chat panes or inactive browser panes.
- Heavy node graphs not near the active viewport.

Recommended region model:

```txt
hotRect  = viewport expanded by 0.5–1.5 screens
warmRect = viewport expanded by 2–4 screens
cold     = everything else
```

---

## Recommended architecture

```txt
Electron app
  └─ main renderer
      ├─ WebGPU/Pixi compositor canvas
      ├─ camera transform
      ├─ pane registry
      ├─ hit testing
      ├─ input routing
      └─ frame scheduler

Pane producers
  ├─ DOM panels
  ├─ WebGPU/Pixi canvases
  ├─ xterm.js terminals
  ├─ libghostty terminals
  ├─ browser panes / webContents
  └─ heavy chat or node graph renderers
```

The compositor should own movement, ordering, clipping, scaling, and transitions.

Each pane producer should own rendering its own content into a surface or maintaining a live DOM/native view.

---

## DOM panes

For ordinary DOM panes, the first strategy should be compositor-friendly DOM movement:

```css
.workspace {
  transform: translate3d(calc(-1px * var(--camera-x)),
                         calc(-1px * var(--camera-y)),
                         0);
  will-change: transform;
}

.pane {
  contain: layout paint style;
}
```

Keep visible DOM panes live when immediate interactivity matters.

Use snapshots only for panes that are warm or cold, not for panes the user can currently interact with.

Good DOM strategies:

- Animate only `transform` and `opacity`.
- Use `contain` to isolate expensive layout and paint.
- Use virtualization for long lists, chat threads, and logs.
- Avoid forcing layout during navigation.
- Avoid reading layout values inside animation frames.
- Keep hot panes mounted.
- Pause or unmount cold panes.

---

## WebGPU, PixiJS, and node graph panes

These are good candidates for real surface composition.

Preferred model:

```txt
pane renderer
  → pane-owned texture/render target
  → compositor draws textured quad
```

For PixiJS:

- Use `RenderTexture` for pane outputs.
- Reuse render textures.
- Avoid creating and destroying textures during navigation.
- Avoid first-use allocation during interaction.

For WebGPU:

- Render heavy pane content into a `GPUTexture`.
- The compositor samples that texture.
- Keep texture dimensions stable when possible.
- Resize only when pane size or device pixel ratio changes.

For node graphs:

- Separate graph simulation/layout from visual composition.
- Render only dirty regions if feasible.
- Keep a last complete frame.
- Do not recompute graph layout during navigation.

---

## Terminals

Terminals are special because they often change frequently but predictably.

### xterm.js

Recommended approach:

- Keep visible xterm panes live.
- Use terminal render/dirty events to update cached frames.
- Avoid snapshotting the terminal at navigation time.
- Reduce update priority for warm terminals.
- Pause or throttle cold terminals if acceptable.

### libghostty

Prefer using libghostty as a native terminal surface producer where possible.

Good target model:

```txt
libghostty terminal renderer
  → GPU/native surface or texture
  → compositor draws pane quad
```

This is better than treating the terminal as arbitrary DOM that must be captured.

---

## Browser panes in Electron

Browser panes are the biggest architectural fork.

### Option A: `WebContentsView`

Use this when native browser behavior matters most.

Pros:

- Real browser interaction.
- Easier focus and text input.
- Native selection, context menus, accessibility, drag/drop, and IME behavior.
- Less manual input plumbing.

Cons:

- Harder to make browser panes feel like part of one GPU-composited world.
- Movement may require updating native view bounds.
- Many live browser views can become expensive.
- CSS transforms in your renderer do not naturally transform native views as if they were normal DOM children.

Best for:

- A smaller number of live browser panes.
- Browser panes that need native fidelity more than perfect compositor integration.

### Option B: offscreen `webContents` as textures

Use this when compositor control matters most.

Pros:

- Browser panes become texture producers.
- The compositor can move, clip, scale, fade, and animate them like other panes.
- Works better with a niri-like world model.
- Dirty frames can be consumed by your renderer.

Cons:

- You must route input manually.
- Focus, IME, accessibility, drag/drop, cursor state, and context menus require more work.
- Resource management is critical.
- Shared/offscreen texture lifetime must be managed carefully.

Best for:

- A true custom compositor.
- Smooth movement of many browser-like panes.
- Unified rendering with WebGPU/Pixi.

Recommended default:

```txt
Use WebContentsView when browser fidelity is more important.
Use offscreen webContents/shared textures when compositor fidelity is more important.
```

For a niri-style workflow with many moving panes, offscreen texture-based browser panes are more aligned with the architecture, but they are substantially more complex.

---

## Input routing

If panes are GPU-composited, the browser will not automatically perform DOM hit testing for them.

You need your own input router:

```ts
function handlePointer(event: PointerEvent) {
  const worldPoint = screenToWorld(event.clientX, event.clientY, camera)
  const pane = hitTestPane(worldPoint)

  if (!pane) return

  const localPoint = {
    x: worldPoint.x - pane.rect.x,
    y: worldPoint.y - pane.rect.y,
  }

  pane.surface.sendInput?.(event, localPoint)
}
```

You also need to handle:

- Pointer enter/leave.
- Pointer capture.
- Wheel routing.
- Keyboard focus.
- IME/text input.
- Cursor changes.
- Drag/drop.
- Context menus.
- Accessibility, if required.

For DOM-first panes, the browser can do much of this automatically.

For GPU-composited panes, this becomes part of your compositor.

---

## Frame scheduling

The compositor should run independently from pane renderers.

Important rule:

> **The compositor should never block waiting for a pane.**

Frame loop:

```ts
function frame(now: number) {
  updateCameraAnimation(now)

  for (const pane of visiblePanes(camera)) {
    const frame = pane.currentTexture ?? pane.cachedFrame ?? placeholderTexture
    drawPane(frame, pane.rect, camera)
  }

  present()
  requestAnimationFrame(frame)
}
```

Pane updates happen separately:

```ts
pane.onDirty = rect => {
  schedulePaneRender(pane, rect)
}
```

If a pane misses a frame, draw the old frame.

This is essential for perceived smoothness.

---

## Snapshot usage

Snapshots are still useful, but only as cached visual fallbacks.

Good uses:

- Warm/cold panes.
- Transition placeholders.
- Thumbnails/previews.
- Restoring visual continuity while a pane rehydrates.
- Covering a slow renderer for a few frames.

Bad uses:

- Capturing every pane during navigation.
- Capturing all visible panes on every move.
- Using screenshots as the main way to animate live interactive panes.
- Encoding to PNG/JPEG/WebP during interaction.

For internal canvas/WebGPU/Pixi surfaces, prefer keeping render targets or textures alive.

For DOM panes, use snapshots sparingly because arbitrary DOM-to-texture capture is expensive and imperfect.

---

## Memory budgeting

Raw RGBA memory:

```txt
width * height * devicePixelRatio^2 * 4 bytes
```

Examples:

```txt
1000 × 800 @ 2x ≈ 12.8 MB
1920 × 1080 @ 2x ≈ 31.6 MB
5120 × 1440 @ 2x ≈ 112.5 MB
```

That is before double buffering, mipmaps, overscan, browser backing stores, terminal buffers, and renderer-specific allocations.

Practical guidance:

- Cap cached texture count.
- Evict cold textures aggressively.
- Keep logical state separate from visual cache.
- Use lower-resolution snapshots for cold panes if acceptable.
- Prefer per-pane textures over giant workspace textures.
- Track GPU memory usage and texture dimensions.
- Avoid allocating textures during navigation.
- Preallocate or reuse textures when possible.

---

## Recommended strategy by pane type

| Pane type | Recommended strategy |
|---|---|
| DOM panels | Keep hot panes live as DOM. Use containment and virtualization. Snapshot only warm/cold panes. |
| Long chat threads | Virtualize messages. Keep hot thread live. Cache visual frame for warm/cold panes. |
| WebGPU panes | Render to pane-owned `GPUTexture`; compositor samples it. |
| PixiJS panes | Render to reusable `RenderTexture`; compositor draws it. |
| Node graphs | Render to texture; separate layout/simulation from movement. |
| xterm.js terminals | Keep hot terminals live. Cache from render/dirty events. Throttle warm/cold terminals. |
| libghostty terminals | Prefer native/GPU surface producer model. |
| Electron browser panes | Use `WebContentsView` for native fidelity or offscreen `webContents` textures for compositor fidelity. |

---

## Implementation checklist

### Navigation

- [ ] Navigation only updates camera position.
- [ ] No screenshotting during navigation.
- [ ] No texture allocation during navigation.
- [ ] No forced layout during navigation.
- [ ] No synchronous pane rendering during navigation.

### Pane lifecycle

- [ ] Every pane has HOT/WARM/COLD state.
- [ ] Hot panes are live and interactive.
- [ ] Warm panes keep recent visual frames.
- [ ] Cold panes retain state but may release textures/renderers.
- [ ] Pane state changes are scheduled before the user reaches the pane.

### Rendering

- [ ] Each heavy pane can expose a latest frame or texture.
- [ ] The compositor can draw stale frames without blocking.
- [ ] Textures are reused where possible.
- [ ] Dirty updates are tracked per pane.
- [ ] Device pixel ratio changes invalidate relevant textures.
- [ ] Resizes are not performed during camera movement.

### Input

- [ ] Pointer events are transformed from screen to world coordinates.
- [ ] World coordinates are hit-tested against panes.
- [ ] Events are transformed into pane-local coordinates.
- [ ] Keyboard focus is tracked separately from pointer hover.
- [ ] Browser-pane input routing is explicitly designed.
- [ ] IME, cursor, drag/drop, and context menu behavior are accounted for.

### Electron

- [ ] Decide between `WebContentsView` and offscreen `webContents` for browser panes.
- [ ] Avoid deprecated `BrowserView` for new work.
- [ ] Avoid `<webview>` unless there is a strong reason.
- [ ] If using offscreen browser panes, design texture lifetime and input routing early.

---

## Final design direction

For this app, the strongest architecture is:

```txt
live surfaces
+ dirty updates
+ cached last frames
+ camera-space composition
+ pane-level lifecycle management
```

Not:

```txt
DOM screenshots during movement
```

And not:

```txt
one giant workspace screenshot
```

The practical answer is:

> Build a compositor-style pane system with many live or cached pane surfaces, then make navigation a pure camera transform over those surfaces.

Visible panes should stay immediately interactive. Warm and cold panes can rely on cached frames. Heavy renderers should feed the compositor continuously or on dirty updates, not be captured reactively when the user moves.
