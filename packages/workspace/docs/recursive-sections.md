# Recursive sections, movement, and frame layout

Top-level sections are free spatial objects. Descendants are ordinary package-rendered DOM frames
in the ordered layout of their immediate parent. The package imposes no numeric containment depth,
and consumers do not project descendants as XYFlow nodes or maintain a second parent map.

## Registering a container kind

A section kind opts into containment with `canContainSections: true`. Its definition may also set
the initial child orientation and overflow mode.

```tsx
const containerDefinition = {
  kind: "group",
  displayName: "Group",
  defaultTitle: "Group",
  defaultSize: { width: 480, height: 360 },
  defaultSizeMode: { width: "fixed", height: "content" },
  contentSizing: { width: true, height: true },
  canContainSections: true,
  defaultChildOrientation: "vertical",
  defaultChildOverflow: "grow",
  render: GroupSummary,
} satisfies SectionDefinition<GroupData>;
```

The matching document section has one non-null `childLayout`, even while empty. The package owns
the child region, empty-container affordance, measurement, insertion geometry, accessible scroll
region, and recursive frame rendering. The host renderer stays adjacent to that region and must not
replace its ordering markup.

Registered containment support is necessary but not sufficient for an existing document: every
child must appear exactly once, the complete hierarchy must be reachable and acyclic, and each
persisted parent-child relationship must be acceptable to the host's permanent domain rules.

## Orientation and logical order

`vertical` lays out direct children on the block axis. `horizontal` lays them out on the logical
inline axis, so insertion, keyboard direction, and announcements mirror in right-to-left content.
Changing orientation never changes the canonical `sectionIds` order or parent relationship.

Selected container frames expose a named orientation control when layout editing is available. A
scroll container captures a measured finite dimension when its new constrained axis was
content-sized; if that measurement is unavailable, the command rejects instead of guessing. One
accepted orientation change creates one `section-orientation` history entry.

## Sorting and free-move modes

`sectionMoveMode` defaults to `sort` and is a host/session preference, not serialized state.

| Mode   | Root handle                      | Nested handle              | Allowed structural result                                        |
| ------ | -------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| `sort` | Ordinary spatial XYFlow movement | Structural sibling sorting | Parent is unchanged; only the sibling index may change.          |
| `free` | Structural movement              | Structural movement        | Move to the canvas or any valid measured container at any depth. |

The mode captured at activation stays in force through completion or cancellation. The active
interaction owner disables root movement and viewport activators that would compete for the same
pointer, touch, or keyboard gesture. Switching the prop changes the next gesture, never one already
in progress.

Only a named section movement handle starts a structural drag. Pointer and touch previews use the
same package planner as keyboard movement. A free move into a container resolves one
orientation-aware insertion index; a free move to the canvas resolves workbench coordinates rather
than client pixels. Preview and completion are revalidated against the current document, geometry,
lock state, and host policy before one `section-move` proposal is emitted.

### Selection blocks

Dragging an unselected section selects and moves it. Dragging a selected section moves normalized
selection roots as one atomic block. Ancestors suppress selected descendants; roots from one parent
preserve canonical sibling order, while mixed-parent roots use deterministic visual/hierarchy
order. Canvas drops preserve every measured root's relative workbench offset. Sorting remains
sibling-only; free-move can converge roots from multiple source parents into one destination.

The moving roots are excluded from collision candidates. Empty containers remain valid targets.
Moving a section into itself or its descendants is rejected before commit, and leaving every valid
target clears stale preview state.

### Host move policy

Use `validateSectionMove` only for relationships the generic hierarchy cannot express:

```tsx
<Workspace
  sectionMoveMode="free"
  validateSectionMove={({ document, plan }) => {
    const destination =
      plan.destinationParentId === null ? null : document.sections[plan.destinationParentId];
    return destination?.kind === "generated-only"
      ? { allowed: false, reason: "This group accepts generated sections only." }
      : { allowed: true };
  }}
/>
```

The callback is synchronous and side-effect-free. It receives an immutable `SectionMovePlan` after
package-owned source-placement, destination, cycle, and lock checks. A rejection reason is displayed
with a non-color cue and announced. Do not mutate or persist from the preview callback; persist the
single accepted document proposal instead.

