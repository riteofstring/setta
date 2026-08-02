import SettaSLogo from "assets/icons/s-logo-only-og.svg?react";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import type { MouseEvent } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi";
import { TbFile, TbFolder } from "react-icons/tb";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import {
  getFileBrowserDragPayload,
  setFileBrowserDragPayload,
  type FileBrowserDragPayload,
} from "utils/fileBrowserDragPayload";
import { isSameOrDescendantBrowserPath } from "utils/fileBrowserPathRelation";
import {
  formatBrowserPathTooltip,
  formatModifiedAt,
  shouldShowSettaInitializedFolderIcon,
} from "./fileBrowserPaneCore";
import type { FileBrowserRowProps } from "./fileBrowserPaneShared";

function getRowClasses(args: {
  isSelected: boolean;
  isDragTargetFolder: boolean;
}): string {
  if (args.isSelected) {
    return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200";
  }
  if (args.isDragTargetFolder) {
    return "bg-blue-100/80 text-blue-700 dark:bg-blue-950/45 dark:text-blue-200";
  }
  return "text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-900";
}

function getDropPayload(args: {
  isFolder: boolean;
  targetPath: string;
  dataTransfer: DataTransfer;
}): FileBrowserDragPayload | null {
  if (!args.isFolder) {
    return null;
  }
  const payload = getFileBrowserDragPayload(args.dataTransfer);
  if (!payload) {
    return null;
  }
  if (payload.fullPath === args.targetPath) {
    return null;
  }
  if (
    payload.type === "folder" &&
    isSameOrDescendantBrowserPath(args.targetPath, payload.fullPath)
  ) {
    return null;
  }
  return payload;
}

function blurActiveElement(): void {
  if (typeof document === "undefined") {
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

function handleRowDoubleClick(args: {
  event: MouseEvent<HTMLElement>;
  path: string;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
}): void {
  args.event.stopPropagation();
  if (
    args.event.target instanceof HTMLElement &&
    args.event.target.closest('[data-filebrowser-toggle="true"]')
  ) {
    return;
  }
  args.onSelect(args.path);
  args.onOpen(args.path);
}

function buildRowViewState(args: {
  dragTargetFolderPath: string | null;
  errorByPath: Record<string, string>;
  fileUrlMap: Record<string, { url: string; expiresAt: number }>;
  item: FileBrowserRowProps["items"][number];
  listInsetLeft: number;
  loadingPaths: Record<string, boolean>;
  rootPath: string | null;
  selectedPath: string | null;
  showSearchPathTooltips: boolean;
}): {
  errorMessage: string | undefined;
  imageUrl: string | null;
  isDragTargetFolder: boolean;
  isExpanded: boolean;
  isFolder: boolean;
  isLoading: boolean;
  isSelected: boolean;
  modifiedLabel: string;
  paddingLeft: number;
  rowClasses: string;
  tooltipHandlers: ReturnType<typeof getFloatingBoxHandlers> | null;
} {
  const isFolder = args.item.type === "folder";
  const imageUrl = !isFolder
    ? args.fileUrlMap[args.item.fullPath]?.url ?? null
    : null;
  const isSelected = args.selectedPath === args.item.fullPath;
  const isDragTargetFolder =
    isFolder && args.dragTargetFolderPath === args.item.fullPath;
  const tooltipPath =
    args.showSearchPathTooltips && !isFolder
      ? formatBrowserPathTooltip(args.item.fullPath, args.rootPath)
      : null;
  return {
    errorMessage: args.errorByPath[args.item.fullPath],
    imageUrl,
    isDragTargetFolder,
    isExpanded: false,
    isFolder,
    isLoading: args.loadingPaths[args.item.fullPath] === true,
    isSelected,
    modifiedLabel: formatModifiedAt(args.item.mtime),
    paddingLeft: args.listInsetLeft + 8 + args.item.depth * 12,
    rowClasses: getRowClasses({ isSelected, isDragTargetFolder }),
    tooltipHandlers: tooltipPath
      ? getFloatingBoxHandlers({ title: "File path", content: tooltipPath })
      : null,
  };
}

function FileBrowserRowStatus(args: {
  showBadge: boolean;
  isLoading: boolean;
  errorMessage: string | undefined;
}): JSX.Element {
  return (
    <>
      {args.showBadge ? (
        <span
          data-testid="setta-initialized-badge"
          className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em] text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/40 dark:text-blue-200"
        >
          Setta
        </span>
      ) : null}
      {args.isLoading ? (
        <span className="h-3 w-3 animate-spin rounded-full border border-setta-300 border-t-transparent" />
      ) : null}
      {args.errorMessage ? (
        <span className="truncate text-[10px] text-red-400">!</span>
      ) : null}
    </>
  );
}

function handleRowMouseDown(event: MouseEvent<HTMLElement>): void {
  event.stopPropagation();
  blurActiveElement();
}

function FileBrowserItemIcon(args: {
  isFolder: boolean;
  showSettaInitializedFolderIcon: boolean;
  imageUrl: string | null;
  itemName: string;
}): JSX.Element {
  if (args.isFolder) {
    if (args.showSettaInitializedFolderIcon) {
      return (
        <SettaSLogo
          data-testid="setta-initialized-folder-icon"
          className="h-[14px] w-[14px] shrink-0 text-setta-500 [&>g>path]:fill-current [&>g>rect]:fill-current"
        />
      );
    }
    return <TbFolder className="text-setta-400" size={14} />;
  }
  if (args.imageUrl) {
    return (
      <img
        src={args.imageUrl}
        alt={args.itemName}
        loading="lazy"
        className="h-4 w-4 shrink-0 rounded-sm object-cover"
      />
    );
  }
  return <TbFile className="text-setta-400" size={14} />;
}

function FileBrowserFolderToggle(args: {
  isFolder: boolean;
  isExpanded: boolean;
  path: string;
  onToggle: (path: string) => void;
}): JSX.Element {
  if (!args.isFolder) {
    return <span className="h-4 w-4" />;
  }
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={args.isExpanded ? "Collapse folder" : "Expand folder"}
      data-filebrowser-toggle="true"
      className="flex h-4 w-4 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        args.onToggle(args.path);
      }}
    >
      {args.isExpanded ? (
        <HiChevronDown size={12} />
      ) : (
        <HiChevronRight size={12} />
      )}
    </div>
  );
}

