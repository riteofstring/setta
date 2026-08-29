# Workspace section-window handoff and bottom docking

Status: implemented

## Outcome

Extend `@setta/workspace` so an ordinary canvas section can move into the package's existing
managed-window layer, move between floating and bottom-docked presentation, maximize, minimize,
close, reopen, and return to its original canvas host. The canvas keeps the section's measured
place with the frozen reference placeholder while the external window remains the sole content
owner.

This is a direct extension of the controlled floating-window API. It is an atomic public cutover
inside an unpublished package; no compatibility layer or migration is required.

## Reference authority

UX and behavior are fixed by local `main` commit
`043d3b2e9c69caf99d1246f1408b3ad7194b7864`. Implementation may use package-native state and
composition, but must not invent alternate labels, actions, placement rules, responsive behavior,
or permission behavior. The local reference is read with `git show` and `git grep`; no fetch or pull
is part of this work.

| Behavior                                            | Frozen-main authority                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Section header toggle                               | `frontend/src/components/Section/Header/SectionWindowToggleButton.tsx` and its test                        |
| Canvas placeholder                                  | `frontend/src/components/Section/Container/SectionWindowPlaceholder.tsx` and its test                      |
| Section content in a window                         | `frontend/src/components/Section/Container/SectionWindowSurface.tsx` and its test                          |
| Binding and placement transitions                   | `frontend/src/state/actions/projectChatWindowing.ts` and `projectChatWindowing.test.ts`                    |
| Dock panels, actions, resize, overflow, and manager | `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`                                          |
| Pure responsive dock sizing                         | `frontend/src/components/ChatWindowing/projectChatBottomDockLayout.ts` and `ProjectChatBottomDock.test.ts` |
| Layout permissions                                  | `frontend/e2e/project-chat-layout-permissions.spec.ts`                                                     |
| Responsive dock acceptance                          | `frontend/e2e/project-chat-bottom-dock.spec.ts` and `project-chat-manager-menu.spec.ts`                    |
| Window Space ownership reconciliation               | `frontend/src/state/actions/windowSpaces.ts` and its restore tests                                         |

The package tests will restate the portable behavior without importing application modules.

## Product boundary

`@setta/workspace` owns:

- One validated, serializable `WorkspaceWindowingState` as the authority for every managed
  placement, lifecycle flag, section binding, dock metric, and z-index.
- Section-to-window commands, canvas placeholder projection, and the dedicated section window
  surface.
- Floating, docked, maximized, minimized, closed, and canvas-section placement transitions.
- Dock measurement, proportional width allocation, overflow selection, cycle/menu recovery,
  resizing, action chrome, and the persistent window manager trigger.
- Reconciliation that prevents a saved floating layout from becoming a second owner of a section
  already hosted by the canvas or dock.

The host owns:

- The controlled state value, persistence boundary, permissions value, and local viewport
  measurement supplied to the package.
- Registered section kinds and their opaque content/runtime state.
- Generic non-section window renderers and launchers for new generic content.
- Application routes, browser tabs, chat/Git semantics, backend writes, notifications, and
  multi-user coordination.

The canonical `WorkspaceDocument` remains independent of window view state. Externalizing a
section never removes or clones the section document. Projection selects exactly one live content
owner from the controlled placement.

## Public model and composition

Expand `WorkspaceWindowPlacement` to the frozen placement vocabulary:

- `canvas_section`
- `bottom_docked`
- `floating`
- `maximized`

A managed window keeps its existing stable `id`, `contentId`, generic renderer identity, floating
bounds, lifecycle flags, and focus order. It also carries:

- `sectionId: string | null`, with one reserved package section surface kind.
- Dock metrics containing a finite preferred width and normalized width fraction.
- The placement to restore after maximize, so a docked window restores to the dock and a floating
  window restores to its previous floating bounds.

