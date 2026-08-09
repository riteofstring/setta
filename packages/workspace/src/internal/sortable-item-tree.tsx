import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { sortableItemTreesMatch } from "./sortable-item-move-application.js";
import {
  resolveSortableItemDragBlock,
  resolveSortableItemSelectionChange,
} from "./sortable-item-selection.js";
import type {
  SortableItemDragBlock,
  SortableItemKeyboardCommand,
  SortableItemTree as SortableItemTreeModel,
} from "./sortable-item-tree-contract.js";
import {
  beginSortableItemHandleFocusRecovery,
  snapshotSortableItemClientRects,
  sortableItemEventClientY,
  sortableItemPointerTargetForEvent,
  sortableItemWritingDirection,
  type SortableItemClientRect,
  type SortableItemDomTargetIdentity,
} from "./sortable-item-tree-geometry.js";
import {
  resolveSortableItemTreeProps,
  type ResolvedSortableItemTreeProps,
  type SortableItemTreeProps,
} from "./sortable-item-tree-react-contract.js";
import {
  SortableItemDragOverlay as ItemDragOverlay,
  SortableItemRenderContext as ItemTreeRenderContext,
  SortableItemBranch,
  type SortableItemBounds as ItemBounds,
  type SortableItemDndIds as ItemDndIds,
  type SortableItemFeedback as ItemFeedback,
  type SortableItemRenderContextValue as ItemTreeRenderContextValue,
} from "./sortable-item-tree-rendering.js";
import {
  resolveSortableItemKeyboardPreview,
  resolveSortableItemPointerPreview,
  sortableItemMovePlansMatch,
  sortableItemMoveStillAllowed,
  type SortableItemPreview,
  type SortableItemPreviewResolution,
} from "./sortable-item-tree-session.js";
import {
  createSortableItemTreeIndex,
  type SortableItemTreeIndex,
} from "./sortable-item-tree-validation.js";
import {
  UpstreamDndBoundary,
  type AdapterDndCompletion,
  type AdapterDndEvent,
  type AdapterDndInput,
} from "./upstream-dnd-adapter.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_ROOT_DRAG_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import { useWorkspaceItemInteraction } from "./workspace-item-interaction-context.js";

type ItemSession = {
  activeItemId: string;
  block: SortableItemDragBlock;
  branchRects: ReadonlyMap<string, SortableItemClientRect>;
  direction: "ltr" | "rtl";
  input: AdapterDndInput;
  preview: SortableItemPreview | null;
  projectedTree: SortableItemTreeModel;
  rowRects: ReadonlyMap<string, SortableItemClientRect>;
  sourceBounds: ItemBounds;
  tree: SortableItemTreeModel;
  zoom: number;
};

type PreparedItemSession = Readonly<{
  activeItemId: string;
  block: SortableItemDragBlock;
  branchRects: ReadonlyMap<string, SortableItemClientRect>;
  rowRects: ReadonlyMap<string, SortableItemClientRect>;
  sourceBounds: ItemBounds;
}>;

const IDLE_FEEDBACK: ItemFeedback = {
  activeItemId: null,
  bounds: null,
  message: "",
  preview: null,
  status: "idle",
  targetId: null,
  zoom: 1,
};

function itemDndIds(prefix: string, index: SortableItemTreeIndex): ItemDndIds {
  const sourceByItem = new Map<string, string>();
  const sourceItemById = new Map<string, string>();
  const itemTargetByItem = new Map<string, string>();
  const parentTargetByParent = new Map<string, string>();
  const targetById = new Map<string, SortableItemDomTargetIdentity>();
  index.itemOrder.forEach((itemId, order) => {
    const sourceId = `${prefix}-source-${String(order)}`;
    const itemTargetId = `${prefix}-item-${String(order)}`;
    const parentTargetId = `${prefix}-parent-${String(order + 1)}`;
    sourceByItem.set(itemId, sourceId);
    sourceItemById.set(sourceId, itemId);
    itemTargetByItem.set(itemId, itemTargetId);
    parentTargetByParent.set(itemId, parentTargetId);
    targetById.set(itemTargetId, { itemId, type: "item" });
    targetById.set(parentTargetId, { parentId: itemId, type: "parent" });
  });
  const rootTargetId = `${prefix}-parent-0`;
  parentTargetByParent.set(index.rootId, rootTargetId);
  targetById.set(rootTargetId, { parentId: index.rootId, type: "parent" });
  return {
    itemTargetByItem,
    parentTargetByParent,
    sourceByItem,
    sourceItemById,
    targetById,
  };
}

