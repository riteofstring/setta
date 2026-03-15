import SettaSLogo from "assets/icons/s-logo-only-og.svg?react";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import type {
  CSSProperties,
  KeyboardEventHandler,
  MouseEventHandler,
} from "react";
import { useEffect, useRef, useState } from "react";
import { HiChevronDown, HiChevronRight, HiChevronUp } from "react-icons/hi";
import { TbFile, TbFolder } from "react-icons/tb";
import { List, useListRef } from "react-window";
import { getDefaultColumnWidth } from "state/hooks/columnWidthUtils";
import { useColumnWidthDrag } from "state/hooks/useColumnWidthDrag";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import {
  getFileBrowserDragPayload,
  setFileBrowserDragPayload,
  type FileBrowserDragPayload,
} from "utils/fileBrowserDragPayload";
import {
  isSameOrDescendantBrowserPath,
  normalizeFileBrowserPathForComparison,
} from "utils/fileBrowserPathRelation";
import { clamp } from "utils/utils";
import {
  formatBrowserPathTooltip,
  formatModifiedAt,
  shouldShowSettaInitializedFolderIcon,
  type FileUrlEntry,
  type FlattenedNode,
  type SortDirection,
  type SortKey,
} from "./fileBrowserPaneTreeModel";

// Owns the file-browser list header, virtualized rows, and row-level drag shell.
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 28;
const FILE_COLUMN_CSS_VAR = "--file-browser-column-width";

export const FILE_BROWSER_DATE_COLUMN_MIN_WIDTH = 96;
export const FILE_BROWSER_FILE_COLUMN_MIN_WIDTH = 120;

type RowData = {
  items: FlattenedNode[];
  expandedPaths: Record<string, boolean>;
  selectedPath: string | null;
  rootPath: string | null;
  dragTargetFolderPath: string | null;
  fileUrlMap: Record<string, FileUrlEntry>;
  showSearchPathTooltips: boolean;
  loadingPaths: Record<string, boolean>;
  errorByPath: Record<string, string>;
  columnWidth: string;
  listInsetLeft: number;
  showSettaInitializedBadge: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onSetDragTargetFolder: (path: string | null) => void;
  onDropIntoFolder: (
    payload: FileBrowserDragPayload,
    destinationFolderPath: string,
  ) => void;
};

type FileBrowserRowProps = RowData & {
  index: number;
  style: CSSProperties;
};

export type FileBrowserPaneListSurfaceProps = {
  displayedItems: FlattenedNode[];
  expandedPaths: Record<string, boolean>;
  selectedPath: string | null;
  rootPath: string | null;
  fileUrlMap: Record<string, FileUrlEntry>;
  showSearchPathTooltips: boolean;
  loadingPaths: Record<string, boolean>;
  errorByPath: Record<string, string>;
  listInsetLeft?: number;
  showSettaInitializedBadge: boolean;
  sortKey: SortKey;
  sortDirection: SortDirection;
  listRef: ReturnType<typeof useListRef>;
  requestFileUrls: (paths: string[]) => Promise<void> | void;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
  onDropIntoFolder: (
    payload: FileBrowserDragPayload,
    destinationFolderPath: string,
  ) => void;
  onSort: (key: SortKey) => void;
  columnWidthConfig?: {
    columnWidth: string;
    onResizeStart: MouseEventHandler<HTMLDivElement>;
  };
};

