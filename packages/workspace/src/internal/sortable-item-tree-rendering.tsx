import {
  createContext,
  useCallback,
  useContext,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { SortableItemDomTargetIdentity } from "./sortable-item-tree-geometry.js";
import type { SortableItemPreview } from "./sortable-item-tree-session.js";
import type { SortableItemTreeIndex } from "./sortable-item-tree-validation.js";
import { useUpstreamDndDraggable, useUpstreamDndDroppable } from "./upstream-dnd-adapter.js";

export type SortableItemBounds = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type SortableItemFeedback = Readonly<{
  activeItemId: string | null;
  bounds: SortableItemBounds | null;
  message: string;
  preview: SortableItemPreview | null;
  status: "active" | "idle" | "planned" | "rejected";
  targetId: string | null;
  zoom: number;
}>;

export type SortableItemDndIds = Readonly<{
  itemTargetByItem: ReadonlyMap<string, string>;
  parentTargetByParent: ReadonlyMap<string, string>;
  sourceByItem: ReadonlyMap<string, string>;
  sourceItemById: ReadonlyMap<string, string>;
  targetById: ReadonlyMap<string, SortableItemDomTargetIdentity>;
}>;

export type SortableItemRenderContextValue = Readonly<{
  blockedTargetIds: ReadonlySet<string>;
  canContain(itemId: string): boolean;
  dndIds: SortableItemDndIds;
  feedback: SortableItemFeedback;
  handleKeyDown(itemId: string, event: KeyboardEvent<HTMLButtonElement>): void;
  handlePointerDown(itemId: string, event: PointerEvent<HTMLButtonElement>): void;
  handleSelection(
    itemId: string,
    event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>,
  ): void;
  index: SortableItemTreeIndex;
  itemLabel(itemId: string): string;
  movementEnabled: boolean;
  movingItemIds: ReadonlySet<string>;
  registerBranch(parentId: string, element: HTMLElement | null): void;
  registerItem(itemId: string, element: HTMLElement | null): void;
  registerRow(itemId: string, element: HTMLElement | null): void;
  renderItem(itemId: string): ReactNode;
  selectedItemIds: ReadonlySet<string>;
}>;

export const SortableItemRenderContext = createContext<SortableItemRenderContextValue | null>(null);

function useSortableItemRenderContext(): SortableItemRenderContextValue {
  const context = useContext(SortableItemRenderContext);
  if (!context) {
    throw new Error("Sortable item rows require their SortableItemTree boundary.");
  }
  return context;
}

function SelectionIcon({ selected }: Readonly<{ selected: boolean }>) {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" viewBox="0 0 20 20">
      <rect height="13" rx="3" width="13" x="3.5" y="3.5" />
      {selected ? <path d="m6.5 10 2.25 2.25 4.75-4.75" /> : null}
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" viewBox="0 0 20 20">
      <circle cx="7" cy="5" r="1" />
      <circle cx="13" cy="5" r="1" />
      <circle cx="7" cy="10" r="1" />
      <circle cx="13" cy="10" r="1" />
      <circle cx="7" cy="15" r="1" />
      <circle cx="13" cy="15" r="1" />
    </svg>
  );
}

function rowDropState(
  feedback: SortableItemFeedback,
  targetId: string,
): "rejected" | "target" | undefined {
  if (feedback.targetId !== targetId) return undefined;
  if (feedback.status === "rejected") return "rejected";
  return feedback.status === "planned" ? "target" : undefined;
}

