import { FileBrowserPane } from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
import type { FilebrowserFolderContentItem as FolderContentItem } from "openapi/http";
import {
  Suspense,
  lazy,
  useCallback,
  type ComponentType,
  type DragEventHandler,
  type HTMLAttributes,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { FiArchive, FiColumns, FiFileText, FiMusic } from "react-icons/fi";
import { HiOutlineViewGrid } from "react-icons/hi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdList } from "react-icons/md";
import { TbCarouselHorizontal, TbFolder } from "react-icons/tb";
import { useBrowserSectionFileBrowserState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { setFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import {
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
} from "utils/generatedTypes";
import {
  BrowserPreviewKind,
  FileTextPreview,
  FileUrlEntry,
  OpenableBrowserItem,
  PDF_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_MAX_BYTES,
  getBrowserPreviewKind,
  getExtensionBadge,
  getFileSizeLabel,
} from "./browserAreaShared";

const LazyFileBrowserSpreadsheetEditor = lazy(async () => {
  const module = await import(
    "components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor"
  );
  return { default: module.FileBrowserSpreadsheetEditor };
});

type BrowserAreaViewSelectorProps = {
  view: BrowserAreaViewMode;
  setView: (newView: BrowserAreaViewMode) => void;
};

type BrowserAreaViewSwitchProps = {
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
};

type BrowserThumbnailContentProps = {
  previewKind: BrowserPreviewKind;
  thumbnailUrl?: string | null;
  badgeText?: string | null;
  label: string;
};

type FilePreviewContentProps = {
  item: FolderContentItem;
  fileUrlMap: Record<string, FileUrlEntry>;
  textPreviewMap: Record<string, FileTextPreview>;
};

type FilePreviewRendererArgs = {
  item: FolderContentItem;
  fileUrl: string;
  textPreviewMap: Record<string, FileTextPreview>;
  previewKind: BrowserPreviewKind;
};

type PreviewIcon = ComponentType<{
  className?: string;
  size?: number;
}>;

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
}: BrowserThumbnailContentProps) {
  if (previewKind === "image" && thumbnailUrl) {
    return (
      <>
        <img
          src={thumbnailUrl}
          alt={label}
          className="single-cell-child h-full w-full object-cover"
          loading="lazy"
        />
        {badgeText ? (
          <span className="single-cell-child absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm">
            {badgeText}
          </span>
        ) : null}
      </>
    );
  }
  const PreviewIconComponent = PREVIEW_KIND_ICON_MAP[previewKind];
  const iconClassName = PREVIEW_KIND_ICON_CLASS_MAP[previewKind];
  const badgeClassName = PREVIEW_KIND_BADGE_CLASS_MAP[previewKind];
  return (
    <>
      <div
        className={`single-cell-child flex h-full w-full items-center justify-center ${iconClassName}`}
      >
        <PreviewIconComponent size={36} />
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
  const isActive = view === viewType;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`nodrag flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        isActive
          ? "bg-setta-100 text-setta-700 dark:bg-setta-800 dark:text-setta-100"
          : "text-setta-400 hover:bg-setta-50 hover:text-setta-700 dark:text-setta-500 dark:hover:bg-setta-900 dark:hover:text-setta-200"
      }`}
      onClick={() => setView(viewType)}
    >
      {children}
    </button>
  );
}

export function ViewSelector({ view, setView }: BrowserAreaViewSelectorProps) {
  return (
    <div className="nodrag flex items-center rounded-md border border-solid border-setta-100 p-0.5 dark:border-setta-800">
      <ViewSelectorButton
        view={view}
        setView={setView}
        viewType={BrowserAreaViewModeEnum.list}
        ariaLabel="List view"
      >
        <MdList size={18} />
      </ViewSelectorButton>
      <ViewSelectorButton
        view={view}
        setView={setView}
        viewType={BrowserAreaViewModeEnum.thumbnail}
        ariaLabel="Thumbnail view"
      >
        <HiOutlineViewGrid size={18} />
      </ViewSelectorButton>
      <ViewSelectorButton
        view={view}
        setView={setView}
        viewType={BrowserAreaViewModeEnum.carousel}
        ariaLabel="Carousel view"
      >
        <TbCarouselHorizontal size={18} />
      </ViewSelectorButton>
    </div>
  );
}

function FilePreviewCard({
  item,
  icon,
  description,
}: {
  item: FolderContentItem;
  icon: ReactNode;
  description?: string;
}) {
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
}

function LoadingPreview({ icon }: { icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 text-sm text-setta-400 dark:text-setta-500">
      {icon}
      <span>Loading preview...</span>
    </div>
  );
}