## Grouping and ungrouping

Grouping is a structural shortcut over the same canonical hierarchy. At least two normalized
siblings must share one parent, and `groupFactory` must produce a registered container kind. The new
group is inserted at the first selected sibling and receives the selected roots in canonical order.
At the canvas, the group uses selected measured bounds; at nested depth, it occupies the same
ordered position.

Ungrouping promotes only the container's direct children at its index, then removes the empty
container. Root children receive deterministic non-overlapping positions derived from measured
group bounds. Group, ungroup, undo, and redo preserve section identity and child order.

## Locking and minimizing

Position-and-size locking prevents direct movement, reordering, reparenting, and resize of that
section. It does not disable host-rendered controls, freeze payload data, inherit to descendants, or
prevent a locked container from accepting an unlocked child. Ancestor layout changes may still move
a locked descendant visually. Layout controls that require a new measurement also reject while the
section is locked.

Minimizing unmounts the host-rendered body and keeps compact package chrome plus the complete child
region. The section remains selectable, movable when unlocked, and a valid container. Fixed
dimensions restore exactly; content-sized axes retain finite fallbacks and resume measurement after
expansion. Put durable host state in the section payload, not component-local state. A definition
with `minimizable: false` exposes no minimize control and rejects the command.

Both states have named native controls, persistent non-color indicators, controlled-host
reconciliation, focus restoration, announcements, and one history entry per accepted change.

## Fixed and content sizing

Width and height each serialize a `fixed` or `content` mode plus a positive finite fallback value.
Definitions declare which axes permit content sizing and the resize axes, minimum, maximum, and
optional aspect-ratio policy.

Selected roots expose logical inline-end, block-end, and corner resize controls according to the
definition. Pointer movement remains transient; completion publishes one `section-resize` change.
Keyboard arrows use the same constraints. When grid snapping is enabled, both paths resolve in
workbench units at the current zoom.

Double-clicking a resize control, or pressing Enter or Space while it is focused, returns supported
axes to content mode. Starting a later manual resize measures the rendered frame, promotes only the
affected content axes to fixed mode, and applies the delta from that measurement. Live
`ResizeObserver` updates feed shared geometry without rewriting the canonical document.

Locked or minimized sections expose no active resize controls. Invalid axes or unavailable
measurements reject specifically rather than silently changing a different size mode.

## Grow and scroll overflow

`grow` lets the child region participate in content sizing. `scroll` constrains the orientation's
main axis and gives the child region its own named scroll surface. Switching a content-sized main
axis to scroll captures its current measured dimension as fixed, avoiding a visual jump. Switching
back to grow restores content participation when that axis is supported, without changing
containment, order, or orientation.

Wheel input inside an actually scrollable child region stays with that region. At an edge, the
configured outer viewport policy may resume according to the normal interaction boundary. Locked,
minimized, unmeasured, or non-container transitions reject with a specific action result.

## Grid and snapping

Grid visibility and snapping are independent host preferences. `gridOptions.spacing` is a two-axis
workbench-unit grid used by root movement and root resize, including negative coordinates. Dots,
lines, and crosses remain phased through pan and zoom. Nested children stay ordered by their parent
and are not spatially snapped.

Showing a grid does not enable snapping, and hiding it does not disable snapping. Keep controlled
snap ownership stable by passing both `gridOptions.snap` and `onGridSnapChange`, or omit the callback
for workbench-local toggle state.

## Chrome, accents, and tags

Every section persists one `default`, `compact`, `transparent`, or `none` chrome value plus optional
accent and tag colors. Chrome changes presentation only: transparent and headerless sections retain
named selection, movement, and action surfaces. Accents derive frame-local decorative tokens; tags
remain small categorical markers. Neither replaces the focus, selection, lock, minimized, invalid,
or drop indicators.

The built-in style editor uses six labeled OKLCH choices plus reset. Supply
`sectionColorPalette` to replace the choices with other valid CSS colors. Labels and colors must be
unique. One accepted chrome, accent, or tag edit creates one `section-presentation` history entry;
the host body remains mounted while the style panel is open.