function combinedItemBounds(
  itemIds: readonly string[],
  elements: ReadonlyMap<string, HTMLElement>,
): ItemBounds {
  const rects = itemIds.map((itemId) => elements.get(itemId)?.getBoundingClientRect());
  if (rects.some((rect) => !rect)) {
    throw new Error("Every moving sortable item must expose browser geometry.");
  }
  const measured = rects.filter((rect): rect is DOMRect => Boolean(rect));
  const left = Math.min(...measured.map((rect) => rect.left));
  const top = Math.min(...measured.map((rect) => rect.top));
  const right = Math.max(...measured.map((rect) => rect.right));
  const bottom = Math.max(...measured.map((rect) => rect.bottom));
  return { height: bottom - top, width: right - left, x: left, y: top };
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((itemId, index) => itemId === right[index]);
}

function keyboardCommand(
  direction: AdapterDndEvent["keyboardDirection"],
  writingDirection: "ltr" | "rtl",
): SortableItemKeyboardCommand | null {
  if (direction === "up" || direction === "down") {
    return direction === "up" ? "move-up" : "move-down";
  }
  if (direction === "left") {
    return writingDirection === "rtl" ? "indent" : "outdent";
  }
  if (direction === "right") {
    return writingDirection === "rtl" ? "outdent" : "indent";
  }
  return null;
}

function itemCountLabel(itemIds: readonly string[], firstLabel: string): string {
  return itemIds.length === 1 ? firstLabel : `${firstLabel} and ${String(itemIds.length - 1)} more`;
}

function movementLabel(
  session: Pick<ItemSession, "block">,
  props: ResolvedSortableItemTreeProps,
): string {
  const firstItemId = session.block.itemIds[0];
  if (!firstItemId) throw new Error("A sortable item session must contain one moving item.");
  return itemCountLabel(session.block.itemIds, props.getItemLabel(firstItemId));
}

function overlayLabel(
  feedback: ItemFeedback,
  session: ItemSession | null,
  props: ResolvedSortableItemTreeProps,
): string {
  const itemIds = session?.block.itemIds ?? [];
  const firstItemId = itemIds[0] ?? feedback.activeItemId;
  if (!firstItemId) return "Moving item";
  return itemCountLabel(
    itemIds.length > 0 ? itemIds : [firstItemId],
    props.getItemLabel(firstItemId),
  );
}

function preserveKeyboardPreview(
  session: ItemSession,
  resolution: Exclude<SortableItemPreviewResolution, { status: "planned" }>,
): boolean {
  if (resolution.status === "rejected" || !resolution.projectedTree) return true;
  session.projectedTree = resolution.projectedTree;
  return !sortableItemTreesMatch(resolution.projectedTree, session.tree);
}

function destinationLabel(
  preview: SortableItemPreview,
  props: ResolvedSortableItemTreeProps,
): string {
  return preview.destinationParentId === props.tree.rootId
    ? "the top level"
    : props.getItemLabel(preview.destinationParentId);
}

function moveCallbacks(
  props: ResolvedSortableItemTreeProps,
): Pick<ResolvedSortableItemTreeProps, "canContainChildren" | "canMove"> {
  return {
    ...(props.canContainChildren ? { canContainChildren: props.canContainChildren } : {}),
    ...(props.canMove ? { canMove: props.canMove } : {}),
  };
}

