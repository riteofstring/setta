# Workspace floating windows and Window Spaces

Status: implemented

## Outcome

Add the floating-window system from the frozen `main` UX to `@setta/workspace` as a reusable,
controlled package feature. Hosts will be able to render arbitrary registered content in movable,
resizable windows; use the same eight edge and corner snap layouts; save and manage reusable
Window Spaces; and render a saved space in the same deliberately limited dedicated presentation.

This is a new package API. No compatibility layer or migration is required.

## Reference authority

UX and behavior are fixed by local branch `main` at commit
`043d3b2e9c69caf99d1246f1408b3ad7194b7864`. Implementation work may use a different internal
architecture, but must not introduce alternate interaction rules or product behavior. The local
reference is complete and must be read with `git show`/`git grep`; no remote fetch is part of this
work.

The checked-in overview at `docs/reference/project-chat-windowing.md` is the primary product
contract. The sources below resolve its implementation details.

| Behavior                                                   | Frozen-main authority                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Floating frame, title editing, header actions              | `frontend/src/components/ChatWindowing/ProjectChatWindowSurface.tsx`                                                       |
| Move, resize, focus, maximize, minimize, close             | `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` and `frontend/src/state/actions/projectChatWindowing.ts` |
| Minimized-window recovery strip                            | `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`                                                          |
| Snap presets, previews, normalization, shared split resize | `frontend/src/components/ChatWindowing/projectChatSnapLayout.ts`                                                           |
| Window Space save, restore, rename, delete, reorder        | `frontend/src/components/Panes/Overview/WindowSpacesPane.tsx` and `frontend/src/state/actions/windowSpaces.ts`             |
| Dedicated saved-layout interaction and hydration           | `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx` and adjacent helpers                              |
| Section-to-window placeholder integration                  | `frontend/src/components/Section/Container/SectionWindowSurface.tsx` and `SectionWindowPlaceholder.tsx`                    |

The matching frozen-main test files are executable specifications for edge cases. Package tests
will restate portable behavior without importing application modules.

## Ownership boundary

`@setta/workspace` owns:

- A validated, serializable, controlled window view model that remains separate from
  `WorkspaceDocument`.
- Pure state transitions for open/reopen, focus, move, resize, snap, minimize, maximize/restore,
  close, and title change.
- Floating chrome, pointer interactions, snap preview, shared split resize handles, and host-box
  measurement.
- A bottom-end recovery strip for minimized windows.
- Pure Window Space snapshot and restore functions.
- A controlled Window Spaces management pane and a locally interactive dedicated-space surface.
- Generic renderer dispatch by stable surface kind and content identity.

The host application owns:

- Content components and their domain state, including chat, Git, section, URL, and backend data.
- Opening a section as a window and rendering any canvas placeholder.
- Persistence, optimistic writes, notifications, permissions, routing, and dedicated-tab URLs.
- The launcher for closed content. The package exposes a transition to reopen it.
- Choosing boundary insets imposed by application rails, headers, docks, or overlays.

No window or Window Space state enters `WorkspaceDocument`. A host may persist the controlled
values alongside its other view state.

## Public model

Introduce a `windowing` package module with these concepts:

- `WorkspaceWindowingState`: ordered window instances plus the next focus order.
- `WorkspaceFloatingWindow`: stable instance id, stable content identity, renderer kind, title, opaque
  renderer data, placement, floating/restore bounds, minimized/closed flags, and z-index.
- `WorkspaceWindowBounds` and `WorkspaceWindowBoundaryInsets`: finite pixel measurements in the
  layer's own coordinate system.
- `WorkspaceWindowSpace`: stable id, name, order, and normalized snapshots of eligible windows.
- `WorkspaceWindowRenderer`: host-supplied renderer selected by `surfaceKind`; the package never
  decodes opaque renderer data.

Constructors validate unknown external values once. Every multi-window transition validates its
complete input and prospective output before returning one next state. Invalid input produces a
typed package error; it never yields a partial update or a success callback.

The initial public component surface is:

