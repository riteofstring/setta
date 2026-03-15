import { FileBrowserPane } from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
import {
  type ComponentType,
  type DragEventHandler,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
} from "react";
import { FiArchive, FiColumns, FiFileText, FiMusic } from "react-icons/fi";
import { HiOutlineViewGrid } from "react-icons/hi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdList } from "react-icons/md";
import { TbCarouselHorizontal, TbFolder } from "react-icons/tb";
import { useIsScrollable } from "state/hooks/sectionScrollability";
import { useBrowserSectionFileBrowserState } from "state/stores/fileBrowserStores";
import { setFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import {
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
  FolderContentItem,
} from "utils/generatedTypes";
import {
  type BrowserPreviewKind,
  type FileTextPreview,
  type FileUrlEntry,
  getBrowserPreviewKind,
  getExtensionBadge,
  getFileSizeLabel,
  type OpenableBrowserItem,
  PDF_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_MAX_BYTES,
} from "./browserAreaPreviewModel";

const LazyFileBrowserSpreadsheetEditor = lazy(async () => {
  const module = await import(
    "components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor"
  );
  return { default: module.FileBrowserSpreadsheetEditor };
});

type PreviewIcon = ComponentType<{ className?: string; size?: number }>;

const PREVIEW_KIND_ICON_MAP: Record<BrowserPreviewKind, PreviewIcon> = {
  image: IoImageOutline,
  pdf: FiFileText,
  audio: FiMusic,
  video: IoVideocam,
  spreadsheet: FiColumns,
  text: FiFileText,
  archive: FiArchive,
  folder: TbFolder,
  other: FiFileText,
};

const PREVIEW_KIND_ICON_CLASS_MAP: Record<BrowserPreviewKind, string> = {
  image: "text-setta-200 dark:text-setta-600",
  pdf: "text-rose-500/80 dark:text-rose-300",
  audio: "text-amber-500/80 dark:text-amber-300",
  video: "text-emerald-500/80 dark:text-emerald-300",
  spreadsheet: "text-lime-500/80 dark:text-lime-300",
  text: "text-sky-500/80 dark:text-sky-300",
  archive: "text-amber-500/80 dark:text-amber-300",
  folder: "text-setta-300 dark:text-setta-600",
  other: "text-setta-300 dark:text-setta-600",
};

const PREVIEW_KIND_BADGE_CLASS_MAP: Record<BrowserPreviewKind, string> = {
  image: "",
  pdf: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  audio: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  video:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  spreadsheet:
    "bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-200",
  text: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  archive:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  folder: "",
  other: "bg-setta-200 text-setta-700 dark:bg-setta-700/40 dark:text-setta-200",
};

function BrowserThumbnailContent({
  previewKind,
  thumbnailUrl,
  badgeText,
  label,
}: {
  previewKind: BrowserPreviewKind;
  thumbnailUrl?: string | null;
  badgeText?: string | null;
  label: string;
}) {
  if (previewKind === "image" && thumbnailUrl) {
    return (
      <>
        <img
          src={thumbnailUrl}
          className="single-cell-child z-10 h-full w-full object-cover"
          alt={label}
        />
        <IoImageOutline className="single-cell-child z-0 place-self-center text-setta-200 dark:text-setta-600" />
      </>
    );
  }
  const Icon = PREVIEW_KIND_ICON_MAP[previewKind];
  const iconClassName = PREVIEW_KIND_ICON_CLASS_MAP[previewKind];
  const badgeClassName = PREVIEW_KIND_BADGE_CLASS_MAP[previewKind];
  return (
    <>
      <div className="single-cell-child flex flex-col items-center justify-center gap-2">
        <Icon size={26} className={iconClassName} />
      </div>
      {badgeText ? (
        <span
          className={`single-cell-child mb-1 mr-1 self-end justify-self-end rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] ${badgeClassName}`}
        >
          {badgeText}
        </span>
      ) : null}
    </>
  );
}

function ViewSelectorButton({
  view,
  setView,
  viewType,
  ariaLabel,
  children,
}: {
  view: BrowserAreaViewMode;
  setView: (newView: BrowserAreaViewMode) => void;
  viewType: BrowserAreaViewMode;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={() => {
        setView(viewType);
      }}
      className={`nodrag flex h-4 w-4 cursor-pointer items-center justify-center rounded-md p-1 hover:bg-setta-50 dark:hover:bg-setta-800 ${view === viewType ? "bg-blue-100 text-blue-600 dark:bg-transparent dark:text-blue-600" : "bg-transparent text-setta-400 dark:text-setta-500"}`}
    >
      {children}
    </button>
  );
}

export function BrowserAreaViewSelector({
  view,
  setView,
}: {
  view: BrowserAreaViewMode;
  setView: (newView: BrowserAreaViewMode) => void;
}) {
  return (
    <div className="relative z-20 flex shrink-0 gap-0.5">
      <ViewSelectorButton
        view={view}
        setView={setView}
        viewType="list"
        ariaLabel="List view"
      >
        <MdList />
      </ViewSelectorButton>
      <ViewSelectorButton
        view={view}
        setView={setView}
        viewType="thumbnail"
        ariaLabel="Icon view"
      >
        <HiOutlineViewGrid />
      </ViewSelectorButton>
      <ViewSelectorButton
        view={view}
        setView={setView}
        viewType="carousel"
        ariaLabel="Carousel view"
      >
        <TbCarouselHorizontal />
      </ViewSelectorButton>
    </div>
  );
}

function ThumbnailItem({
  size = "96px",
  thumbnailUrl,
  previewKind,
  badgeText,
  label,
  children,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  draggable,
  onDragStart,
  itemPath,
}: {
  size: string;
  thumbnailUrl?: string | null;
  previewKind: BrowserPreviewKind;
  badgeText?: string | null;
  label: string;
  children: ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  itemPath?: string;
}) {
  return (
    <div
      className="nodrag group/thumbnail flex cursor-pointer flex-col items-center gap-1"
      style={{ width: size }}
      data-browser-thumbnail-path={itemPath}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div
        className="single-cell-container overflow-clip rounded-md border border-solid border-setta-500/20 bg-setta-100 opacity-80 transition-opacity group-hover/thumbnail:opacity-100 dark:bg-setta-800"
        style={{ width: size, height: size }}
      >
        <BrowserThumbnailContent
          previewKind={previewKind}
          thumbnailUrl={thumbnailUrl}
          badgeText={badgeText}
          label={label}
        />
        <input
          className="single-cell-child z-10 ml-1 mt-1 h-4 w-4 cursor-pointer rounded-full bg-transparent transition-colors checked:bg-blue-500 group-hover/thumbnail:bg-setta-500/70 group-hover/thumbnail:checked:bg-blue-600 dark:checked:bg-blue-700"
          type="checkbox"
          onClick={(event) => event.stopPropagation()}
        ></input>
      </div>
      <p className="w-full break-words text-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
        {children}
      </p>
    </div>
  );
}

export function BrowserAreaContentView({
  view,
  items,
  filesColumnWidth,
  onFilesColumnResizeStart,
  fileUrlMap,
  selectedCarouselId,
  onSelectCarouselId,
  textPreviewMap,
  getItemSubLabel,
  getItemTooltip,
  onOpenFolder,
  onOpenFile,
}: {
  view: BrowserAreaViewMode;
  items: Array<FolderContentItem>;
  filesColumnWidth: string;
  onFilesColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  fileUrlMap: Record<string, FileUrlEntry>;
  selectedCarouselId: string | null;
  onSelectCarouselId: (nextId: string | null) => void;
  textPreviewMap: Record<string, FileTextPreview>;
  getItemSubLabel?: (item: FolderContentItem) => string | null;
  getItemTooltip?: (item: FolderContentItem) => string | null;
  onOpenFolder: (path: string) => void;
  onOpenFile: (item: OpenableBrowserItem) => void;
}) {
  const { ref, isScrollable } = useIsScrollable();
  const renderFileCard = useCallback(
    (item: FolderContentItem, icon: ReactNode, description?: string) => {
      const sizeLabel = getFileSizeLabel(item);
      return (
        <div className="flex flex-col items-center gap-2 text-sm text-setta-500 dark:text-setta-300">
          <div className="text-setta-400 dark:text-setta-500">{icon}</div>
          <span className="max-w-[70%] truncate text-center text-setta-700 dark:text-setta-200">
            {item.name}
          </span>
          {description ? (
            <span className="text-xs text-setta-400 dark:text-setta-500">
              {description}
            </span>
          ) : null}
          {sizeLabel ? (
            <span className="text-xs text-setta-400 dark:text-setta-500">
              {sizeLabel}
            </span>
          ) : null}
        </div>
      );
    },
    [],
  );

  const renderPreview = useCallback(
    (item: MediaCarouselItem<FolderContentItem>) => {
      const data = item.data;
      if (!data) {
        return (
          <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
            <IoImageOutline size={40} />
            <span>Loading preview...</span>
          </div>
        );
      }
      if (data.type.toLowerCase() === "folder") {
        return (
          <div className="flex flex-col items-center gap-3 text-sm text-setta-500 dark:text-setta-300">
            <div className="text-setta-400 dark:text-setta-500">
              <TbFolder size={40} />
            </div>
            <span className="max-w-[70%] truncate text-center text-setta-700 dark:text-setta-200">
              {data.name}
            </span>
            <button
              type="button"
              className="rounded-md border border-solid border-setta-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-setta-500 transition hover:bg-setta-100 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={() => onOpenFolder(data.fullPath)}
            >
              Open folder
            </button>
          </div>
        );
      }
      const previewKind = getBrowserPreviewKind(data);
      const fileUrl = fileUrlMap[data.fullPath]?.url ?? "";
      if (previewKind === "image") {
        if (!fileUrl) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
              <IoImageOutline size={40} />
              <span>Loading preview...</span>
            </div>
          );
        }
        return (
          <div className="relative h-full w-full">
            <img
              src={fileUrl}
              alt={data.name}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          </div>
        );
      }
      if (previewKind === "text") {
        if (data.size && data.size > TEXT_PREVIEW_MAX_BYTES) {
          return renderFileCard(
            data,
            <FiFileText size={40} />,
            "Preview disabled for large files.",
          );
        }
        const preview = textPreviewMap[data.fullPath];
        if (!preview || preview.isLoading) {
          return (
            <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
              <FiFileText size={40} />
              <span>Loading preview...</span>
            </div>
          );
        }
        if (preview.error) {
          return renderFileCard(data, <FiFileText size={40} />, preview.error);
        }
        return (
          <div className="flex h-full w-full flex-col gap-2">
            <div className="h-full w-full overflow-hidden rounded-md border border-setta-200/60 bg-white/70 dark:border-setta-700 dark:bg-setta-900/60">
              <pre className="h-full w-full overflow-auto p-4 text-xs leading-relaxed text-setta-700 dark:text-setta-200">
                {preview.text || ""}
              </pre>
            </div>
            {preview.truncated ? (
              <div className="text-[11px] text-setta-400">
                Preview truncated.
              </div>
            ) : null}
          </div>
        );
      }
      if (previewKind === "spreadsheet") {
        return (
          <div className="h-full min-h-0 w-full">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
                  Loading spreadsheet...
                </div>
              }
            >
              <LazyFileBrowserSpreadsheetEditor
                selectedFile={{
                  name: data.name,
                  fullPath: data.fullPath,
                }}
              />
            </Suspense>
          </div>
        );
      }
      if (previewKind === "pdf") {
        if (data.size && data.size > PDF_PREVIEW_MAX_BYTES) {
          return renderFileCard(
            data,
            <FiFileText size={40} />,
            "Preview disabled for large PDFs.",
          );
        }
        if (!fileUrl) {
          return renderFileCard(
            data,
            <FiFileText size={40} />,
            "Preview unavailable.",
          );
        }
        return (
          <div className="relative h-full w-full overflow-hidden rounded-md">
            <iframe src={fileUrl} title={data.name} className="h-full w-full" />
          </div>
        );
      }
      if (previewKind === "audio") {
        if (!fileUrl) {
          return renderFileCard(
            data,
            <FiMusic size={40} />,
            "Preview unavailable.",
          );
        }
        return (
          <div className="flex h-full w-full items-center justify-center">
            <audio controls preload="metadata" className="w-full max-w-[720px]">
              <source src={fileUrl} />
            </audio>
          </div>
        );
      }
      if (previewKind === "video") {
        if (!fileUrl) {
          return renderFileCard(
            data,
            <IoVideocam size={40} />,
            "Preview unavailable.",
          );
        }
        return (
          <div className="relative h-full w-full">
            <video controls preload="metadata" className="h-full w-full">
              <source src={fileUrl} />
            </video>
          </div>
        );
      }
      if (previewKind === "archive") {
        return renderFileCard(
          data,
          <FiArchive size={40} />,
          "Archive preview not available.",
        );
      }
      return renderFileCard(
        data,
        <FiFileText size={40} />,
        "Preview not available.",
      );
    },
    [fileUrlMap, onOpenFolder, renderFileCard, textPreviewMap],
  );

  switch (view) {
    case BrowserAreaViewModeEnum.list:
      return (
        <div
          ref={ref}
          role="region"
          aria-label="File explorer"
          className="flex min-h-0 flex-1 flex-col"
        >
          <FileBrowserPane
            useFileBrowserStateHook={useBrowserSectionFileBrowserState}
            showFilter={false}
            showPathNavigation={false}
            onFolderOpen={(node) => onOpenFolder(node.fullPath)}
            columnWidthConfig={{
              columnWidth: filesColumnWidth,
              onResizeStart: onFilesColumnResizeStart,
            }}
            onFileOpen={(node) =>
              onOpenFile({
                name: node.name,
                fullPath: node.fullPath,
                type: node.type,
              })
            }
          />
        </div>
      );

    case BrowserAreaViewModeEnum.thumbnail:
      return (
        <div
          ref={ref}
          role="region"
          aria-label="File explorer"
          className={`nodrag flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden ${isScrollable ? "nowheel" : ""}`}
        >
          <div className="grid w-max max-w-full grid-flow-row auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 ">
            {items.map((item) => {
              const previewKind = getBrowserPreviewKind(item);
              const subLabel = getItemSubLabel ? getItemSubLabel(item) : null;
              const tooltipPath = getItemTooltip ? getItemTooltip(item) : null;
              const tooltipHandlers = tooltipPath
                ? getFloatingBoxHandlers({
                    title: "File path",
                    content: tooltipPath,
                  })
                : null;
              const badgeText =
                previewKind === "image" || previewKind === "folder"
                  ? null
                  : getExtensionBadge(item.name) ?? previewKind.toUpperCase();
              const thumbnailUrl =
                previewKind === "image"
                  ? fileUrlMap[item.fullPath]?.url ?? null
                  : null;
              const handleClick =
                previewKind === "folder"
                  ? () => onOpenFolder(item.fullPath)
                  : undefined;
              // ReactFlow selection / focus changes can replace DOM nodes between the
              // two clicks of a double click, preventing `dblclick` from firing.
              // Use click `detail===2` as a more reliable signal for "open".
              const handleDoubleClickClick: React.MouseEventHandler<HTMLDivElement> =
                previewKind === "folder"
                  ? () => onOpenFolder(item.fullPath)
                  : (event) => {
                      if (event.detail !== 2) {
                        return;
                      }
                      onOpenFile(item);
                    };
              return (
                <ThumbnailItem
                  key={item.fullPath}
                  itemPath={item.fullPath}
                  previewKind={previewKind}
                  badgeText={badgeText}
                  thumbnailUrl={thumbnailUrl}
                  label={item.name}
                  onClick={handleClick ?? handleDoubleClickClick}
                  draggable={previewKind !== "folder"}
                  onDragStart={
                    previewKind === "folder"
                      ? undefined
                      : (event) => {
                          setFileBrowserDragPayload(event.dataTransfer, {
                            name: item.name,
                            fullPath: item.fullPath,
                            type: item.type === "folder" ? "folder" : "file",
                          });
                          event.dataTransfer.effectAllowed = "copy";
                        }
                  }
                  {...(tooltipHandlers ?? {})}
                >
                  <span className="block w-full break-words">{item.name}</span>
                  {subLabel ? (
                    <span className="block w-full truncate text-[10px] text-setta-400 dark:text-setta-500">
                      {subLabel}
                    </span>
                  ) : null}
                </ThumbnailItem>
              );
            })}
          </div>
        </div>
      );

    case BrowserAreaViewModeEnum.carousel:
      return (
        <div
          ref={ref}
          role="region"
          aria-label="File explorer"
          className="flex min-h-0 flex-1 flex-col"
        >
          <MediaCarousel
            items={items.map((item) => {
              const previewKind = getBrowserPreviewKind(item);
              const fileUrl =
                previewKind === "image"
                  ? fileUrlMap[item.fullPath]?.url ?? null
                  : null;
              const subLabel = getItemSubLabel ? getItemSubLabel(item) : null;
              const tooltipPath = getItemTooltip ? getItemTooltip(item) : null;
              return {
                id: item.fullPath,
                label: item.name,
                subLabel,
                thumbnailUrl: fileUrl,
                imageUrl: fileUrl,
                tooltipTitle: "File path",
                tooltipContent: tooltipPath,
                data: item,
              };
            })}
            selectedId={selectedCarouselId ?? undefined}
            onSelect={(id) => onSelectCarouselId(id)}
            onThumbnailDoubleClick={(item) => {
              const data = item.data as FolderContentItem | undefined;
              if (!data) {
                return;
              }
              if (data.type.toLowerCase() === "folder") {
                onOpenFolder(data.fullPath);
                return;
              }
              onOpenFile(data);
            }}
            isThumbnailDraggable={(item) => {
              const data = item.data as FolderContentItem | undefined;
              if (!data) {
                return false;
              }
              return data.type.toLowerCase() !== "folder";
            }}
            onThumbnailDragStart={(item, event) => {
              const data = item.data as FolderContentItem | undefined;
              if (!data || data.type.toLowerCase() === "folder") {
                return;
              }
              setFileBrowserDragPayload(event.dataTransfer, {
                name: data.name,
                fullPath: data.fullPath,
                type: "file",
              });
              event.dataTransfer.effectAllowed = "copy";
            }}
            renderPreview={renderPreview}
            renderThumbnail={(item) => {
              const data = item.data as FolderContentItem | undefined;
              if (!data) {
                return null;
              }
              const previewKind = getBrowserPreviewKind(data);
              const badgeText =
                previewKind === "image" || previewKind === "folder"
                  ? null
                  : getExtensionBadge(data.name) ?? previewKind.toUpperCase();
              const thumbnailUrl =
                previewKind === "image" ? item.thumbnailUrl : null;
              return (
                <BrowserThumbnailContent
                  previewKind={previewKind}
                  thumbnailUrl={thumbnailUrl}
                  badgeText={badgeText}
                  label={item.label}
                />
              );
            }}
            renderThumbnailOverlay={() => (
              <input
                className="single-cell-child z-10 ml-1 mt-1 h-4 w-4 cursor-pointer rounded-full bg-transparent transition-colors checked:bg-blue-500 group-hover/thumbnail:bg-setta-500/70 group-hover/thumbnail:checked:bg-blue-600 dark:checked:bg-blue-700"
                type="checkbox"
                onClick={(event) => event.stopPropagation()}
              />
            )}
            showNavButtons={items.length > 1}
            thumbnailRowResizable
          />
        </div>
      );

    default:
      return view satisfies never;
  }
}