function previewMessage(
  session: ItemSession,
  preview: SortableItemPreview,
  props: ResolvedSortableItemTreeProps,
): string {
  return `Preview: ${movementLabel(session, props)} will move to ${destinationLabel(preview, props)}, position ${String(preview.destinationIndex + 1)}.`;
}

function completionMessage(
  session: ItemSession,
  preview: SortableItemPreview,
  props: ResolvedSortableItemTreeProps,
): string {
  return `${movementLabel(session, props)} moved to ${destinationLabel(preview, props)}, position ${String(preview.destinationIndex + 1)}.`;
}

function selectedTargetIds(
  index: SortableItemTreeIndex,
  movingItemIds: ReadonlySet<string>,
  dndIds: ItemDndIds,
): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const itemId of index.itemOrder) {
    let currentId: string | undefined = itemId;
    while (currentId && currentId !== index.rootId) {
      if (movingItemIds.has(currentId)) {
        const itemTarget = dndIds.itemTargetByItem.get(itemId);
        const parentTarget = dndIds.parentTargetByParent.get(itemId);
        if (itemTarget) blocked.add(itemTarget);
        if (parentTarget) blocked.add(parentTarget);
        break;
      }
      currentId = index.parentByItem.get(currentId);
    }
  }
  return blocked;
}