Constructors validate the entire value at the input boundary. Section commands additionally
validate the current document before returning a next state: the section must exist and use an
ordinary registered presentation. Groups, package roots, and meta controls cannot externalize.
Every section can have at most one bound managed window, and `contentId` uniqueness remains the
generic single-owner invariant.

`WorkspaceShell` receives one typed controlled windowing configuration. It provides the state to
the canvas projection and mounts the manager in the existing overlay layer, so the section header,
placeholder, dock, and floating manager cannot accidentally receive different state values. The
standalone manager remains suitable for generic windows; section handoff is the integrated shell
contract.

The package adds a dedicated section window surface that shares registered body and header
composition with the canvas. It deliberately excludes the canvas's XYFlow node, DnD wrappers,
section position ref, canvas resize handles, and canvas-only lock/minimize/delete controls. This
avoids two mounted owners for one section id while preserving its real registered content and
document updates.

## Frozen behavior to preserve

### Section handoff

- The header toggle is visible only when layout editing is allowed and the section supports
  external presentation. Its normal label is `Open section in floating window`; while externally
  bound, its label is `Show section in canvas`.
- Opening creates or reuses the one section binding, selects `floating`, seeds frozen default
  floating bounds when coming from a non-floating host, clears minimized/closed state, focuses it,
  and raises it.
- Returning to the canvas moves that same instance to `canvas_section`; it does not delete and
  recreate the binding.
- Any non-`canvas_section` binding makes the canvas render the placeholder instead of registered
  content. The placeholder remains while the window is minimized or closed, because the binding
  still owns the content.
- The placeholder says `{section name} moved to a window`. `Focus window` reopens, focuses, and
  raises the instance. Editable layouts also show `Show in canvas`; read-only layouts instead say
  `Focus the external window from here.` and expose no restore action.
- The external surface renders the normal section header and registered body. Canvas container
  controls are absent; only placement/lifecycle controls belonging to the window host appear.
- Section name changes are reflected from the document rather than creating a competing mutable
  window title.

### Placement and lifecycle

- Floating section windows retain all existing move, resize, snap, shortcut, Window Space, and
  focus behavior.
- Docking preserves reusable floating bounds and moves the same instance to `bottom_docked`.
  Undocking moves it to `floating`, reopens, focuses, and raises it.
- Maximize remembers the preceding `floating` or `bottom_docked` placement. Restore returns there;
  a floating restore also uses its remembered bounds.
- Minimize hides the surface and exposes it in the bottom recovery strip. Reopen restores its
  existing placement and focuses it. Close hides the surface without a minimized pill, while the
  persistent manager can reopen it.
- A canvas-owned instance is not a visible managed window and cannot be moved, resized,
  minimized, or closed until externalized again.
- Read-only mode removes every layout mutation, title mutation, drag, resize, snap, dock, undock,
  maximize, minimize, close, and canvas-restore control. Focus and reopen remain available as
  local presentation behavior and never emit a forbidden controlled write.

### Dock panels and controls

- The dock is anchored above the manager's bottom inset. The visible row uses 12 px gaps and 4 px
  horizontal padding.
- A panel defaults to 460 px wide and approximately 70% of usable height, clamps to 280 x 220 px,
  and never exceeds 1160 px wide or the measured usable height.
- Docked panels expose six resize targets: top, bottom, and four corners. Preview is local and
  animation-frame batched; pointer release commits the affected preferred width/fraction and
  height in one validated controlled update.
- Desired panel widths shrink proportionally until every visible panel reaches 280 px. When all
  panels cannot fit, later focused panels remain visible and the other open panels move to the
  recovery strip/menu without being minimized or closed.
- Docked section action order is cycle backward/forward when overflow requires it, `Show in
canvas`, `Undock`, `Maximize`, `Minimize`, `Close`. Floating and maximized section surfaces add
  `Show in canvas` and the appropriate `Dock` or restore action around the existing lifecycle
  controls.
- The strip adapts from full-title pills to 28 px compact pills, then cycle controls, then a menu.
  With multiple windows and a viewport at or below 520 px it uses menu mode. A 360 px viewport may
  show no dock panel, but every instance remains recoverable.
