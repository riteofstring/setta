import _ from "lodash";
import { TbGripVertical } from "react-icons/tb";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../interaction.js";
import React, {
  useCallback,
  useId,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useReactFlow } from "../canvas/store.js";
import { openWorkspaceItemMenu } from "../context-menu/workspaceMenuInvocation.js";
import {
  getOwnerKeyboardMenuPoint,
  isWorkspaceMenuKeyboardEvent,
  shouldRetainNativeContextMenu,
} from "../context-menu/workspaceMenuOwnership.js";
import { useSortable } from "../dnd/adapter/index.js";
import {
  applyZoomToTransform,
  transformToString,
} from "../dnd/adapter/zoom.js";
import {
  getItemDndId,
  isTempItem,
  useItemDndState,
} from "../dnd/itemDndState.js";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "../document/documentSelectors.js";
import { hasWorkspaceItemPresentation } from "../document/itemPresentation.js";
import { toggleItemSelected } from "../document/itemSelection.js";
import { useItemSelectionMode } from "../document/itemSelectionMode.js";
import { getItemOrThrow } from "../document/itemTree.js";
import { useWorkspaceItemRevealTarget } from "../navigator/workspaceItemReveal.js";
import {
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores.js";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors.js";
import {
  getWorkspaceTooltipHandlers,
  type WorkspaceTooltipPage,
} from "../tooltip/WorkspaceTooltip.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { BuiltInItemRowContent } from "./BuiltInItemRowContent.js";
import { ItemColumnResizeHandle } from "./ItemColumnResizeHandle.js";
import {
  useItemDndChildrenForParent,
  useItemListContext,
  type ItemRowRenderContext,
} from "./ItemListContext.js";
import {
  getWorkspaceItemDiagnosticTooltipContent,
  WorkspaceItemDiagnostics,
} from "./WorkspaceItemDiagnostics.js";
import {
  getHighestWorkspaceItemDiagnosticSeverity,
  getWorkspaceItemDiagnosticCountSummary,
  getWorkspaceItemDiagnosticLabel,
  getWorkspaceItemDiagnosticRowClassName,
  type WorkspaceItemDiagnosticSeverity,
} from "./itemDiagnostics.js";

const ITEM_COLUMN_WIDTH = "var(--param-column-width, 200px)";

const NESTED_CHILD_ROWS_CLASS_NAME =
  "section-args-nested section-key-value relative grid min-w-0 gap-y-1 before:absolute before:bottom-0 before:start-0 before:h-[calc(100%_-_0.1rem)] before:w-[0.4rem] before:rounded-full before:bg-setta-200/20 before:content-[''] dark:before:bg-setta-400/20";

type ItemRowProps = {
  itemId: string;
  isTopLevelWithPad?: boolean;
};

type ItemRowLayout = "leaf" | "nested-root" | "nested-child";

function _ItemRow(props: ItemRowProps) {
  if (isTempItem(props.itemId)) {
    return <TempItemRow itemId={props.itemId} />;
  }
  return <RealItemRow {...props} />;
}

export const ItemRow = React.memo(_ItemRow, _.isEqual);

function omitRoleAttribute(attributes: Record<string, unknown>) {
  if (!("role" in attributes)) {
    return attributes;
  }
  const nextAttributes = { ...attributes };
  delete nextAttributes.role;
  return nextAttributes;
}

function normalizePlaceholderDimension(value: number | null, zoom: number) {
  if (value === null) {
    return undefined;
  }
  const safeZoom = zoom > 0 ? zoom : 1;
  return value / safeZoom;
}

function useTempItemPlaceholderStyle() {
  const { placeholderWidth, placeholderHeight } = useItemDndState(
    (state) => ({
      placeholderWidth: state.placeholderWidth,
      placeholderHeight: state.placeholderHeight,
    }),
    _.isEqual,
  );
  const zoom = useReactFlow((state) => state.transform[2]);

  return {
    height: normalizePlaceholderDimension(placeholderHeight, zoom),
    width: normalizePlaceholderDimension(placeholderWidth, zoom),
  };
}

function createSortableStyle(
  host: WorkspaceHost,
  {
    transform,
    transition,
    isDragging,
    height,
    width,
  }: {
    transform: ReturnType<typeof useSortable>["transform"];
    transition: ReturnType<typeof useSortable>["transition"];
    isDragging: boolean;
    height?: number;
    width?: number;
  },
): CSSProperties {
  return {
    transform: transformToString(applyZoomToTransform(host, transform)),
    transition,
    zIndex: isDragging ? 1000 : undefined,
    height,
    width,
  };
}

function TempItemRow({ itemId }: { itemId: string }) {
  const host = useWorkspaceHost();
  const { enabled, sectionId, listKey } = useItemListContext();
  const { height, width } = useTempItemPlaceholderStyle();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemId,
    disabled: !enabled,
    data: {
      type: "item",
      itemId: null,
      sectionId,
      listKey,
      isTopLevel: false,
      hasNested: false,
      onlyChildId: null,
    },
  });
  const dndStyle = createSortableStyle(host, {
    transform,
    transition,
    isDragging,
    height,
    width,
  });

  return (
    <div
      className="section-args-nested-key-value section-key-value section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm bg-blue-500/40 px-[2px] dark:bg-blue-600/40"
      style={{
        gridTemplateColumns: `minmax(min-content, ${ITEM_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
        ...dndStyle,
      }}
      data-item-row="true"
      ref={setNodeRef}
      {...omitRoleAttribute(attributes)}
      {...(listeners ?? {})}
    />
  );
}

function resolveItemSelectionClass(hasSectionStyleTheme: boolean) {
  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";

  return `motion-safe:transition-colors rounded-sm ${selectedBgClassName}`;
}

function resolveItemBackgroundClass({
  hasSectionStyleTheme,
  isSelected,
}: {
  hasSectionStyleTheme: boolean;
  isSelected: boolean;
}) {
  if (!isSelected) {
    return "motion-safe:transition-colors rounded-sm";
  }

  return resolveItemSelectionClass(hasSectionStyleTheme);
}

function getItemHoverClassName(hasSectionStyleTheme: boolean) {
  return hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
}

function resolveItemRowLayout({
  hasChildRows,
  isGroup,
}: {
  hasChildRows: boolean;
  isGroup: boolean;
}): ItemRowLayout {
  if (isGroup) {
    return "nested-child";
  }
  return hasChildRows ? "nested-root" : "leaf";
}

type ItemRowStyleProps = {
  bg: string;
  hoverClassName: string;
  dndClassName: string;
  dndStyle: CSSProperties;
  hasDiagnostics: boolean;
};

function buildItemRowStyle(
  dndStyle: CSSProperties,
  hasDiagnostics: boolean,
): CSSProperties {
  return {
    ...dndStyle,
    paddingInlineEnd: hasDiagnostics ? "1.375rem" : undefined,
  };
}

function buildLeafRowProps({
  bg,
  hoverClassName,
  dndClassName,
  dndStyle,
  hasDiagnostics,
}: ItemRowStyleProps) {
  return {
    rowClassName: `section-key-value group/arg-group section-min-rows relative grid min-w-0 items-center rounded-sm px-[2px] ${hoverClassName} ${bg} ${dndClassName}`,
    rowStyle: {
      gridTemplateColumns: `minmax(min-content, ${ITEM_COLUMN_WIDTH}) 0.75rem minmax(0, 1fr)`,
      gridTemplateAreas: `"key center-gutter value"`,
      ...buildItemRowStyle(dndStyle, hasDiagnostics),
    },
  };
}

function buildNestedRootRowProps({
  bg,
  hoverClassName,
  dndClassName,
  dndStyle,
  hasDiagnostics,
}: ItemRowStyleProps) {
  return {
    rowClassName: `section-args-nested-key-value section-key-value group/arg-group section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px] ${hoverClassName} ${bg} ${dndClassName}`,
    rowStyle: {
      gridTemplateColumns: `minmax(min-content, ${ITEM_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
      ...buildItemRowStyle(dndStyle, hasDiagnostics),
    },
  };
}

function buildNestedChildRowProps({
  bg,
  hoverClassName,
  dndClassName,
  dndStyle,
  hasDiagnostics,
  isTopLevelWithPad,
}: ItemRowStyleProps & { isTopLevelWithPad: boolean }) {
  return {
    rowClassName: `section-args-nested section-lg-value group/arg-group section-min-rows [&>p]:section-key-value relative grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm ${hoverClassName} ${bg} ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""} ${dndClassName}`,
    rowStyle: {
      gridTemplateColumns: `[c1] 0.75rem [c2] minmax(min-content, ${ITEM_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
      ...buildItemRowStyle(dndStyle, hasDiagnostics),
    },
  };
}

function buildItemRowProps(
  layout: ItemRowLayout,
  styleProps: ItemRowStyleProps,
  isTopLevelWithPad: boolean,
) {
  if (layout === "leaf") {
    return buildLeafRowProps(styleProps);
  }
  if (layout === "nested-root") {
    return buildNestedRootRowProps(styleProps);
  }
  return buildNestedChildRowProps({ ...styleProps, isTopLevelWithPad });
}

function useItemSelectionHandlers(sectionId: string, itemId: string) {
  const host = useWorkspaceHost();
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectingItems) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
    },
    [isSelectingItems],
  );
  const handleItemClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectingItems) {
        return;
      }
      e.stopPropagation();
      toggleItemSelected(host, sectionId, itemId);
    },
    [host, isSelectingItems, sectionId, itemId],
  );

  const handleItemKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isSelectingItems || e.target !== e.currentTarget) {
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      toggleItemSelected(host, sectionId, itemId);
    },
    [host, isSelectingItems, sectionId, itemId],
  );

  return {
    handleItemClick,
    handleItemMouseDown,
    handleItemKeyDown,
    isSelectingItems,
  };
}

function ItemNestedChildren({
  renderChildren,
}: {
  renderChildren: Array<string>;
}) {
  if (renderChildren.length === 0) {
    return null;
  }
  return (
    <div className={NESTED_CHILD_ROWS_CLASS_NAME}>
      {renderChildren.map((childId) => (
        <ItemRow key={childId} itemId={childId} />
      ))}
    </div>
  );
}

function renderItemRowContent(
  context: ItemRowRenderContext,
  renderItem: ((context: ItemRowRenderContext) => ReactNode) | undefined,
) {
  if (hasWorkspaceItemPresentation(context.item)) {
    return <BuiltInItemRowContent context={context} />;
  }
  if (!renderItem) {
    throw new Error(
      `Custom item ${context.sectionId}/${context.item.id} requires a registered row renderer.`,
    );
  }
  return renderItem(context);
}

function getItemDiagnosticSummary(
  diagnostics: Parameters<typeof getHighestWorkspaceItemDiagnosticSeverity>[0],
): string | null {
  if (diagnostics.length === 0) {
    return null;
  }
  return getWorkspaceItemDiagnosticCountSummary(diagnostics);
}

type ItemQuickInfo = {
  accessibleDescription: string;
  pages: [WorkspaceTooltipPage, ...Array<WorkspaceTooltipPage>];
};

function getItemQuickInfo(
  item: Parameters<typeof getWorkspaceItemDiagnosticLabel>[0],
  diagnostics: Parameters<typeof getHighestWorkspaceItemDiagnosticSeverity>[0],
): ItemQuickInfo | null {
  const helpText = hasWorkspaceItemPresentation(item)
    ? item.presentation.helpText?.trim()
    : null;
  const diagnosticContent =
    getWorkspaceItemDiagnosticTooltipContent(diagnostics);
  const content = diagnosticContent || helpText || "";
  if (content === "") {
    return null;
  }
  const title = getWorkspaceItemDiagnosticLabel(item);
  const tone =
    getHighestWorkspaceItemDiagnosticSeverity(diagnostics) ?? "default";
  const pages: [WorkspaceTooltipPage, ...Array<WorkspaceTooltipPage>] = [
    { content, title, tone },
  ];
  if (diagnosticContent && helpText) {
    pages.push({ content: helpText, title });
  }
  return {
    accessibleDescription: `${title}: ${[diagnosticContent, helpText]
      .filter((value): value is string => Boolean(value))
      .join(" ")}`,
    pages,
  };
}

function RealItemRow({ itemId, isTopLevelWithPad = false }: ItemRowProps) {
  const host = useWorkspaceHost();
  const {
    enabled,
    sectionId,
    listKey,
    visibleItemIds,
    itemDiagnostics,
    renderItem,
    isGroupItem,
  } = useItemListContext();
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  const rowState = useWorkspaceDocument((x) => {
    const itemTree = getSectionItemTreeOrThrow(x, sectionId);
    const styleColor = getSectionOrThrow(x, sectionId).styleColor;
    return {
      item: getItemOrThrow(itemTree, itemId),
      isSelected: itemTree.selectedItemIds.includes(itemId),
      styleColor,
    };
  }, _.isEqual);

  const hasSectionStyleTheme = Boolean(
    rowState.styleColor &&
    deriveSectionStyleTheme(rowState.styleColor, darkMode),
  );
  const {
    handleItemClick,
    handleItemMouseDown,
    handleItemKeyDown,
    isSelectingItems,
  } = useItemSelectionHandlers(sectionId, itemId);
  const visibleChildren = rowState.item.children.filter((childId) =>
    visibleItemIds.has(childId),
  );
  const renderChildren = useItemDndChildrenForParent(itemId, visibleChildren);
  const dndId = getItemDndId(itemId, listKey);
  const hasNested = rowState.item.children.length > 0;
  const onlyChildId =
    rowState.item.children.length === 1 ? rowState.item.children[0] : null;
  const diagnostics = itemDiagnostics[itemId] ?? [];
  const highestDiagnosticSeverity =
    getHighestWorkspaceItemDiagnosticSeverity(diagnostics);
  const diagnosticSummary = getItemDiagnosticSummary(diagnostics);
  const quickInfo = getItemQuickInfo(rowState.item, diagnostics);
  const quickInfoDescriptionId = `setta-item-quick-info-${useId().replaceAll(":", "")}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dndId,
    disabled: !enabled,
    data: {
      type: "item",
      itemId,
      sectionId,
      listKey,
      isTopLevel: false,
      hasNested,
      onlyChildId,
    },
  });
  const renderContext = {
    sectionId,
    listKey,
    item: rowState.item,
    isSelected: rowState.isSelected,
  };
  const layout = resolveItemRowLayout({
    hasChildRows: renderChildren.length > 0,
    isGroup: hasWorkspaceItemPresentation(rowState.item)
      ? rowState.item.presentation.control.kind === "group"
      : isGroupItem(rowState.item),
  });
  const { rowClassName, rowStyle } = buildItemRowProps(
    layout,
    {
      bg: `${resolveItemBackgroundClass({
        hasSectionStyleTheme: hasSectionStyleTheme,
        isSelected: rowState.isSelected,
      })} ${getWorkspaceItemDiagnosticRowClassName(highestDiagnosticSeverity)}`,
      hoverClassName: getItemHoverClassName(hasSectionStyleTheme),
      dndClassName: isDragging ? "opacity-80" : "",
      dndStyle: createSortableStyle(host, {
        transform,
        transition,
        isDragging,
      }),
      hasDiagnostics: diagnostics.length > 0,
    },
    isTopLevelWithPad,
  );

  return (
    <ItemRowShell
      rowClassName={rowClassName}
      rowStyle={rowStyle}
      dndAttributes={omitRoleAttribute(attributes)}
      dndListeners={listeners ?? {}}
      dndRef={setNodeRef}
      onClick={handleItemClick}
      onMouseDown={handleItemMouseDown}
      onKeyDown={handleItemKeyDown}
      sectionId={sectionId}
      isSelectingItems={isSelectingItems}
      isSelected={rowState.isSelected}
      itemId={itemId}
      diagnosticSeverity={highestDiagnosticSeverity}
      diagnosticSummary={diagnosticSummary}
      quickInfo={quickInfo}
      quickInfoDescriptionId={quickInfoDescriptionId}
    >
      {renderItemRowContent(renderContext, renderItem)}
      <ItemDragHandle item={rowState.item} />
      <ItemColumnResizeHandle />
      <WorkspaceItemDiagnostics diagnostics={diagnostics} />
      {layout !== "leaf" && (
        <ItemNestedChildren renderChildren={renderChildren} />
      )}
    </ItemRowShell>
  );
}

function ItemDragHandle({ item }: { item: ItemRowRenderContext["item"] }) {
  const { enabled } = useItemListContext();
  return enabled ? (
    <button
      type="button"
      className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} absolute -start-4 top-0 flex h-6 w-4 touch-none cursor-grab items-center justify-center rounded text-setta-400 hover:text-setta-600 focus-visible:outline dark:hover:text-setta-200`}
      aria-label={`Drag ${item.presentation?.label || item.id}`}
      title="Drag to reorder or nest this parameter"
      data-workspace-item-drag-handle="true"
    >
      <TbGripVertical aria-hidden="true" />
    </button>
  ) : null;
}

function getItemQuickInfoHandlers(
  host: WorkspaceHost,
  quickInfo: ItemQuickInfo | null,
) {
  if (!quickInfo) {
    return {};
  }
  const [firstPage, ...additionalPages] = quickInfo.pages;
  return getWorkspaceTooltipHandlers(
    host,
    { ...firstPage, stageOnFocus: true },
    ...additionalPages,
  );
}

function getItemRowShortcuts(
  quickInfo: ItemQuickInfo | null,
  isSelectingItems: boolean,
): string {
  const shortcuts = ["Shift+F10 ContextMenu"];
  if (quickInfo) {
    shortcuts.unshift("Q");
  }
  if (isSelectingItems) {
    shortcuts.unshift("Enter Space");
  }
  return shortcuts.join(" ");
}

function getSelectableItemLabel({
  diagnosticSummary,
  isSelected,
  isSelectingItems,
  itemId,
}: {
  diagnosticSummary: string | null;
  isSelected: boolean;
  isSelectingItems: boolean;
  itemId: string;
}): string | undefined {
  if (!isSelectingItems) {
    return undefined;
  }
  const selectionLabel = isSelected ? "selected" : "not selected";
  const diagnosticLabel = diagnosticSummary ? `, ${diagnosticSummary}` : "";
  return `Selectable item ${itemId}, ${selectionLabel}${diagnosticLabel}`;
}

function getQuickInfoDescriptionId(
  quickInfo: ItemQuickInfo | null,
  isSelectingItems: boolean,
  quickInfoDescriptionId: string,
): string | undefined {
  if (!quickInfo || !isSelectingItems) {
    return undefined;
  }
  return quickInfoDescriptionId;
}

function getItemRowAccessibilityProps({
  diagnosticSummary,
  isSelected,
  isSelectingItems,
  itemId,
  quickInfo,
  quickInfoDescriptionId,
}: {
  diagnosticSummary: string | null;
  isSelected: boolean;
  isSelectingItems: boolean;
  itemId: string;
  quickInfo: ItemQuickInfo | null;
  quickInfoDescriptionId: string;
}): React.HTMLAttributes<HTMLDivElement> {
  return {
    "aria-describedby": getQuickInfoDescriptionId(
      quickInfo,
      isSelectingItems,
      quickInfoDescriptionId,
    ),
    "aria-keyshortcuts": getItemRowShortcuts(quickInfo, isSelectingItems),
    "aria-label": getSelectableItemLabel({
      diagnosticSummary,
      isSelected,
      isSelectingItems,
      itemId,
    }),
    role: isSelectingItems ? "group" : undefined,
    tabIndex: isSelectingItems ? 0 : -1,
  };
}

function ItemQuickInfoDescription({
  descriptionId,
  quickInfo,
}: {
  descriptionId: string;
  quickInfo: ItemQuickInfo | null;
}) {
  if (!quickInfo) {
    return null;
  }
  return (
    <span
      className="sr-only"
      data-setta-workspace-item-quick-info-description="true"
      id={descriptionId}
    >
      {quickInfo.accessibleDescription}
    </span>
  );
}

function ItemRowShell({
  rowClassName,
  rowStyle,
  dndAttributes,
  dndListeners,
  dndRef,
  onClick,
  onMouseDown,
  onKeyDown,
  sectionId,
  isSelectingItems,
  isSelected,
  itemId,
  diagnosticSeverity,
  diagnosticSummary,
  quickInfo,
  quickInfoDescriptionId,
  children,
}: {
  rowClassName: string;
  rowStyle: CSSProperties;
  dndAttributes: Record<string, unknown>;
  dndListeners: Record<string, unknown>;
  dndRef: (element: HTMLDivElement | null) => void;
  onClick: React.MouseEventHandler;
  onMouseDown: React.MouseEventHandler;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  sectionId: string;
  isSelectingItems: boolean;
  isSelected: boolean;
  itemId: string;
  diagnosticSeverity: WorkspaceItemDiagnosticSeverity | null;
  diagnosticSummary: string | null;
  quickInfo: ItemQuickInfo | null;
  quickInfoDescriptionId: string;
  children: ReactNode;
}) {
  const host = useWorkspaceHost();
  const setRevealTarget = useWorkspaceItemRevealTarget(sectionId, itemId);
  const quickInfoHandlers = getItemQuickInfoHandlers(host, quickInfo);
  const accessibilityProps = getItemRowAccessibilityProps({
    diagnosticSummary,
    isSelected,
    isSelectingItems,
    itemId,
    quickInfo,
    quickInfoDescriptionId,
  });
  const interactionHandlers: React.HTMLAttributes<HTMLDivElement> = {
    onClick,
    onContextMenu: handleContextMenu,
    onKeyDown: handleKeyDown,
    onMouseDownCapture: onMouseDown,
  };
  const setItemRowRef = useCallback(
    (element: HTMLDivElement | null) => {
      dndRef(element);
      setRevealTarget(element);
    },
    [dndRef, setRevealTarget],
  );
  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
    if (shouldRetainNativeContextMenu(event.target, event.currentTarget)) {
      event.stopPropagation();
      return;
    }
    if (
      !openWorkspaceItemMenu(
        host,
        sectionId,
        itemId,
        { x: event.clientX, y: event.clientY },
        event.currentTarget,
      )
    ) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (
      event.target === event.currentTarget &&
      isWorkspaceMenuKeyboardEvent(event.nativeEvent) &&
      openWorkspaceItemMenu(
        host,
        sectionId,
        itemId,
        getOwnerKeyboardMenuPoint(event.currentTarget),
        event.currentTarget,
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onKeyDown(event);
  }

  return (
    <div
      className={`${rowClassName} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2`}
      style={rowStyle}
      data-item-row="true"
      data-setta-workspace-item-diagnostic-severity={
        diagnosticSeverity ?? undefined
      }
      data-workspace-item-id={itemId}
      {...interactionHandlers}
      ref={setItemRowRef}
      {...(dndAttributes as React.HTMLAttributes<HTMLDivElement>)}
      {...(dndListeners as React.HTMLAttributes<HTMLDivElement>)}
      {...quickInfoHandlers}
      aria-describedby={accessibilityProps["aria-describedby"]}
      aria-keyshortcuts={accessibilityProps["aria-keyshortcuts"]}
      aria-label={accessibilityProps["aria-label"]}
      role={accessibilityProps.role}
      tabIndex={accessibilityProps.tabIndex}
    >
      {children}
      <ItemQuickInfoDescription
        descriptionId={quickInfoDescriptionId}
        quickInfo={quickInfo}
      />
    </div>
  );
}