function SortableItemRow({ depth, itemId }: Readonly<{ depth: number; itemId: string }>) {
  const context = useSortableItemRenderContext();
  const { registerItem, registerRow } = context;
  const sourceId = context.dndIds.sourceByItem.get(itemId);
  const targetId = context.dndIds.itemTargetByItem.get(itemId);
  if (!sourceId || !targetId) {
    throw new Error(`Sortable item ${JSON.stringify(itemId)} has no drag registration.`);
  }
  const draggable = useUpstreamDndDraggable({
    data: { itemId, kind: "sortable-item" },
    disabled: !context.movementEnabled,
    id: sourceId,
  });
  const droppable = useUpstreamDndDroppable({
    collisionPriority: 10,
    data: { itemId, kind: "sortable-item-row" },
    disabled: context.blockedTargetIds.has(targetId),
    id: targetId,
  });
  const setItemElement = useCallback(
    (element: HTMLElement | null) => {
      draggable.elementRef(element);
      registerItem(itemId, element);
    },
    [draggable, itemId, registerItem],
  );
  const setRowElement = useCallback(
    (element: HTMLElement | null) => {
      droppable.elementRef(element);
      registerRow(itemId, element);
    },
    [droppable, itemId, registerRow],
  );
  const selected = context.selectedItemIds.has(itemId);
  const moving = context.movingItemIds.has(itemId);
  const active = context.feedback.activeItemId === itemId;
  const dropState = rowDropState(context.feedback, targetId);
  return (
    <li
      data-sortable-item-depth={depth}
      data-sortable-item-id={itemId}
      data-sortable-item-moving={moving ? "true" : "false"}
      data-sortable-item-selected={selected ? "true" : "false"}
      ref={setItemElement}
    >
      <div
        className="setta-workspace__sortable-item-row"
        data-sortable-item-drop-state={dropState}
        ref={setRowElement}
      >
        <button
          aria-label={`${selected ? "Deselect" : "Select"} ${context.itemLabel(itemId)}`}
          aria-pressed={selected}
          className="setta-workspace__sortable-item-select"
          onClick={(event) => {
            if (event.detail === 0) context.handleSelection(itemId, event);
            else event.stopPropagation();
          }}
          onPointerDown={(event) => context.handleSelection(itemId, event)}
          type="button"
        >
          <SelectionIcon selected={selected} />
        </button>
        <div className="setta-workspace__sortable-item-content">{context.renderItem(itemId)}</div>
        <button
          aria-describedby={`${sourceId}-description`}
          aria-grabbed={active}
          aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Escape"
          aria-label={`Move ${context.itemLabel(itemId)}`}
          aria-roledescription="draggable"
          className="setta-workspace__sortable-item-handle"
          disabled={!context.movementEnabled}
          onKeyDown={(event) => context.handleKeyDown(itemId, event)}
          onPointerDown={(event) => context.handlePointerDown(itemId, event)}
          ref={draggable.handleRef}
          type="button"
        >
          <MoveIcon />
        </button>
        <span className="setta-workspace__visually-hidden" id={`${sourceId}-description`}>
          Press Enter or Space to start. Use Up and Down to reorder, logical forward to indent,
          logical backward to outdent, Enter or Space to finish, or Escape to cancel.
        </span>
        {dropState === "rejected" ? (
          <span aria-hidden="true" className="setta-workspace__sortable-item-unavailable">
            Move unavailable
          </span>
        ) : null}
      </div>
      {context.canContain(itemId) ? (
        <SortableItemBranch depth={depth + 1} parentId={itemId} />
      ) : null}
    </li>
  );
}

function rawPlaceholderIndex(
  children: readonly string[],
  movingItemIds: ReadonlySet<string>,
  destinationIndex: number,
): number {
  const remaining = children.filter((itemId) => !movingItemIds.has(itemId));
  const anchorId = remaining[destinationIndex];
  return anchorId === undefined ? children.length : children.indexOf(anchorId);
}

function SortableItemPlaceholder({
  count,
  height,
  index,
  parentId,
}: Readonly<{ count: number; height: number; index: number; parentId: string }>) {
  return (
    <li
      aria-hidden="true"
      className="setta-workspace__sortable-item-placeholder"
      data-sortable-item-placeholder=""
      data-sortable-item-placeholder-count={count}
      data-sortable-item-destination-index={index}
      data-sortable-item-destination-parent={parentId}
      style={
        { "--setta-workspace-item-placeholder-height": `${String(height)}px` } as CSSProperties
      }
    >
      {count === 1 ? "Place item here" : `Place ${String(count)} items here`}
    </li>
  );
}