- `WorkspaceWindowManager`: controlled interactive layer for live windows.
- `WorkspaceWindowSurface`: exported frame for hosts that need the exact chrome in another
  composition.
- `WorkspaceWindowSpacesPane`: controlled save/restore/rename/delete/reorder management UI.
- `StandaloneWorkspaceWindowSpaceSurface`: dedicated saved-layout renderer whose focus and shared
  split-resize changes stay local.

The layer fills its positioned host element and observes that element with `ResizeObserver`.
Window coordinates never depend on global viewport constants.

`WorkspaceShell` gains one optional, package-typed window-manager composition point between its
canvas and pane rails. The same layer remains independently mountable. It must not reuse the
canvas-bound `SectionContainer`: duplicate section refs, drag-and-drop state, and resize state would
couple two owners of one section id.

## Frozen behavior to preserve

### Window chrome and lifecycle

- Focus raises a window above every other live window. Equal or stale z-index values resolve
  deterministically.
- The default float helper creates an 820 px-wide window at 70% of the usable height, centered and
  clamped to the current inset work area. Initial dock ownership remains an application concern.
- Dragging begins from the title region. Free resize handles match the reference's top, bottom, and
  four corners; there are no independent left/right handles. Resizing enforces
  the frozen live minimum of 380 x 240 px and the current inset boundary. At least 120 px remains
  horizontally visible and the 32 px title bar remains vertically reachable when an unsnapped
  window is moved. Dragging a snapped window at least 6 px restores its cached free bounds, or the
  default float bounds when none exist.
- Maximize fills the inset boundary and remembers the preceding floating bounds. Restore returns
  to those bounds. Minimize hides the surface and adds a bottom-end recovery pill; activating that
  pill reopens, focuses, and raises the same window. Close hides the surface without adding a pill.
  Pills preserve stable window order, use the frozen 28 px top-tab treatment, and remain reachable
  in a compact horizontal overflow strip at narrow widths.
- The title is focusable. Double-click or `Space` starts editing; `Enter`/blur commits a non-empty
  trimmed title; `Escape` cancels and restores focus. Invalid drafts stay visible with an inline
  error.
- Layout-disabled/read-only mode removes mutation actions and title editing. The reusable frame can
  render without a header. Pointer focus remains available as local view behavior.
- Header actions retain the frozen compact neutral, blue-minimize, and red-close interaction
  treatment through package-scoped CSS.
- Keyboard behavior targets the focused window: `Mod+Shift+Enter` maximizes/restores,
  `Mod+Shift+M` minimizes, and `Mod+Alt+ArrowLeft/Right/Up/Down` applies cardinal snaps. The four
  corner shortcuts are `Mod+Alt+Shift+Q/W/A/S` in reading order.
- Shortcut matching is platform-aware and exact. A capture listener ignores repeats,
  default-prevented events, and editable targets, then consumes only handled commands before canvas
  key behavior. There is no keyboard move or resize behavior.
- Drag/resize previews are local and animation-frame batched. Pointer release emits one validated
  controlled-state update; shared split resize commits every affected window atomically.

### Snap and tiling

- Support exactly `left`, `right`, `top`, `bottom`, `top_left`, `top_right`, `bottom_left`, and
  `bottom_right`.
- Entering an edge zone within 84 px shows the proposed bounds. Corners take priority over sides.
- Snapping uses exact halves or quarters of the inset boundary. Classification tolerates 2 px and
  continues to recognize edge-anchored tiles after their shared split is resized.
- Snapped windows visually join: exterior chrome remains, adjoining radii/shadows are removed.
- Touching snapped windows expose merged shared split handles. Dragging a split changes both sides
  atomically with a minimum 24 px span and no gap or overlap.
- Split handles keep the reference's `separator` role and orientation and remain pointer-only.
- Bounds normalize and denormalize against the inset boundary so a saved layout scales to a new
  host size.

### Window Spaces

- Save is available only when layout editing is allowed and at least one eligible floating window
  exists.
