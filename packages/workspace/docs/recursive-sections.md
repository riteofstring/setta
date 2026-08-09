# Recursive sections, movement, and frame layout

Top-level sections are free spatial objects. Descendants are ordinary package-rendered DOM frames
in the explicit ordered or freeform layout of their immediate parent. The package imposes no
numeric containment depth, and consumers do not project descendants as XYFlow nodes or maintain a
second parent map.

## Registering a container kind

A section kind opts into containment with `canContainSections: true`. Its definition may also set
the initial child positioning, ordered orientation, and overflow mode.

```tsx
const containerDefinition = {
  kind: "group",
  displayName: "Group",
  defaultTitle: "Group",
  defaultSize: { width: 480, height: 360 },
  defaultSizeMode: { width: "fixed", height: "content" },
  contentSizing: { width: true, height: true },
  canContainSections: true,
  defaultChildPositioning: "ordered",
  defaultChildOrientation: "vertical",
  defaultChildOverflow: "grow",
  render: GroupSummary,
} satisfies SectionDefinition<GroupData>;
```

The matching document section starts with one ordered, non-null `childLayout`, even while empty.
The package owns
the child region, empty-container affordance, measurement, insertion geometry, accessible scroll
region, and recursive frame rendering. The host renderer stays adjacent to that region and must not
replace its ordering markup.

Registered containment support is necessary but not sufficient for an existing document: every
child must appear exactly once, the complete hierarchy must be reachable and acyclic, and each
persisted parent-child relationship must be acceptable to the host's permanent domain rules.

## Ordered and freeform positioning

Every schema-v2 child layout has an explicit `positioning` discriminator. Ordered layouts carry an
orientation and use `sectionIds` as logical layout order. Freeform layouts omit orientation, retain
`sectionIds` as deterministic traversal and back-to-front sibling order, and carry exactly one
finite, non-negative local position for every direct child.

`controller.setSectionChildPositioning` switches the complete direct-child region in one
`section-positioning` history entry. Ordered-to-freeform callers provide the measured local
positions; freeform-to-ordered callers select the new orientation. The command preserves child
identity, order, overflow, selection, and unrelated section records. It snapshots the supplied
positions and rejects incomplete, extra, accessor-backed, negative, or non-finite coordinates
before proposing a document.

```ts
controller.setSectionChildPositioning("group", {
  positioning: "freeform",
  positions: {
    "note-a": { x: 24, y: 32 },
    "note-b": { x: 312, y: 84 },
  },
});
```

Selected containers expose the same conversion through a named native control when layout editing
is available. Ordered-to-freeform conversion derives a complete local position map from the direct
child rectangles and commits immediately because it preserves their displayed arrangement.
Freeform-to-ordered conversion opens a native dialog for vertical or horizontal order. It asks for
confirmation only when the chosen order differs materially from the measured positions; Cancel and
Escape retain the current layout and restore trigger focus. Accepted, unchanged, rejected, and
controlled-host-retained outcomes use a pre-mounted polite announcement. The control is unavailable
for locked or minimized containers because their required conversion geometry is not actionable.

The recursive DOM renders those local positions without another XYFlow store or viewport. The
same-parent freeform movement path updates only the moved position entries and preserves canonical
stacking order. Structural movement and grouping use measured destination-local positions inside a
freeform parent. Moving, grouping, ungrouping, or deleting children replaces the exact position map
atomically, so removed children leave no stale keys; clipboard cloning remaps position keys with the
cloned child IDs. Paste resolves the deepest eligible parent at the meaningful canvas point,
preserves the copied root block's offsets, and derives either one ordered insertion index or one
destination-local freeform position per pasted root.

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

| Mode   | Root handle                      | Ordered child handle       | Freeform child handle           | Result                                                                    |
| ------ | -------------------------------- | -------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `sort` | Ordinary spatial XYFlow movement | Structural sibling sorting | Same-parent spatial positioning | Parent stays fixed; ordered moves change order, freeform moves positions. |
| `free` | Structural movement              | Structural movement        | Structural movement             | Move to the canvas or any valid measured ordered or freeform container.   |