export function FileBrowserPaneListSurface({
  displayedItems,
  expandedPaths,
  selectedPath,
  rootPath,
  fileUrlMap,
  showSearchPathTooltips,
  loadingPaths,
  errorByPath,
  listInsetLeft = 0,
  showSettaInitializedBadge,
  sortKey,
  sortDirection,
  listRef,
  requestFileUrls,
  onKeyDown,
  onToggle,
  onSelect,
  onOpen,
  onDropIntoFolder,
  onSort,
  columnWidthConfig,
}: FileBrowserPaneListSurfaceProps) {
  const [listSize, setListSize] = useState({ height: 320, width: 320 });
  const [dragTargetFolderPath, setDragTargetFolderPath] = useState<
    string | null
  >(null);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const columnResizeDepthRef = useRef(1);

  useEffect(() => {
    const wrapper = listWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setListSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, []);

  const {
    handleResizeStart: handleLocalResizeStart,
    setNewWidth,
    widthRef,
  } = useColumnWidthDrag({
    outerRef: listWrapperRef,
    maxNestedDepthRef: columnResizeDepthRef,
    applyWidth: (width) => {
      if (listWrapperRef.current) {
        listWrapperRef.current.style.setProperty(
          FILE_COLUMN_CSS_VAR,
          `${width}px`,
        );
      }
    },
    persistWidth: () => {},
    getBoundedWidth: (width, containerWidth) =>
      clamp(
        width,
        FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
        Math.max(
          FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
          containerWidth - FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
        ),
      ),
  });

  useEffect(() => {
    if (columnWidthConfig || !listWrapperRef.current) {
      return;
    }
    const containerWidth = listWrapperRef.current.clientWidth;
    if (!containerWidth) {
      return;
    }
    if (widthRef.current.currentWidth !== 0) {
      return;
    }
    setNewWidth(containerWidth, getDefaultColumnWidth(containerWidth));
  }, [columnWidthConfig, listSize.width, setNewWidth, widthRef]);

  const listHeight = Math.max(1, listSize.height - HEADER_HEIGHT);
  const listWidth = Math.max(1, listSize.width);
  const columnWidth = columnWidthConfig?.columnWidth
    ? columnWidthConfig.columnWidth
    : `var(${FILE_COLUMN_CSS_VAR}, 55%)`;
  const handleResizeStart =
    columnWidthConfig?.onResizeStart ?? handleLocalResizeStart;
  const gridTemplateColumns = `minmax(${FILE_BROWSER_FILE_COLUMN_MIN_WIDTH}px, min(${columnWidth}, calc(100% - ${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px))) minmax(${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px, 1fr)`;
  const fileSortDirection = sortKey === "name" ? sortDirection : "asc";
  const dateSortDirection = sortKey === "modified" ? sortDirection : "desc";

  return (
    <div
      ref={listWrapperRef}
      className="nodrag relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white/80 dark:bg-setta-950/60"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragTargetFolderPath(null);
        }
      }}
    >
      <div
        className="group box-border grid h-7 items-center border-b border-setta-100/80 bg-setta-50/70 px-2 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:border-setta-800/80 dark:bg-setta-900/40 dark:text-setta-400"
        style={{
          gridTemplateColumns,
        }}
      >
        <div
          className="relative flex items-center border-r border-transparent pr-6 transition-colors group-hover:border-setta-100/80 dark:group-hover:border-setta-800/80"
          style={listInsetLeft ? { paddingLeft: listInsetLeft } : undefined}
        >
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onClick={() => onSort("name")}
            aria-label={`Sort by name (${fileSortDirection === "asc" ? "A to Z" : "Z to A"})`}
          >
            <span className="min-w-0 truncate">Files</span>
            {fileSortDirection === "asc" ? (
              <HiChevronUp
                className={
                  sortKey === "name"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            ) : (
              <HiChevronDown
                className={
                  sortKey === "name"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            )}
          </button>
          <div
            className="group/resize nopan nodrag pointer-events-none absolute -right-2 top-0 flex h-full w-4 cursor-col-resize items-center justify-center opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
            onMouseDown={handleResizeStart}
          >
            <div className="h-4 w-1.5 rounded-full bg-setta-400/90 transition-colors group-hover/resize:bg-blue-500 dark:bg-setta-500 dark:group-hover/resize:bg-blue-400" />
          </div>
        </div>
        <div className="flex items-center justify-end pl-3">
          <button
            type="button"
            className="flex w-full min-w-0 items-center justify-end gap-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onClick={() => onSort("modified")}
            aria-label={`Sort by date modified (${dateSortDirection === "asc" ? "oldest to newest" : "newest to oldest"})`}
          >
            <span className="min-w-0 truncate text-right">Date modified</span>
            {dateSortDirection === "asc" ? (
              <HiChevronUp
                className={
                  sortKey === "modified"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            ) : (
              <HiChevronDown
                className={
                  sortKey === "modified"
                    ? "text-blue-500"
                    : "text-setta-400/70 dark:text-setta-600"
                }
              />
            )}
          </button>
        </div>
      </div>
      <div className="h-full w-full overflow-x-hidden">
        <List
          listRef={listRef}
          rowComponent={FileBrowserRow}
          rowCount={displayedItems.length}
          rowHeight={ROW_HEIGHT}
          className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag overflow-x-hidden`}
          onRowsRendered={(visibleRows) => {
            if (displayedItems.length === 0) {
              return;
            }
            const start = Math.max(0, visibleRows.startIndex);
            const stop = Math.min(
              displayedItems.length - 1,
              visibleRows.stopIndex,
            );
            if (start > stop) {
              return;
            }
            const needed: string[] = [];
            for (let i = start; i <= stop; i += 1) {
              const entry = displayedItems[i];
              if (!entry || entry.type === "folder") {
                continue;
              }
              const previewKind = getAttachmentPreviewKind({
                id: entry.fullPath,
                name: entry.name,
                mimeType: null,
                size: null,
              });
              if (previewKind !== "image") {
                continue;
              }
              needed.push(entry.fullPath);
            }
            void requestFileUrls(needed);
          }}
          rowProps={{
            items: displayedItems,
            expandedPaths,
            selectedPath,
            rootPath,
            dragTargetFolderPath,
            fileUrlMap,
            showSearchPathTooltips,
            loadingPaths,
            errorByPath,
            columnWidth,
            listInsetLeft,
            showSettaInitializedBadge,
            onToggle,
            onSelect,
            onOpen,
            onSetDragTargetFolder: setDragTargetFolderPath,
            onDropIntoFolder,
          }}
          style={{ height: listHeight, width: listWidth }}
        />
      </div>
    </div>
  );
}

function FileBrowserRow({
  index,
  style,
  items,
  expandedPaths,
  selectedPath,
  rootPath,
  dragTargetFolderPath,
  fileUrlMap,
  showSearchPathTooltips,
  loadingPaths,
  errorByPath,
  columnWidth,
  listInsetLeft,
  showSettaInitializedBadge,
  onToggle,
  onSelect,
  onOpen,
  onSetDragTargetFolder,
  onDropIntoFolder,
}: FileBrowserRowProps) {
  const item = items[index];
  if (!item) {
    return null;
  }
  const isFolder = item.type === "folder";
  const showSettaInitializedFolderIcon = shouldShowSettaInitializedFolderIcon({
    isFolder,
    isSettaInitialized: item.isSettaInitialized === true,
  });
  const showSettaInitializedBadgePill =
    showSettaInitializedBadge && showSettaInitializedFolderIcon;
  const isExpanded = expandedPaths[item.fullPath] === true;
  const isSelected = selectedPath === item.fullPath;
  const isDragTargetFolder = isFolder && dragTargetFolderPath === item.fullPath;
  const isLoading = loadingPaths[item.fullPath] === true;
  const errorMessage = errorByPath[item.fullPath];
  const paddingLeft = listInsetLeft + 8 + item.depth * 12;
  const modifiedLabel = formatModifiedAt(item.mtime);
  const rowClasses = isSelected
    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
    : isDragTargetFolder
      ? "bg-blue-100/80 text-blue-700 dark:bg-blue-950/45 dark:text-blue-200"
      : "text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-900";
  const tooltipPath =
    showSearchPathTooltips && !isFolder
      ? formatBrowserPathTooltip(item.fullPath, rootPath)
      : null;
  const tooltipHandlers = tooltipPath
    ? getFloatingBoxHandlers({ title: "File path", content: tooltipPath })
    : null;
  const previewKind = !isFolder
    ? getAttachmentPreviewKind({
        id: item.fullPath,
        name: item.name,
        mimeType: null,
        size: null,
      })
    : null;
  const imageUrl =
    previewKind === "image" ? fileUrlMap[item.fullPath]?.url ?? null : null;

  function handleRowDoubleClick(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('[data-filebrowser-toggle="true"]')
    ) {
      return;
    }
    onSelect(item.fullPath);
    onOpen(item.fullPath);
  }

  return (
    <button
      type="button"
      data-testid="file-browser-row"
      data-path={item.fullPath}
      draggable={item.fullPath !== rootPath}
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: `minmax(${FILE_BROWSER_FILE_COLUMN_MIN_WIDTH}px, min(${columnWidth}, calc(100% - ${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px))) minmax(${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px, 1fr)`,
      }}
      className={`box-border cursor-pointer items-center gap-2 pr-2 text-left text-xs ${rowClasses}`}
      {...(tooltipHandlers ?? {})}
      onMouseDown={(event) => {
        event.stopPropagation();
        // Clicking a row should behave like a real file explorer: it should
        // take focus away from the address bar/filter so completion tooltips
        // don't keep intercepting clicks.
        if (typeof document !== "undefined") {
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            active.blur();
          }
        }
      }}
      onDragStart={(event) => {
        if (item.fullPath === rootPath) {
          event.preventDefault();
          return;
        }
        setFileBrowserDragPayload(event.dataTransfer, {
          name: item.name,
          fullPath: item.fullPath,
          type: item.type,
        });
        event.dataTransfer.effectAllowed = "copyMove";
      }}
      onDragOver={(event) => {
        if (!isFolder) {
          return;
        }
        const payload = getFileBrowserDragPayload(event.dataTransfer);
        if (!payload) {
          return;
        }
        const normalizedTarget = normalizeFileBrowserPathForComparison(
          item.fullPath,
        );
        const normalizedSource = normalizeFileBrowserPathForComparison(
          payload.fullPath,
        );
        if (!normalizedTarget || !normalizedSource) {
          return;
        }
        if (
          normalizedTarget === normalizedSource ||
          (payload.type === "folder" &&
            isSameOrDescendantBrowserPath(normalizedTarget, normalizedSource))
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        onSetDragTargetFolder(item.fullPath);
      }}
      onDragLeave={(event) => {
        if (!isFolder) {
          return;
        }
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        onSetDragTargetFolder(null);
      }}
      onDrop={(event) => {
        if (!isFolder) {
          return;
        }
        const payload = getFileBrowserDragPayload(event.dataTransfer);
        onSetDragTargetFolder(null);
        if (!payload) {
          return;
        }
        const normalizedTarget = normalizeFileBrowserPathForComparison(
          item.fullPath,
        );
        const normalizedSource = normalizeFileBrowserPathForComparison(
          payload.fullPath,
        );
        if (!normalizedTarget || !normalizedSource) {
          return;
        }
        if (
          normalizedTarget === normalizedSource ||
          (payload.type === "folder" &&
            isSameOrDescendantBrowserPath(normalizedTarget, normalizedSource))
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDropIntoFolder(payload, item.fullPath);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item.fullPath);
      }}
    >
      <div
        className="flex min-w-0 items-center gap-1 pr-2"
        style={{ paddingLeft }}
        onDoubleClick={handleRowDoubleClick}
      >
        {isFolder ? (
          <div
            role="button"
            tabIndex={-1}
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            data-filebrowser-toggle="true"
            className="flex h-4 w-4 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(item.fullPath);
            }}
          >
            {isExpanded ? (
              <HiChevronDown size={12} />
            ) : (
              <HiChevronRight size={12} />
            )}
          </div>
        ) : (
          <span className="h-4 w-4" />
        )}
        {isFolder ? (
          showSettaInitializedFolderIcon ? (
            <SettaSLogo
              data-testid="setta-initialized-folder-icon"
              className="h-[14px] w-[14px] shrink-0 text-setta-500 [&>g>path]:fill-current [&>g>rect]:fill-current"
            />
          ) : (
            <TbFolder className="text-setta-400" size={14} />
          )
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-4 w-4 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <TbFile className="text-setta-400" size={14} />
        )}
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={handleRowDoubleClick}
        >
          {item.name}
        </span>
        {showSettaInitializedBadgePill && (
          <span
            data-testid="setta-initialized-badge"
            className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em] text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/40 dark:text-blue-200"
          >
            Setta
          </span>
        )}
        {isLoading && (
          <span className="h-3 w-3 animate-spin rounded-full border border-setta-300 border-t-transparent" />
        )}
        {errorMessage && !isLoading && (
          <span className="truncate text-[10px] text-red-400">!</span>
        )}
      </div>
      <div
        className="pr-1 text-right text-[11px] text-setta-400 dark:text-setta-500"
        onDoubleClick={handleRowDoubleClick}
      >
        {modifiedLabel}
      </div>
    </button>
  );
}