export function SortableItemTree(props: SortableItemTreeProps) {
  const resolved = resolveSortableItemTreeProps(props);
  const index = useMemo(() => createSortableItemTreeIndex(resolved.tree), [resolved.tree]);
  const reactId = useId().replaceAll(":", "");
  const treeId = `setta-sortable-item-tree-${reactId}`;
  const dndIds = useMemo(() => itemDndIds(treeId, index), [index, treeId]);
  const interaction = useWorkspaceItemInteraction(treeId);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemElementsRef = useRef(new Map<string, HTMLElement>());
  const branchElementsRef = useRef(new Map<string, HTMLElement>());
  const rowElementsRef = useRef(new Map<string, HTMLElement>());
  const sessionRef = useRef<ItemSession | null>(null);
  const preparedRef = useRef<PreparedItemSession | null>(null);
  const focusRecoveryCleanupRef = useRef<() => void>(() => undefined);
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;
  const propsRef = useRef(resolved);
  propsRef.current = resolved;
  const [feedback, setFeedback] = useState<ItemFeedback>(IDLE_FEEDBACK);
  const [announcement, setAnnouncement] = useState("");

  useEffect(
    () => () => {
      if (!sessionRef.current) return;
      sessionRef.current = null;
      preparedRef.current = null;
      interactionRef.current.finish("cancel");
    },
    [],
  );

  const registerElement = useCallback(
    (collection: Map<string, HTMLElement>, itemId: string, element: HTMLElement | null) => {
      if (element) collection.set(itemId, element);
      else collection.delete(itemId);
    },
    [],
  );
  const registerItem = useCallback(
    (itemId: string, element: HTMLElement | null) =>
      registerElement(itemElementsRef.current, itemId, element),
    [registerElement],
  );
  const registerBranch = useCallback(
    (parentId: string, element: HTMLElement | null) =>
      registerElement(branchElementsRef.current, parentId, element),
    [registerElement],
  );
  const registerRow = useCallback(
    (itemId: string, element: HTMLElement | null) =>
      registerElement(rowElementsRef.current, itemId, element),
    [registerElement],
  );

  const prepareSession = useCallback(
    (sourceId: string): PreparedItemSession => {
      const activeItemId = dndIds.sourceItemById.get(sourceId);
      if (!activeItemId) {
        throw new Error(`Unknown sortable item drag source ${JSON.stringify(sourceId)}.`);
      }
      const current = propsRef.current;
      const block = resolveSortableItemDragBlock(
        current.tree,
        current.selectedItemIds,
        activeItemId,
      );
      return {
        activeItemId,
        block,
        branchRects: snapshotSortableItemClientRects(branchElementsRef.current),
        rowRects: snapshotSortableItemClientRects(rowElementsRef.current),
        sourceBounds: combinedItemBounds(block.itemIds, itemElementsRef.current),
      };
    },
    [dndIds.sourceItemById],
  );

  const selectDragBlock = useCallback((prepared: Pick<PreparedItemSession, "block">) => {
    const current = propsRef.current;
    if (!arraysEqual(current.selectedItemIds, prepared.block.selectedItemIds)) {
      current.onSelectedItemIdsChange(prepared.block.selectedItemIds);
    }
  }, []);

  const handleStart = useCallback(
    (event: AdapterDndEvent) => {
      focusRecoveryCleanupRef.current();
      focusRecoveryCleanupRef.current = () => undefined;
      const prepared = preparedRef.current ?? prepareSession(event.sourceId);
      preparedRef.current = null;
      if (!interaction.start(event.input)) {
        setAnnouncement(
          "Item movement is unavailable while another workspace interaction is active.",
        );
        return;
      }
      selectDragBlock(prepared);
      const current = propsRef.current;
      const session: ItemSession = {
        ...prepared,
        direction: sortableItemWritingDirection(rootRef.current),
        input: event.input,
        preview: null,
        projectedTree: current.tree,
        tree: current.tree,
        zoom: interaction.zoom,
      };
      sessionRef.current = session;
      setFeedback({
        activeItemId: session.activeItemId,
        bounds: session.sourceBounds,
        message: prepared.block.fallbackReason ?? "Choose a destination.",
        preview: null,
        status: "active",
        targetId: null,
        zoom: session.zoom,
      });
      const instruction =
        event.input === "keyboard"
          ? " Use the arrow keys to move, Enter or Space to finish, or Escape to cancel."
          : "";
      setAnnouncement(
        `${prepared.block.fallbackReason ?? `${movementLabel(session, current)} movement started.`}${instruction}`,
      );
    },
    [interaction, prepareSession, selectDragBlock],
  );

  const updatePlannedFeedback = useCallback(
    (
      session: ItemSession,
      resolution: Extract<SortableItemPreviewResolution, { status: "planned" }>,
      targetId: string | null,
    ) => {
      session.preview = resolution.preview;
      session.projectedTree = resolution.preview.projectedTree;
      const message = previewMessage(session, resolution.preview, propsRef.current);
      setFeedback({
        activeItemId: session.activeItemId,
        bounds: session.sourceBounds,
        message,
        preview: resolution.preview,
        status: "planned",
        targetId,
        zoom: session.zoom,
      });
      setAnnouncement(message);
    },
    [],
  );

  const updateRejectedFeedback = useCallback(
    (
      session: ItemSession,
      resolution: Exclude<SortableItemPreviewResolution, { status: "planned" }>,
      targetId: string | null,
      preservePreview: boolean,
    ) => {
      const preview = preservePreview ? session.preview : null;
      if (!preservePreview) session.preview = null;
      setFeedback({
        activeItemId: session.activeItemId,
        bounds: session.sourceBounds,
        message: resolution.reason,
        preview,
        status: resolution.status === "rejected" ? "rejected" : "active",
        targetId,
        zoom: session.zoom,
      });
      setAnnouncement(resolution.reason);
    },
    [],
  );

  const handleMove = useCallback(
    (event: AdapterDndEvent) => {
      const session = sessionRef.current;
      if (!session) return;
      const current = propsRef.current;
      const command = keyboardCommand(event.keyboardDirection, session.direction);
      if (command) {
        const resolution = resolveSortableItemKeyboardPreview({
          activeItemId: session.activeItemId,
          block: session.block,
          ...moveCallbacks(current),
          command,
          originalTree: session.tree,
          projectedTree: session.projectedTree,
        });
        if (resolution.status === "planned") updatePlannedFeedback(session, resolution, null);
        else
          updateRejectedFeedback(
            session,
            resolution,
            null,
            preserveKeyboardPreview(session, resolution),
          );
        return;
      }
      if (event.input === "keyboard") return;
      const target = sortableItemPointerTargetForEvent(
        event,
        dndIds.targetById,
        session.rowRects,
        session.branchRects,
      );
      if (!target) {
        updateRejectedFeedback(
          session,
          { reason: "Choose a valid item destination.", status: "unchanged" },
          null,
          false,
        );
        return;
      }
      const resolution = resolveSortableItemPointerPreview({
        activeItemId: session.activeItemId,
        block: session.block,
        ...moveCallbacks(current),
        clientY: sortableItemEventClientY(event, target),
        target,
        tree: session.tree,
      });
      if (resolution.status === "planned")
        updatePlannedFeedback(session, resolution, event.targetId);
      else updateRejectedFeedback(session, resolution, event.targetId, false);
    },
    [dndIds, updatePlannedFeedback, updateRejectedFeedback],
  );

  const restoreHandleFocus = useCallback(
    (itemId: string) => {
      const document = rootRef.current?.ownerDocument;
      if (!document) return;
      focusRecoveryCleanupRef.current();
      focusRecoveryCleanupRef.current = beginSortableItemHandleFocusRecovery(
        document,
        treeId,
        itemId,
      );
    },
    [treeId],
  );

  const matchingCompletionPreview = useCallback(
    (completion: AdapterDndCompletion, session: ItemSession): SortableItemPreview | null => {
      if (completion.input === "keyboard") return session.preview;
      const target = sortableItemPointerTargetForEvent(
        completion,
        dndIds.targetById,
        session.rowRects,
        session.branchRects,
      );
      if (!target) return null;
      const current = propsRef.current;
      const resolution = resolveSortableItemPointerPreview({
        activeItemId: session.activeItemId,
        block: session.block,
        ...moveCallbacks(current),
        clientY: sortableItemEventClientY(completion, target),
        target,
        tree: session.tree,
      });
      return resolution.status === "planned" &&
        sortableItemMovePlansMatch(session.preview?.plan ?? null, resolution.preview.plan)
        ? resolution.preview
        : null;
    },
    [dndIds],
  );

  const handleComplete = useCallback(
    (completion: AdapterDndCompletion) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      preparedRef.current = null;
      setFeedback(IDLE_FEEDBACK);
      if (!session) return;
      const canceled = completion.canceled;
      interaction.finish(canceled ? "cancel" : "complete");
      restoreHandleFocus(session.activeItemId);
      const current = propsRef.current;
      const label = movementLabel(session, current);
      if (canceled) {
        setAnnouncement(`${label} movement canceled.`);
        return;
      }
      const preview = matchingCompletionPreview(completion, session);
      if (!preview) {
        setAnnouncement(
          completion.input === "keyboard"
            ? `${label} did not move.`
            : `${label} did not move because the final destination changed.`,
        );
        return;
      }
      if (!sortableItemTreesMatch(current.tree, session.tree)) {
        setAnnouncement(`${label} did not move because the item tree changed.`);
        return;
      }
      if (
        !sortableItemMoveStillAllowed({
          ...moveCallbacks(current),
          plan: preview.plan,
          tree: current.tree,
        })
      ) {
        setAnnouncement(`${label} did not move because the host rejected the final plan.`);
        return;
      }
      const message = completionMessage(session, preview, current);
      setAnnouncement(message);
      current.onMove(preview.plan);
    },
    [interaction, matchingCompletionPreview, restoreHandleFocus],
  );

  const handleSelection = useCallback(
    (itemId: string, event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const current = propsRef.current;
      const next = resolveSortableItemSelectionChange(
        current.tree,
        current.selectedItemIds,
        itemId,
        event.ctrlKey || event.metaKey || event.shiftKey ? "toggle" : "replace",
      );
      if (!arraysEqual(current.selectedItemIds, next)) current.onSelectedItemIdsChange(next);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (itemId: string, event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (event.button !== 0 || !event.isPrimary || event.pointerType === "touch") return;
      const current = propsRef.current;
      selectDragBlock({
        block: resolveSortableItemDragBlock(current.tree, current.selectedItemIds, itemId),
      });
    },
    [selectDragBlock],
  );

  const handleKeyDown = useCallback(
    (itemId: string, event: KeyboardEvent<HTMLButtonElement>) => {
      if (sessionRef.current && event.key.startsWith("Arrow")) {
        event.preventDefault();
        event.stopPropagation();
      }
      if ((event.key === "Enter" || event.key === " ") && !sessionRef.current) {
        const current = propsRef.current;
        selectDragBlock({
          block: resolveSortableItemDragBlock(current.tree, current.selectedItemIds, itemId),
        });
      }
    },
    [selectDragBlock],
  );

  const movingItemIds = useMemo(() => {
    if (!feedback.activeItemId) return new Set<string>();
    return new Set(sessionRef.current?.block.itemIds ?? [feedback.activeItemId]);
  }, [feedback.activeItemId]);
  const blockedTargetIds = useMemo(
    () => selectedTargetIds(index, movingItemIds, dndIds),
    [dndIds, index, movingItemIds],
  );
  const canContain = useCallback((itemId: string) => {
    const callback = propsRef.current.canContainChildren;
    if (!callback) return true;
    const result = callback(itemId);
    if (typeof result !== "boolean") {
      throw new TypeError("SortableItemTree canContainChildren must return a boolean.");
    }
    return result;
  }, []);
  const movementEnabled = !resolved.disabled && interaction.enabled;
  const renderContext = useMemo<ItemTreeRenderContextValue>(
    () => ({
      blockedTargetIds,
      canContain,
      dndIds,
      feedback,
      handleKeyDown,
      handlePointerDown,
      handleSelection,
      index,
      itemLabel: resolved.getItemLabel,
      movementEnabled,
      movingItemIds,
      registerBranch,
      registerItem,
      registerRow,
      renderItem: resolved.renderItem,
      selectedItemIds: new Set(resolved.selectedItemIds),
    }),
    [
      blockedTargetIds,
      canContain,
      dndIds,
      feedback,
      handleKeyDown,
      handlePointerDown,
      handleSelection,
      index,
      movementEnabled,
      movingItemIds,
      registerBranch,
      registerItem,
      registerRow,
      resolved.getItemLabel,
      resolved.renderItem,
      resolved.selectedItemIds,
    ],
  );
  const dragOverlayLabel = overlayLabel(feedback, sessionRef.current, resolved);

  return (
    <div
      aria-label={resolved.ariaLabel}
      className={`setta-workspace__sortable-item-tree setta-workspace__interaction-boundary ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_ROOT_DRAG_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-sortable-item-disabled={resolved.disabled ? "true" : "false"}
      data-sortable-item-interaction={feedback.status}
      data-sortable-item-tree=""
      data-workspace-local-shortcuts={feedback.status === "idle" ? undefined : ""}
      data-workspace-prevent-pan="true"
      data-workspace-prevent-wheel="true"
      id={treeId}
      ref={rootRef}
      role="group"
    >
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        role="status"
      >
        {announcement}
      </div>
      {feedback.message ? (
        <div
          aria-hidden="true"
          className="setta-workspace__sortable-item-feedback"
          data-status={feedback.status}
        >
          {feedback.message}
        </div>
      ) : null}
      <ItemTreeRenderContext.Provider value={renderContext}>
        <UpstreamDndBoundary
          manageAccessibility={false}
          manageAutoScroll={false}
          onComplete={handleComplete}
          onMove={handleMove}
          onStart={handleStart}
          renderOverlay={() => (
            <ItemDragOverlay
              count={movingItemIds.size}
              feedback={feedback}
              label={dragOverlayLabel}
            />
          )}
          resolveCollisionRect={(sourceId) => {
            const prepared = prepareSession(sourceId);
            preparedRef.current = prepared;
            return prepared.sourceBounds;
          }}
        >
          <SortableItemBranch depth={0} parentId={index.rootId} />
        </UpstreamDndBoundary>
      </ItemTreeRenderContext.Provider>
    </div>
  );
}