export function FileBrowserRow({
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
  gridTemplateColumns,
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
  const showSettaInitializedFolderIcon = shouldShowSettaInitializedFolderIcon({
    isFolder: item.type === "folder",
    isSettaInitialized: item.isSettaInitialized === true,
  });
  const previewKind =
    item.type === "folder"
      ? null
      : getAttachmentPreviewKind({
          id: item.fullPath,
          name: item.name,
          mimeType: null,
          size: null,
        });
  const rowViewState = buildRowViewState({
    dragTargetFolderPath,
    errorByPath,
    fileUrlMap: previewKind === "image" ? fileUrlMap : {},
    item,
    listInsetLeft,
    loadingPaths,
    rootPath,
    selectedPath,
    showSearchPathTooltips,
  });
  const isExpanded = expandedPaths[item.fullPath] === true;
  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    handleRowDoubleClick({
      event,
      path: item.fullPath,
      onSelect,
      onOpen,
    });
  };

  return (
    <button
      type="button"
      data-testid="file-browser-row"
      data-path={item.fullPath}
      draggable={item.fullPath !== rootPath}
      style={{ ...style, display: "grid", gridTemplateColumns }}
      className={`box-border cursor-pointer items-center gap-2 pr-2 text-left text-xs ${rowViewState.rowClasses}`}
      {...(rowViewState.tooltipHandlers ?? {})}
      onMouseDown={handleRowMouseDown}
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
        const payload = getDropPayload({
          isFolder: rowViewState.isFolder,
          targetPath: item.fullPath,
          dataTransfer: event.dataTransfer,
        });
        if (!payload) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        onSetDragTargetFolder(item.fullPath);
      }}
      onDragLeave={(event) => {
        if (
          !rowViewState.isFolder ||
          event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          return;
        }
        onSetDragTargetFolder(null);
      }}
      onDrop={(event) => {
        const payload = getDropPayload({
          isFolder: rowViewState.isFolder,
          targetPath: item.fullPath,
          dataTransfer: event.dataTransfer,
        });
        onSetDragTargetFolder(null);
        if (!payload) {
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
        style={{ paddingLeft: rowViewState.paddingLeft }}
        onDoubleClick={handleDoubleClick}
      >
        <FileBrowserFolderToggle
          isFolder={rowViewState.isFolder}
          isExpanded={isExpanded}
          path={item.fullPath}
          onToggle={onToggle}
        />
        <FileBrowserItemIcon
          isFolder={rowViewState.isFolder}
          showSettaInitializedFolderIcon={showSettaInitializedFolderIcon}
          imageUrl={previewKind === "image" ? rowViewState.imageUrl : null}
          itemName={item.name}
        />
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={handleDoubleClick}
        >
          {item.name}
        </span>
        <FileBrowserRowStatus
          showBadge={
            showSettaInitializedBadge && showSettaInitializedFolderIcon
          }
          isLoading={rowViewState.isLoading}
          errorMessage={
            rowViewState.isLoading ? undefined : rowViewState.errorMessage
          }
        />
      </div>
      <div
        className="pr-1 text-right text-[11px] text-setta-400 dark:text-setta-500"
        onDoubleClick={handleDoubleClick}
      >
        {rowViewState.modifiedLabel}
      </div>
    </button>
  );
}
