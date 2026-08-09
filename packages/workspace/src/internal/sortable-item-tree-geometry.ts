import type { SortableItemPointerTarget } from "./sortable-item-tree-session.js";
import type { AdapterDndEvent } from "./upstream-dnd-adapter.js";

export type SortableItemDomTargetIdentity =
  Readonly<{ itemId: string; type: "item" }> | Readonly<{ parentId: string; type: "parent" }>;

export type SortableItemClientRect = Readonly<{
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}>;

export function snapshotSortableItemClientRects(
  elements: ReadonlyMap<string, HTMLElement>,
): ReadonlyMap<string, SortableItemClientRect> {
  return new Map(
    [...elements].map(([id, element]) => {
      const rect = element.getBoundingClientRect();
      return [
        id,
        {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        },
      ];
    }),
  );
}

function targetFromUpstream(
  targetId: string | null,
  targets: ReadonlyMap<string, SortableItemDomTargetIdentity>,
  rows: ReadonlyMap<string, SortableItemClientRect>,
): SortableItemPointerTarget | null {
  if (!targetId) return null;
  const identity = targets.get(targetId);
  if (!identity) return null;
  if (identity.type === "parent") return identity;
  const rect = rows.get(identity.itemId);
  if (!rect) return null;
  return { itemId: identity.itemId, rect: { height: rect.height, top: rect.top }, type: "item" };
}

function containsPoint(
  rect: SortableItemClientRect,
  point: Readonly<{ x: number; y: number }>,
): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function smallestContainingElement(
  rectangles: ReadonlyMap<string, SortableItemClientRect>,
  point: Readonly<{ x: number; y: number }>,
): Readonly<{ id: string; rect: SortableItemClientRect }> | null {
  const candidates = [...rectangles].flatMap(([id, rect]) => {
    return containsPoint(rect, point) ? [{ id, rect }] : [];
  });
  return (
    candidates.sort(
      (left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height,
    )[0] ?? null
  );
}

function targetFromGeometry(
  point: Readonly<{ x: number; y: number }>,
  rows: ReadonlyMap<string, SortableItemClientRect>,
  branches: ReadonlyMap<string, SortableItemClientRect>,
): SortableItemPointerTarget | null {
  const row = smallestContainingElement(rows, point);
  if (row) {
    return { itemId: row.id, rect: { height: row.rect.height, top: row.rect.top }, type: "item" };
  }
  const branch = smallestContainingElement(branches, point);
  return branch ? { parentId: branch.id, type: "parent" } : null;
}

export function sortableItemPointerTargetForEvent(
  event: AdapterDndEvent,
  targets: ReadonlyMap<string, SortableItemDomTargetIdentity>,
  rows: ReadonlyMap<string, SortableItemClientRect>,
  branches: ReadonlyMap<string, SortableItemClientRect>,
): SortableItemPointerTarget | null {
  return event.clientPoint
    ? targetFromGeometry(event.clientPoint, rows, branches)
    : targetFromUpstream(event.targetId, targets, rows);
}

export function sortableItemEventClientY(
  event: AdapterDndEvent,
  target: SortableItemPointerTarget,
): number {
  if (event.clientPoint) return event.clientPoint.y;
  if (event.activatorPoint) return event.activatorPoint.y + event.transform.y;
  return target.type === "item" ? target.rect.top + target.rect.height / 2 : 0;
}

export function sortableItemWritingDirection(element: HTMLElement | null): "ltr" | "rtl" {
  const view = element?.ownerDocument.defaultView;
  return element && view?.getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
}

export function findSortableItemHandle(tree: HTMLElement, itemId: string): HTMLElement | null {
  for (const item of tree.querySelectorAll<HTMLElement>("[data-sortable-item-id]")) {
    if (item.dataset.sortableItemId === itemId) {
      return item.querySelector<HTMLElement>(
        ":scope > .setta-workspace__sortable-item-row > .setta-workspace__sortable-item-handle",
      );
    }
  }
  return null;
}