function branchPlaceholderIndex(
  context: SortableItemRenderContextValue,
  children: readonly string[],
  parentId: string,
): number {
  const preview = context.feedback.preview;
  if (preview?.destinationParentId !== parentId) return -1;
  return rawPlaceholderIndex(children, context.movingItemIds, preview.destinationIndex);
}

function branchLabel(context: SortableItemRenderContextValue, parentId: string): string {
  return parentId === context.index.rootId
    ? "Top-level items"
    : `${context.itemLabel(parentId)} child items`;
}

function EmptySortableItemBranch({
  depth,
  visible,
}: Readonly<{ depth: number; visible: boolean }>) {
  if (!visible) return null;
  return (
    <li className="setta-workspace__sortable-item-empty">
      {depth === 0 ? "No items" : "Drop items here"}
    </li>
  );
}

function renderBranchRows(
  context: SortableItemRenderContextValue,
  children: readonly string[],
  depth: number,
  parentId: string,
  placeholderIndex: number,
  placeholderHeight: number,
): ReactNode[] {
  const rows: ReactNode[] = [];
  const destinationIndex = context.feedback.preview?.destinationIndex ?? 0;
  for (const [index, itemId] of children.entries()) {
    if (placeholderIndex === index) {
      rows.push(
        <SortableItemPlaceholder
          count={context.movingItemIds.size}
          height={placeholderHeight}
          index={destinationIndex}
          key={`${parentId}-placeholder`}
          parentId={parentId}
        />,
      );
    }
    rows.push(<SortableItemRow depth={depth} itemId={itemId} key={itemId} />);
  }
  if (placeholderIndex === children.length) {
    rows.push(
      <SortableItemPlaceholder
        count={context.movingItemIds.size}
        height={placeholderHeight}
        index={destinationIndex}
        key={`${parentId}-placeholder`}
        parentId={parentId}
      />,
    );
  }
  return rows;
}

export function SortableItemBranch({
  depth,
  parentId,
}: Readonly<{ depth: number; parentId: string }>) {
  const context = useSortableItemRenderContext();
  const { registerBranch } = context;
  const targetId = context.dndIds.parentTargetByParent.get(parentId);
  if (!targetId) {
    throw new Error(`Sortable item parent ${JSON.stringify(parentId)} has no drop registration.`);
  }
  const droppable = useUpstreamDndDroppable({
    collisionPriority: 1,
    data: { kind: "sortable-item-parent", parentId },
    disabled: context.blockedTargetIds.has(targetId),
    id: targetId,
  });
  const setBranchElement = useCallback(
    (element: HTMLElement | null) => {
      droppable.elementRef(element);
      registerBranch(parentId, element);
    },
    [droppable, parentId, registerBranch],
  );
  const children = context.index.childrenByParent.get(parentId) ?? [];
  const placeholderIndex = branchPlaceholderIndex(context, children, parentId);
  const placeholderHeight = (context.feedback.bounds?.height ?? 40) / context.feedback.zoom;
  const dropState = context.feedback.targetId === targetId ? context.feedback.status : undefined;
  return (
    <ul
      aria-label={branchLabel(context, parentId)}
      className="setta-workspace__sortable-item-list"
      data-sortable-item-drop-state={dropState}
      data-sortable-item-parent-id={parentId}
      ref={setBranchElement}
    >
      <EmptySortableItemBranch
        depth={depth}
        visible={children.length === 0 && placeholderIndex < 0}
      />
      {renderBranchRows(context, children, depth, parentId, placeholderIndex, placeholderHeight)}
    </ul>
  );
}

export function SortableItemDragOverlay({
  count,
  feedback,
  label,
}: Readonly<{ count: number; feedback: SortableItemFeedback; label: string }>) {
  const bounds = feedback.bounds;
  if (!bounds) return null;
  return (
    <div
      aria-hidden="true"
      className="setta-workspace__sortable-item-overlay"
      data-sortable-item-overlay=""
      data-sortable-item-overlay-count={count}
      style={{ blockSize: bounds.height, inlineSize: bounds.width }}
    >
      <span>{label}</span>
    </div>
  );
}
