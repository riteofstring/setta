import _ from "lodash";
import React, { useCallback, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useReactFlow } from "../canvas/store";
import { useSortable } from "../dnd/adapter";
import { applyZoomToTransform, transformToString } from "../dnd/adapter/zoom";
import { getItemDndId, isTempItem, useItemDndState } from "../dnd/itemDndState";
import { getSectionItemTreeOrThrow, getSectionOrThrow } from "../document/documentSelectors";
import { toggleItemSelected } from "../document/itemSelection";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { getItemOrThrow } from "../document/itemTree";
import { useWorkspaceAppearance, useWorkspaceDocument } from "../document/stores";
import { deriveSectionStyleTheme } from "../section/sectionStyleColors";
import { useItemDndChildrenForParent, useItemListContext } from "./ItemListContext";

// The reference's `ParamSwitch`/`ParamContainer` row pair trimmed to the package seam: the
// package owns the row interaction chrome — sortable wiring with zoom-scaled transforms, the
// temp placeholder row, selection and hover treatments, and the nested-children flow with the
// reference's left rail — while the host-registered renderer supplies the row content (the
// reference's param labels, inputs, error and search treatments stay application-side). The
// reference's `--param-column-width` variable rides the row grids verbatim, like the dnd-id
// wire constants; the column-resize feature that writes it stays application-side.

const ITEM_COLUMN_WIDTH = "var(--param-column-width, 200px)";

const NESTED_CHILD_ROWS_CLASS_NAME =
  "section-args-nested section-key-value relative grid min-w-0 gap-y-1 before:absolute before:bottom-0 before:left-0 before:h-[calc(100%_-_0.1rem)] before:w-[0.4rem] before:rounded-full before:bg-setta-200/20 before:content-[''] dark:before:bg-setta-400/20";

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

function createSortableStyle({
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
}): CSSProperties {
  return {
    transform: transformToString(applyZoomToTransform(transform)),
    transition,
    zIndex: isDragging ? 1000 : undefined,
    height,
    width,
  };
}

function TempItemRow({ itemId }: { itemId: string }) {
  const { enabled, sectionId, listKey } = useItemListContext();
  const { height, width } = useTempItemPlaceholderStyle();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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
  const dndStyle = createSortableStyle({
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

  return `transition-colors rounded-sm ${selectedBgClassName}`;
}

function resolveItemBackgroundClass({
  hasSectionStyleTheme,
  isSelected,
}: {
  hasSectionStyleTheme: boolean;
  isSelected: boolean;
}) {
  if (!isSelected) {
    return "transition-colors rounded-sm";
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
};

function buildLeafRowProps({ bg, hoverClassName, dndClassName, dndStyle }: ItemRowStyleProps) {
  return {
    rowClassName: `section-key-value group/arg-group section-min-rows relative grid min-w-0 items-center rounded-sm px-[2px] ${hoverClassName} ${bg} ${dndClassName}`,
    rowStyle: {
      gridTemplateColumns: `minmax(min-content, ${ITEM_COLUMN_WIDTH}) 0.75rem minmax(0, 1fr)`,
      gridTemplateAreas: `"key center-gutter value"`,
      ...dndStyle,
    },
  };
}

function buildNestedRootRowProps({
  bg,
  hoverClassName,
  dndClassName,
  dndStyle,
}: ItemRowStyleProps) {
  return {
    rowClassName: `section-args-nested-key-value section-key-value group/arg-group section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px] ${hoverClassName} ${bg} ${dndClassName}`,
    rowStyle: {
      gridTemplateColumns: `minmax(min-content, ${ITEM_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
      ...dndStyle,
    },
  };
}

function buildNestedChildRowProps({
  bg,
  hoverClassName,
  dndClassName,
  dndStyle,
  isTopLevelWithPad,
}: ItemRowStyleProps & { isTopLevelWithPad: boolean }) {
  return {
    rowClassName: `section-args-nested section-lg-value group/arg-group section-min-rows [&>p]:section-key-value relative grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm ${hoverClassName} ${bg} ${isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : ""} ${dndClassName}`,
    rowStyle: {
      gridTemplateColumns: `[c1] 0.75rem [c2] minmax(min-content, ${ITEM_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
      ...dndStyle,
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
      toggleItemSelected(sectionId, itemId);
    },
    [isSelectingItems, sectionId, itemId],
  );
  // The reference toggles selection through its app-level pointer path only; the package adds
  // the keyboard equivalent on the row for the repository's accessibility gate.
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
      toggleItemSelected(sectionId, itemId);
    },
    [isSelectingItems, sectionId, itemId],
  );

  return { handleItemClick, handleItemMouseDown, handleItemKeyDown };
}

function ItemNestedChildren({ renderChildren }: { renderChildren: Array<string> }) {
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

function RealItemRow({ itemId, isTopLevelWithPad = false }: ItemRowProps) {
  const { enabled, sectionId, listKey, visibleItemIds, renderItem, isGroupItem } =
    useItemListContext();
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
  // The same derived-theme gate as the section chrome: a style color that derives no theme
  // leaves the row on the plain treatments, so the themed classes never reference unset vars.
  const hasSectionStyleTheme = Boolean(
    rowState.styleColor && deriveSectionStyleTheme(rowState.styleColor, darkMode),
  );
  const { handleItemClick, handleItemMouseDown, handleItemKeyDown } = useItemSelectionHandlers(
    sectionId,
    itemId,
  );
  const visibleChildren = rowState.item.children.filter((childId) => visibleItemIds.has(childId));
  const renderChildren = useItemDndChildrenForParent(itemId, visibleChildren);
  const dndId = getItemDndId(itemId, listKey);
  const hasNested = rowState.item.children.length > 0;
  const onlyChildId = rowState.item.children.length === 1 ? rowState.item.children[0] : null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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

  const layout = resolveItemRowLayout({
    hasChildRows: renderChildren.length > 0,
    isGroup: isGroupItem(rowState.item),
  });
  const { rowClassName, rowStyle } = buildItemRowProps(
    layout,
    {
      bg: resolveItemBackgroundClass({
        hasSectionStyleTheme: hasSectionStyleTheme,
        isSelected: rowState.isSelected,
      }),
      hoverClassName: getItemHoverClassName(hasSectionStyleTheme),
      dndClassName: isDragging ? "opacity-80" : "",
      dndStyle: createSortableStyle({ transform, transition, isDragging }),
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
    >
      {renderItem({ sectionId, listKey, item: rowState.item, isSelected: rowState.isSelected })}
      {layout !== "leaf" && <ItemNestedChildren renderChildren={renderChildren} />}
    </ItemRowShell>
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
  children,
}: {
  rowClassName: string;
  rowStyle: CSSProperties;
  dndAttributes: Record<string, unknown>;
  dndListeners: Record<string, unknown>;
  dndRef: (element: HTMLElement | null) => void;
  onClick: React.MouseEventHandler;
  onMouseDown: React.MouseEventHandler;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  // The reference renders rows as role-less articles; the package row is a div with a button
  // role and a keyboard selection toggle for the repository's accessibility gate — visually
  // identical. Rows stay out of the tab order (tabIndex -1): Tab is the item indent chord
  // while a selection exists, so the toggle is reachable from click or programmatic focus,
  // not from tab navigation, matching the reference's role-less rows.
  return (
    <div
      className={rowClassName}
      style={rowStyle}
      data-item-row="true"
      onMouseDownCapture={onMouseDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
      ref={dndRef}
      {...(dndAttributes as React.HTMLAttributes<HTMLDivElement>)}
      {...(dndListeners as React.HTMLAttributes<HTMLDivElement>)}
      role="button"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