The mode captured at activation stays in force through completion or cancellation. The active
interaction owner disables root movement and viewport activators that would compete for the same
pointer, touch, or keyboard gesture. Switching the prop changes the next gesture, never one already
in progress.

Only a named section movement handle starts a recursive drag. Pointer and touch previews use the
same package planner as keyboard movement. A free move into an ordered container resolves one
orientation-aware insertion index; a free move to the canvas resolves workbench coordinates rather
than client pixels. A free move into a nested freeform container converts the measured selection
block into that surface's local coordinates, preserves relative offsets, snaps and clamps the block
as one unit, and accounts for the outer viewport plus intervening native scrolling. Keyboard free
move selects the nearest valid measured ordered or freeform destination in the requested direction.
Preview and completion are revalidated against the current document, geometry, lock state, and host
policy before one `section-move` proposal is emitted.

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
      plan.destination.parentId === null ? null : document.sections[plan.destination.parentId];
    return destination?.kind === "generated-only"
      ? { allowed: false, reason: "This group accepts generated sections only." }
      : { allowed: true };
  }}
/>
```

The callback is synchronous and side-effect-free. It receives an immutable `SectionMovePlan` after
package-owned source-placement, destination placement, cycle, and lock checks. Ordered
destinations carry an insertion index. Canvas and nested freeform destinations carry one
destination-local position for each moved selection root. A rejection reason is displayed with a
non-color cue and announced. Do not mutate or persist from the preview callback; persist the single
accepted document proposal instead.

In sort mode, a child of an ordered parent reorders among siblings, while a child of a freeform
parent moves spatially without changing `sectionIds`. Pointer, touch, and keyboard movement share
the same local-coordinate plan, grid snapping, selected-block offsets, start-edge clamping, focus
restoration, and one controlled commit. Native scrolling of the freeform parent and outer canvas
zoom do not change the persisted local coordinates.

## Grouping and ungrouping

Grouping is a structural shortcut over the same canonical hierarchy. At least two normalized
siblings must share one parent, and `groupFactory` must produce a registered container kind. The new
group is inserted at the first selected sibling and receives the selected roots in canonical order.
At the canvas, the group uses selected measured bounds. In an ordered parent it occupies the same
ordered position. In a freeform parent it uses the selected block's canonical local start position,
measured size, and first-selected stacking index while replacing every selected position key with
the one group key.

Ungrouping promotes only the container's direct children at its index, then removes the empty
container. Root children receive deterministic non-overlapping positions derived from measured
group bounds. Children promoted into a freeform parent receive positions derived from their current
measured geometry in that parent's local coordinates. If scrolling would cross a nested start edge,
the complete promoted block translates together to remain non-negative. Group, ungroup, undo, and
redo preserve section identity, child order, and unaffected freeform positions.

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

`grow` lets the child region participate in content sizing. For an ordered layout, `scroll`
constrains the orientation's main axis. For a freeform layout, it constrains both dimensions so the
complete local surface can scroll on either axis. Switching a content-sized constrained axis to
scroll captures its current measured dimension as fixed, avoiding a visual jump. Switching back to
grow restores content participation when that axis is supported, without changing containment,
order, or positioning.

Wheel input inside an actually scrollable child region stays with that region. At an edge, the
configured outer viewport policy may resume according to the normal interaction boundary. Locked,
minimized, unmeasured, or non-container transitions reject with a specific action result.

## Grid and snapping

Grid visibility and snapping are independent host preferences. `gridOptions.spacing` is a two-axis
workbench-unit grid used by root movement, root resize, and freeform child movement. Dots, lines,
and crosses remain phased through pan and zoom. Ordered nested children do not use spatial
snapping. Freeform pointer, touch, and keyboard movement snaps in the immediate parent's local
coordinate system and translates a selected block together at its local start edges.

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