function FolderPreview({
  item,
  onOpenFolder,
}: {
  item: FolderContentItem;
  onOpenFolder: (path: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-sm text-setta-500 dark:text-setta-300">
      <div className="text-setta-400 dark:text-setta-500">
        <TbFolder size={40} />
      </div>
      <span className="max-w-[70%] truncate text-center text-setta-700 dark:text-setta-200">
        {item.name}
      </span>
      <button
        type="button"
        className="rounded-md border border-solid border-setta-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-setta-500 transition hover:bg-setta-100 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
        onClick={() => onOpenFolder(item.fullPath)}
      >
        Open folder
      </button>
    </div>
  );
}

function TextPreviewContent({
  item,
  preview,
}: {
  item: FolderContentItem;
  preview: FileTextPreview | undefined;
}) {
  if (item.size && item.size > TEXT_PREVIEW_MAX_BYTES) {
    return (
      <FilePreviewCard
        item={item}
        icon={<FiFileText size={40} />}
        description="Preview disabled for large files."
      />
    );
  }
  if (!preview || preview.isLoading) {
    return <LoadingPreview icon={<FiFileText size={40} />} />;
  }
  if (preview.error) {
    return (
      <FilePreviewCard
        item={item}
        icon={<FiFileText size={40} />}
        description={preview.error}
      />
    );
  }
  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="h-full w-full overflow-hidden rounded-md border border-setta-200/60 bg-white/70 dark:border-setta-700 dark:bg-setta-900/60">
        <pre className="h-full w-full overflow-auto p-4 text-xs leading-relaxed text-setta-700 dark:text-setta-200">
          {preview.text || ""}
        </pre>
      </div>
      {preview.truncated ? (
        <div className="text-[11px] text-setta-400">Preview truncated.</div>
      ) : null}
    </div>
  );
}

function SpreadsheetPreview({ item }: { item: FolderContentItem }) {
  return (
    <div
      className="h-full min-h-0 w-full"
      data-gpu-flow-control="browser-spreadsheet-preview"
    >
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
            Loading spreadsheet...
          </div>
        }
      >
        <LazyFileBrowserSpreadsheetEditor
          selectedFile={{
            name: item.name,
            fullPath: item.fullPath,
          }}
        />
      </Suspense>
    </div>
  );
}

function PdfPreview({
  item,
  fileUrl,
}: {
  item: FolderContentItem;
  fileUrl: string;
}) {
  if (item.size && item.size > PDF_PREVIEW_MAX_BYTES) {
    return (
      <FilePreviewCard
        item={item}
        icon={<FiFileText size={40} />}
        description="Preview disabled for large PDFs."
      />
    );
  }
  if (!fileUrl) {
    return (
      <FilePreviewCard
        item={item}
        icon={<FiFileText size={40} />}
        description="Preview unavailable."
      />
    );
  }
  return (
    <iframe
      src={fileUrl}
      title={item.name}
      className="h-full w-full rounded-md border border-setta-200/60 bg-white dark:border-setta-700 dark:bg-setta-900"
      data-gpu-flow-control="browser-pdf-preview"
    />
  );
}

function MediaPreview({
  item,
  fileUrl,
  previewKind,
}: {
  item: FolderContentItem;
  fileUrl: string;
  previewKind: BrowserPreviewKind;
}) {
  if (!fileUrl) {
    const icon =
      previewKind === "audio" ? (
        <FiMusic size={40} />
      ) : (
        <IoVideocam size={40} />
      );
    return (
      <FilePreviewCard
        item={item}
        icon={icon}
        description="Preview unavailable."
      />
    );
  }
  if (previewKind === "audio") {
    return (
      <audio
        controls
        className="w-full"
        data-gpu-flow-control="browser-audio-preview"
      >
        <source src={fileUrl} />
      </audio>
    );
  }
  return (
    <video
      controls
      className="h-full w-full rounded-md bg-black/80"
      data-gpu-flow-control="browser-video-preview"
    >
      <source src={fileUrl} />
    </video>
  );
}

function GenericPreview({ item }: { item: FolderContentItem }) {
  const previewKind = getBrowserPreviewKind(item);
  const icon =
    previewKind === "archive" ? (
      <FiArchive size={40} />
    ) : (
      <FiFileText size={40} />
    );
  return <FilePreviewCard item={item} icon={icon} />;
}

function ImagePreview({
  item,
  fileUrl,
}: {
  item: FolderContentItem;
  fileUrl: string;
}) {
  return fileUrl ? (
    <div className="relative h-full w-full">
      <img
        src={fileUrl}
        alt={item.name}
        className="h-full w-full object-contain"
        data-gpu-flow-control="browser-image-preview"
        loading="lazy"
      />
    </div>
  ) : (
    <LoadingPreview icon={<IoImageOutline size={40} />} />
  );
}

