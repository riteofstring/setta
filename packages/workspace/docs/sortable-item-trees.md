# Sortable item trees

`SortableItemTree` adds host-defined item reordering and nesting inside a section. It is a fully
controlled React surface: the package owns interaction, selection planning, feedback, and move
validation, while the host owns item values, the canonical tree, persistence, and history.

## Tree contract

```ts
type SortableItemTree = {
  rootId: string;
  itemIds: readonly string[];
  childrenByParent: Readonly<Record<string, readonly string[]>>;
};
```

`rootId` is a non-rendered container and must not appear in `itemIds`. Item IDs are unique and
non-empty. Every parent key is the root or a known item, every child is known, every item appears
exactly once, all items are reachable from the root, and containment is acyclic. Validation is
iterative, so depth is not limited by recursive JavaScript calls.

Use `validateSortableItemTree` for an unknown tree,
`deriveSortableItemParentLookup` when the host needs a derived parent index, and
`getSortableItemOrder` for canonical preorder. Do not persist a second parent map.

## Controlled rendering

```tsx
import { applySortableItemMove } from "@setta/workspace/core";
import { SortableItemTree } from "@setta/workspace/react";

<SortableItemTree
  ariaLabel="Profile field order"
  tree={tree}
  selectedItemIds={selectedItemIds}
  onSelectedItemIdsChange={setSelectedItemIds}
  getItemLabel={(itemId) => fields[itemId].label}
  renderItem={(itemId) => <FieldEditor field={fields[itemId]} />}
  canContainChildren={(itemId) => fields[itemId].type === "group"}
  canMove={(plan) => policyAllows(plan)}
  onMove={(plan) => setTree((current) => applySortableItemMove(current, plan))}
/>;
```

`ariaLabel`, `getItemLabel`, `renderItem`, `onMove`, and `onSelectedItemIdsChange` have distinct
jobs. The rendered row may contain inputs and buttons, but only the package movement handle starts a
drag. Give each item a stable, concise label that remains meaningful in selection, preview,
completion, cancellation, and rejection announcements.

`selectedItemIds` may contain items at unrelated depths. Unknown IDs reject. The component returns
selection in canonical preorder so host state is deterministic. Set `disabled` to retain rendering
and selection semantics while preventing movement.

## Containment and host policy

`canContainChildren(itemId)` declares a stable structural capability. It must return a boolean. An
item that already has children must be accepted; the package rejects an inconsistent controlled
tree rather than hiding descendants.

`canMove(plan)` is a synchronous, side-effect-free host policy invoked after package checks. It
returns only a boolean. Use it for domain relationships such as “only groups contain fields”; do
not mutate, persist, or report analytics from the preview callback. Revalidate the accepted plan in
`onMove` if host policy can change outside React state.

The package always rejects unknown destinations, invalid post-removal indexes, self/descendant
cycles, and destinations that cannot contain children before calling `onMove`.

## Selection and drag blocks

An ordinary item selection replaces the current selection. Control, Command, or Shift toggles an
item. If an ancestor and descendant are both selected, only the ancestor participates in movement.

Dragging an unselected item selects and moves only that item. Dragging a selected item moves the
normalized selected roots when they are siblings. The block follows canonical source order and is
committed atomically. If a selected set spans parents, the broader selection remains available for
host actions, but movement falls back to the active item with a specific announcement.

`resolveSortableItemSelectionChange`, `normalizeSortableItemSelectionRoots`, and
`resolveSortableItemDragBlock` expose the same framework-neutral planning behavior when the host
needs matching non-React actions.

## Move plans and application

Every accepted move has one shape:

```ts
type ItemMovePlan = {
  itemIds: readonly string[];
  sourceParentId: string;
  destinationParentId: string;
  destinationIndex: number;
};
```

The destination index is resolved against destination children after removing every moving item.
This makes same-parent reorder and cross-parent insertion use one deterministic contract.
`planSortableItemMove` returns planned, unchanged, or specifically rejected output without
mutation.

`applySortableItemMove` validates the accepted plan again and returns a new tree. A no-op preserves
the original tree identity, and unaffected arrays retain their references. The helper does not
update item values, selection, or history. Wrap it in the host's state/history transaction when
those concerns must move together.

## Pointer, touch, keyboard, and zoom

Pointer and long-press touch movement use an immutable drag-start measurement. One overlay and one
placeholder represent the complete selected sibling block. The placeholder converts captured
client geometry into workbench units using the active zoom; the portal overlay remains in client
pixels. Final completion uses the real final point and revalidates the current tree, previewed plan,
and host policy before calling `onMove` once.

For keyboard movement, focus the named item movement handle:

1. Press Enter or Space to start.
2. Press ArrowUp or ArrowDown to reorder.
3. Press logical forward to indent or logical backward to outdent. Logical forward is ArrowRight in
   left-to-right content and ArrowLeft in right-to-left content.
4. Press Enter or Space to commit the displayed preview, or Escape to cancel.

Focus returns to the active handle after completion or cancellation. Moving back to the original
position clears the preview and completes as a no-op.

While an item interaction owns movement, it excludes outer section dragging, root movement,
viewport panning, and competing auto-scroll. Ownership releases on completion, cancellation, tree
unmount, or workbench unmount. Inputs in `renderItem` retain native editing and local keyboard
shortcuts.

## Storing items in a section payload

The item tree is not a second field on `WorkspaceDocument`. If item state should round-trip with a
workspace, include the serializable tree and item values in that section's host payload. In a
controlled workspace, apply the item move by replacing that payload in the host document and pass
the resulting workspace through the same persistence path.

This composition also lets the host decide whether an item move shares package history, belongs to
a larger application history, or is persisted remotely. The package never mutates workspace state
merely because an item moved.

The initial milestone supports one tree per mounted component and movement within that tree.
Multiple named lists, cross-list or cross-section movement, filtered-list reconciliation, and
mixed-parent batch dragging are deferred.