- A snapshot includes visible floating windows only. Closed, minimized, and maximized instances
  are excluded. Windows retain content identity, surface kind, title, normalized bounds, renderer
  data, and stacking order.
- Restore denormalizes into the current host boundary, preserves unrelated live windows, reuses a
  live instance with the same content identity, and remaps colliding instance ids that belong to
  different content. One restore produces one validated state update.
- The pane provides the frozen empty state and actions to restore, open in a dedicated surface,
  rename, delete, and reorder. Read-only mode exposes only non-mutating actions.
- Row activation restores; opening the dedicated view remains available in read-only mode. The host
  supplies its route or new-tab callback.
- Renaming requires a non-empty trimmed name. Async persistence and error messaging remain host
  responsibilities and are represented by callback/pending/error props rather than package-owned
  network behavior.

### Dedicated surface

- A dedicated surface renders the saved snapshot as flat square/shadowless frames. Pointer focus
  changes local stacking, and an already-snapped layout exposes shared split resize handles.
- Its compact standalone minimum is 220 x 180 px, matching the frozen dedicated route.
- It intentionally has no title drag, free resize, snap ghost, keyboard snap, maximize, minimize,
  close, or dock controls. Interaction is local and does not write into the saved Window Space.
- Re-rendering the same space preserves local edits. Changing the space id or supplied revision
  hydrates the new saved layout and clears previous local edits.
- Missing renderers and invalid/empty layouts produce explicit accessible states.

## Implementation batches and commits

1. **Plan and contract.** Commit this reference map and frozen behavior before production changes.
2. **Geometry and controlled state.** Add validated types, pure snap/normalization/shared-resize
   geometry, lifecycle transitions, and focused boundary tests.
3. **Interactive floating manager.** Add frame chrome, title editing, pointer move/resize, focus,
   lifecycle buttons, minimized-window recovery, snap preview, split handles, scoped styles, and
   component tests.
4. **Window Spaces domain.** Add snapshot/restore identity rules and tests for exclusion,
   normalization, reuse, unrelated preservation, collision remapping, and atomic failure.
5. **Management and dedicated surfaces.** Add the pane, local hydration rules, read-only behavior,
   reorder/rename flows, explicit empty/error states, and component tests.
6. **Integration.** Export the complete coherent API, document host usage, add a playground example
   using generic content renderers, and run accessibility/host-box regression tests.
7. **Delivery.** Run focused tests while editing, `code-polishy test --changed`, and one final
   `code-polishy merge-gate --base main`; commit the verified candidate without pushing.

Each production commit must leave the public package surface coherent. Internal modules may land
first when they are not exported until their complete consumer-facing batch is ready.

## Verification matrix

- Pure geometry: all eight presets round-trip; pointer priority; inset boundaries; classification
  after split resize; vertical and horizontal shared handles; no-gap atomic split movement;
  cross-size normalized bounds.
- State: initial bounds; focus order; valid move/resize; minimize/reopen; close/reopen;
  maximize/restore; read-only rejection; malformed external input rejection.
- Spaces: save eligibility; exclusions; z-order; current-size restore; same-content reuse;
  unrelated preservation; conflicting-id remap; invalid batch leaves the original value untouched.
- Components: title keyboard contract; headerless frame; hidden read-only actions; drag/resize/snap
  preview; split handles; minimized-only recovery and focus; manager empty/actions/reorder;
  dedicated limited interaction, local hydration, and renderer failures.
- Integration: two independent package hosts do not share state; embedded host measurement and
  resize normalization; package boundary/build; playground behavior.

## Completion criteria

- A host can open multiple arbitrary content surfaces, move/resize/focus them, use every frozen snap
  layout, minimize and recover them, and control lifecycle state through one serializable value.
- It can save, restore, rename, delete, reorder, and render Window Spaces with frozen-main behavior.
- All new APIs are documented at the package root, use package-scoped styling, and introduce no
  application-domain dependency.
- Focused tests, changed-scope policy tests, package build/boundary checks, and the final merge gate
  pass from a clean task-owned commit set.