function renderTextPreview({ item, textPreviewMap }: FilePreviewRendererArgs) {
  return (
    <TextPreviewContent item={item} preview={textPreviewMap[item.fullPath]} />
  );
}

function renderSpreadsheetPreview({ item }: FilePreviewRendererArgs) {
  return <SpreadsheetPreview item={item} />;
}

function renderPdfPreview({ item, fileUrl }: FilePreviewRendererArgs) {
  return <PdfPreview item={item} fileUrl={fileUrl} />;
}

function renderMediaPreview({
  item,
  fileUrl,
  previewKind,
}: FilePreviewRendererArgs) {
  return (
    <MediaPreview item={item} fileUrl={fileUrl} previewKind={previewKind} />
  );
}

function renderGenericPreview({ item }: FilePreviewRendererArgs) {
  return <GenericPreview item={item} />;
}

const FILE_PREVIEW_RENDERERS: Partial<
  Record<BrowserPreviewKind, (args: FilePreviewRendererArgs) => ReactNode>
> = {
  image: ({ item, fileUrl }) => <ImagePreview item={item} fileUrl={fileUrl} />,
  text: renderTextPreview,
  spreadsheet: renderSpreadsheetPreview,
  pdf: renderPdfPreview,
  audio: renderMediaPreview,
  video: renderMediaPreview,
};

function FilePreviewContent({
  item,
  fileUrlMap,
  textPreviewMap,
}: FilePreviewContentProps) {
  const previewKind = getBrowserPreviewKind(item);
  const renderPreview =
    FILE_PREVIEW_RENDERERS[previewKind] ?? renderGenericPreview;
  return renderPreview({
    item,
    fileUrl: fileUrlMap[item.fullPath]?.url ?? "",
    textPreviewMap,
    previewKind,
  });
}

function CarouselPreview({
  item,
  fileUrlMap,
  textPreviewMap,
  onOpenFolder,
}: {
  item: MediaCarouselItem<FolderContentItem>;
  fileUrlMap: Record<string, FileUrlEntry>;
  textPreviewMap: Record<string, FileTextPreview>;
  onOpenFolder: (path: string) => void;
}) {
  const data = item.data;
  if (!data) {
    return <LoadingPreview icon={<IoImageOutline size={40} />} />;
  }
  if (data.type.toLowerCase() === "folder") {
    return <FolderPreview item={data} onOpenFolder={onOpenFolder} />;
  }
  return (
    <FilePreviewContent
      item={data}
      fileUrlMap={fileUrlMap}
      textPreviewMap={textPreviewMap}
    />
  );
}

function ThumbnailItem({
  itemPath,
  previewKind,
  badgeText,
  thumbnailUrl,
  label,
  children,
  draggable = false,
  ...divProps
}: {
  itemPath: string;
  previewKind: BrowserPreviewKind;
  badgeText?: string | null;
  thumbnailUrl?: string | null;
  label: string;
  children?: ReactNode;
  draggable?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      key={itemPath}
      className="group/thumbnail flex w-full max-w-[128px] cursor-pointer select-none flex-col gap-2 overflow-hidden rounded-xl px-2 py-2 transition-colors hover:bg-setta-50 dark:hover:bg-setta-900"
      draggable={draggable}
      {...divProps}
    >
      <div className="grid h-[96px] w-full grid-cols-1 grid-rows-1 overflow-hidden rounded-lg bg-setta-100/80 dark:bg-setta-900/60">
        <BrowserThumbnailContent
          previewKind={previewKind}
          thumbnailUrl={thumbnailUrl}
          badgeText={badgeText}
          label={label}
        />
      </div>
      <p className="w-full break-words text-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
        {children}
      </p>
    </div>
  );
}

function getThumbnailBadgeText(
  previewKind: BrowserPreviewKind,
  name: string,
): string | null {
  return previewKind === "image" || previewKind === "folder"
    ? null
    : getExtensionBadge(name) ?? previewKind.toUpperCase();
}

function getThumbnailUrl(
  previewKind: BrowserPreviewKind,
  item: FolderContentItem,
  fileUrlMap: Record<string, FileUrlEntry>,
): string | null {
  return previewKind === "image"
    ? fileUrlMap[item.fullPath]?.url ?? null
    : null;
}

function createThumbnailClickHandler(
  item: FolderContentItem,
  previewKind: BrowserPreviewKind,
  onOpenFolder: (path: string) => void,
  onOpenFile: (item: OpenableBrowserItem) => void,
): MouseEventHandler<HTMLDivElement> {
  if (previewKind === "folder") {
    return () => onOpenFolder(item.fullPath);
  }
  return (event: MouseEvent<HTMLDivElement>) => {
    if (event.detail !== 2) {
      return;
    }
    onOpenFile(item);
  };
}

