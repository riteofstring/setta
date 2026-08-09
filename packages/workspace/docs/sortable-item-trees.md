# Sortable item trees

`SortableItemTree` adds host-defined item reordering and nesting inside a section.
`SortableItemLists` extends the same interaction owner across multiple named lists in one section.
Both are fully controlled React surfaces: the package owns interaction, selection planning,
feedback, and move validation, while the host owns item values, canonical trees, persistence, and
history.

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

## Named-list contract

```ts
type SortableItemList = {
  label: string;
  listId: string;
  tree: SortableItemTree;
};
```

A list set is a non-empty dense array. Each `listId` is stable, non-empty, and unique; each visible
`label` is non-empty. Item IDs must be unique across the complete set because selection and focus
span the shared surface. Root IDs remain local to their list and may therefore repeat. Use
`validateSortableItemLists` when reading an unknown list set.

One `SortableItemLists` instance owns every list's pointer, touch, and keyboard movement boundary.
Do not render separate `SortableItemTree` instances and try to coordinate their private drag
sessions. The package uses collision-checked internal roots to aggregate interaction, then removes
those roots before calling the host.

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

For multiple named lists, keep one controlled list array and apply the list-aware plan atomically:

```tsx
import { applySortableItemListMove } from "@setta/workspace/core";
import { SortableItemLists } from "@setta/workspace/react";

<SortableItemLists
  ariaLabel="Profile field lists"
  lists={lists}
  selectedItemIds={selectedItemIds}
  onSelectedItemIdsChange={setSelectedItemIds}
  getItemLabel={(itemId) => fields[itemId].label}
  renderItem={(itemId) => <FieldEditor field={fields[itemId]} />}
  canContainChildren={(itemId, listId) => policyCanContain(itemId, listId)}
  canMove={(plan) => policyAllows(plan)}
  onMove={(plan) => setLists((current) => applySortableItemListMove(current, plan))}
/>;
```

The component renders each list as a native named region with a visible heading and one root list.
`getItemLabel`, `renderItem`, and `canContainChildren` also receive the item's current `listId`, so
host policy never has to infer ownership from an ID convention.

`ariaLabel`, `getItemLabel`, `renderItem`, `onMove`, and `onSelectedItemIdsChange` have distinct
jobs. The rendered row may contain inputs and buttons, but only the package movement handle starts a
drag. Give each item a stable, concise label that remains meaningful in selection, preview,
completion, cancellation, and rejection announcements.

`selectedItemIds` may contain items at unrelated depths. Unknown IDs reject. The component returns
selection in canonical preorder so host state is deterministic. Set `disabled` to retain rendering
and selection semantics while preventing movement. In a named-list surface, canonical order is
list order followed by each tree's preorder.

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
host actions, but movement falls back to the active item with a specific announcement. That same
fallback applies when selection spans named lists; one sibling block from one source list may still
move to any valid destination list.

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

Named-list movement adds explicit ownership to the plan:

```ts
type SortableItemListMovePlan = {
  itemIds: readonly string[];
  sourceListId: string;
  sourceParentId: string;
  destinationListId: string;
  destinationParentId: string;
  destinationIndex: number;
};
```

`planSortableItemListMove` exposes the matching framework-neutral planner.
`applySortableItemListMove` strictly revalidates the public plan, moves every selected root with its
complete descendant subtree, and returns one list array. Same-list and cross-list moves share the
post-removal destination-index contract. A no-op returns the original array; unaffected list
objects, trees, and child arrays keep their identities.

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
4. In `SortableItemLists`, press Page Up or Page Down to move the active block to the corresponding
   position in the previous or next named list. Horizontal movement stops at the current list root.
5. Press Enter or Space to commit the displayed preview, or Escape to cancel.

Focus returns to the active handle after completion or cancellation. Moving back to the original
position clears the preview and completes as a no-op.

While an item interaction owns movement, it excludes outer section dragging, root movement,
viewport panning, and competing auto-scroll. Ownership releases on completion, cancellation, tree
unmount, or workbench unmount. Inputs in `renderItem` retain native editing and local keyboard
shortcuts.

## Storing items in a section payload

The item tree or named-list array is not a second field on `WorkspaceDocument`. If item state should
round-trip with a workspace, include the serializable tree or list array and item values in that
section's host payload. In a controlled workspace, apply the item move by replacing that payload in
the host document and pass the resulting workspace through the same persistence path.

This composition also lets the host decide whether an item move shares package history, belongs to
a larger application history, or is persisted remotely. The package never mutates workspace state
merely because an item moved.

Named lists and cross-list movement are supported only within one mounted `SortableItemLists`
surface. Cross-section movement, filtered-list reconciliation against a larger canonical tree, and
mixed-parent batch dragging remain deferred.