- The window manager trigger is persistent beside the strip. It lists every instance and its
  placement. Visible instances can be focused; minimized/closed instances can be reopened.
  Editable layouts additionally expose canvas/float placement and hide actions.
- Existing floating keyboard shortcuts stay exact. Dock/undock remains a pointer/control action;
  no new shortcut is invented.

### Window Spaces and document reconciliation

- Window Space snapshots still include visible ordinary floating windows only. Docked,
  canvas-owned, minimized, closed, and maximized instances are excluded.
- Restore preserves unrelated live content. A saved section entry is ignored when that section is
  currently owned by a docked or canvas-section instance; restore cannot create or move a second
  competing owner.
- If a bound section disappears from a newly loaded document, reconciliation validates the entire
  candidate first and removes its stale managed instance in one controlled state publication.
- Two `WorkspaceProvider` hosts may use the same section ids without sharing bindings, focus,
  keyboard targeting, or dock state.

## Implementation batches and commits

1. **Plan and reference contract.** Commit this document before production work.
2. **Controlled placement state.** Add placements, section binding and dock metrics, maximize
   restore ownership, docking/undocking/section handoff transitions, full validation, and pure
   state tests.
3. **Responsive dock.** Port the frozen pure width/overflow rules, add dock panels, resize
   previews, recovery/menu management, action ordering, scoped styles, and component tests.
4. **Section projection.** Add the integrated shell configuration, header toggle, canvas
   placeholder, dedicated section surface, document reconciliation, and tests proving one content
   renderer at a time.
5. **Playground and documentation.** Demonstrate a real canvas section moving through floating,
   docked, maximized, minimized, closed, reopened, and canvas states. Update the package README and
   public export contract.
6. **Verification and delivery.** Run focused tests while editing, a real browser walkthrough at
   wide and narrow host sizes, `code-polishy test --changed`, and one final
   `code-polishy merge-gate --base main`. Commit each coherent candidate without pushing.

Production commits must keep the exported package contract coherent. The root agent owns commits;
delegated workers edit bounded files and do not commit.

## Verification matrix

- Types: every new field rejects unknown, missing, non-finite, duplicate, and incompatible input;
  state construction remains immutable.
- State: section open/reuse/canvas return; dock/undock; maximize/restore from dock and float;
  minimize/reopen; close/reopen; z-order; layout-disabled rejection; invalid section binding.
- Ownership: no duplicate body render; placeholder persists for minimized/closed external
  bindings; section rename reflects in the surface; stale document binding reconciliation is one
  publication.
- Dock geometry: exact constants; proportional shrink; minimum-width count; stable overflow
  selection; full/compact/cycle/menu modes; top/bottom/corner resize clamps; insets.
- Components: exact labels and action order; section-type policy; placeholder actions and copy;
  dock panel recovery; persistent manager; hidden read-only mutations; focus/reopen behavior.
- Window Spaces: dock/canvas exclusions and no competing restored section owner.
- Integration: two isolated hosts, embedded measurement, pane inset changes, keyboard targeting,
  package public API, package boundary, build, and playground tests.
- Browser: handoff and return; float to dock to undock; minimize then placeholder focus; close then
  manager reopen; maximize/restore to prior host; wide multi-dock; 720 px overflow cycling; 360 px
  menu recovery; read-only focus; no rail or bottom-inset overlap.

## Completion criteria

- A playground user can move a real registered section into a floating window, dock and undock it,
  maximize and restore it to the correct prior host, minimize or close and recover it, and return
  it to the canvas without duplicate content.
- Responsive dock overflow and read-only behavior match frozen `main`, including recovery when no
  panel fits.
- The package API, README, public export test, focused component/state tests, real browser
  walkthrough, changed-scope checks, and final merge gate have been run and summarized.
- The completed feature is committed in coherent task-owned commits. The active plan is removed
  only after the user later asks to clean completed plans.