function createThumbnailDragHandler(
  item: FolderContentItem,
  previewKind: BrowserPreviewKind,
): DragEventHandler<HTMLDivElement> | undefined {
  if (previewKind === "folder") {
    return undefined;
  }
  return (event) => {
    setFileBrowserDragPayload(event.dataTransfer, {
      name: item.name,
      fullPath: item.fullPath,
      type: item.type === "folder" ? "folder" : "file",
    });
    event.dataTransfer.effectAllowed = "copy";
  };
}

function getThumbnailTooltipHandlers(tooltipPath: string | null) {
  return tooltipPath
    ? getFloatingBoxHandlers({
        title: "File path",
        content: tooltipPath,
      })
    : null;
}

function ThumbnailGridItem({
  item,
  fileUrlMap,
  getItemSubLabel,
  getItemTooltip,
  onOpenFolder,
  onOpenFile,
}: {
  item: FolderContentItem;
  fileUrlMap: Record<string, FileUrlEntry>;
  getItemSubLabel?: (item: FolderContentItem) => string | null;
  getItemTooltip?: (item: FolderContentItem) => string | null;
  onOpenFolder: (path: string) => void;
  onOpenFile: (item: OpenableBrowserItem) => void;
}) {
  const previewKind = getBrowserPreviewKind(item);
  const subLabel = getItemSubLabel ? getItemSubLabel(item) : null;
  const tooltipPath = getItemTooltip ? getItemTooltip(item) : null;
  const tooltipHandlers = getThumbnailTooltipHandlers(tooltipPath);
  return (
    <ThumbnailItem
      itemPath={item.fullPath}
      previewKind={previewKind}
      badgeText={getThumbnailBadgeText(previewKind, item.name)}
      thumbnailUrl={getThumbnailUrl(previewKind, item, fileUrlMap)}
      label={item.name}
      onClick={createThumbnailClickHandler(
        item,
        previewKind,
        onOpenFolder,
        onOpenFile,
      )}
      draggable={previewKind !== "folder"}
      onDragStart={createThumbnailDragHandler(item, previewKind)}
      {...(tooltipHandlers ?? {})}
    >
      <span className="block w-full break-words">{item.name}</span>
      {subLabel ? (
        <span className="mt-1 block w-full truncate text-[11px] text-setta-400 dark:text-setta-500">
          {subLabel}
        </span>
      ) : null}
    </ThumbnailItem>
  );
}

function CarouselThumbnail({
  item,
}: {
  item: MediaCarouselItem<FolderContentItem>;
}) {
  const data = item.data as FolderContentItem | undefined;
  if (!data) {
    return null;
  }
  const previewKind = getBrowserPreviewKind(data);
  const badgeText =
    previewKind === "image" || previewKind === "folder"
      ? null
      : getExtensionBadge(data.name) ?? previewKind.toUpperCase();
  const thumbnailUrl = previewKind === "image" ? item.thumbnailUrl : null;
  return (
    <BrowserThumbnailContent
      previewKind={previewKind}
      thumbnailUrl={thumbnailUrl}
      badgeText={badgeText}
      label={item.label}
    />
  );
}

export function ViewSwitch({
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
}: BrowserAreaViewSwitchProps) {
  const { ref, isScrollable } = useIsScrollable();
  const renderPreview = useCallback(
    (item: MediaCarouselItem<FolderContentItem>) => (
      <CarouselPreview
        item={item}
        fileUrlMap={fileUrlMap}
        textPreviewMap={textPreviewMap}
        onOpenFolder={onOpenFolder}
      />
    ),
    [fileUrlMap, onOpenFolder, textPreviewMap],
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
            allowOutsideWorkspaceRoot
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
            {items.map((item) => (
              <ThumbnailGridItem
                key={item.fullPath}
                item={item}
                fileUrlMap={fileUrlMap}
                getItemSubLabel={getItemSubLabel}
                getItemTooltip={getItemTooltip}
                onOpenFolder={onOpenFolder}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        </div>
      );
    case BrowserAreaViewModeEnum.carousel:
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-setta-50/50 dark:bg-setta-950/40">
          <MediaCarousel
            items={items.map((item) => ({
              id: item.fullPath,
              label: item.name,
              thumbnailUrl:
                getBrowserPreviewKind(item) === "image"
                  ? fileUrlMap[item.fullPath]?.url ?? null
                  : null,
              data: item,
            }))}
            selectedId={selectedCarouselId}
            onSelect={onSelectCarouselId}
            onItemOpen={(item) => {
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
            renderThumbnail={(item) => <CarouselThumbnail item={item} />}
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
