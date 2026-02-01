import {
  FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
  FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
  FileBrowserFilter,
  FileBrowserPane,
} from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { ResizeHandle } from "components/Params/ResizeHandle";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BiSolidSelectMultiple } from "react-icons/bi";
import {
  FiArchive,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiMusic,
} from "react-icons/fi";
import { HiOutlineViewGrid } from "react-icons/hi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdBrush, MdCategory, MdDataArray, MdList } from "react-icons/md";
import { TbCarouselHorizontal, TbFolder } from "react-icons/tb";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  openFileInCodeSection,
  openFileInTextSection,
} from "state/actions/sections/createSections";
import {
  useBrowserSectionFileBrowserState,
  useProjectState,
} from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useBrowserColumnWidth } from "state/hooks/useBrowserColumnWidth";
import { useLocalPendingValue } from "state/hooks/utils";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { formatBytes } from "utils/attachments";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_file_browser_download_urls,
  route_get_file_browser_root,
  route_get_folder_contents,
  route_set_browser_area_view_mode,
} from "utils/generatedEndpoints";
import {
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
  FolderContentItem,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { clamp } from "utils/utils";

const artifactTypes = [
  // { type: "Select All" },
  { type: "Image", icon: <IoImageOutline /> },
  { type: "Video", icon: <IoVideocam /> },
  { type: "Text", icon: <FiFileText /> },
  { type: "Data", icon: <MdDataArray /> },
  { type: "Brushes", icon: <MdBrush /> },
  { type: "Other", icon: <MdCategory /> },
];

const TYPES_COLUMN_MIN_CONTAINER_WIDTH = 384;
const FILE_URL_REFRESH_BUFFER_MS = 30_000;
const TEXT_PREVIEW_CHAR_LIMIT = 4_000;
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

type BrowserFileAttachment = {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};

type FileUrlEntry = {
  url: string;
  expiresAt: number;
};

type FileTextPreview = {
  text: string;
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
};

type BrowserPreviewKind =
  | "image"
  | "pdf"
  | "audio"
  | "video"
  | "text"
  | "archive"
  | "folder"
  | "other";

type PreviewIcon = React.ComponentType<{ className?: string; size?: number }>;

const PREVIEW_KIND_ICON_MAP: Record<BrowserPreviewKind, PreviewIcon> = {
  image: IoImageOutline,
  pdf: FiFileText,
  audio: FiMusic,
  video: IoVideocam,
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
  text: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  archive:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  folder: "",
  other: "bg-setta-200 text-setta-700 dark:bg-setta-700/40 dark:text-setta-200",
};

function extractExtension(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const baseName = value.split(/[/\\]/).pop() ?? value;
  if (!baseName) {
    return null;
  }
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return null;
  }
  return baseName.slice(dotIndex).toLowerCase();
}

function getExtensionBadge(value: string | undefined): string | null {
  const extension = extractExtension(value);
  if (!extension) {
    return null;
  }
  const label = extension.replace(".", "").toUpperCase();
  if (!label) {
    return null;
  }
  return label.length > 6 ? label.slice(0, 6) : label;
}

function toBrowserAttachment(item: FolderContentItem): BrowserFileAttachment {
  return {
    id: item.fullPath,
    name: item.name,
    mimeType: null,
    size: item.size ?? null,
  };
}

function getBrowserPreviewKind(item: FolderContentItem): BrowserPreviewKind {
  if (item.type.toLowerCase() === "folder") {
    return "folder";
  }
  return getAttachmentPreviewKind(toBrowserAttachment(item));
}

function isFileUrlStale(entry: FileUrlEntry, now: number): boolean {
  return entry.expiresAt * 1000 - FILE_URL_REFRESH_BUFFER_MS <= now;
}

function getFileSizeLabel(item: FolderContentItem): string | null {
  if (item.size === undefined) {
    return null;
  }
  return formatBytes(item.size);
}

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

export function BrowserArea({ sectionId }: { sectionId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width, hideColumn, viewMode, folder } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Browser,
    );
    return {
      width:
        impl.size.width === "auto"
          ? getSectionRect(sectionId)?.width
          : impl.size.width,
      hideColumn: impl.hideColumn,
      viewMode: impl.viewMode,
      folder: impl.folder,
    };
  }, _.isEqual);
  const handleTypesColumnResizeStart = useBrowserColumnWidth({
    sectionId,
    outerRef: containerRef,
    widthKey: "typesColumnWidth",
    cssVarName: "--browser-types-column-width",
  });
  const typesColumnWidth = "var(--browser-types-column-width, 50%)";
  const handleFilesColumnResizeStart = useBrowserColumnWidth({
    sectionId,
    outerRef: containerRef,
    widthKey: "columnWidth",
    cssVarName: "--browser-column-width",
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
  const filesColumnWidth = "var(--browser-column-width, 55%)";

  return (
    <div
      className="section-main -mr-3 mb-2 mt-2 flex min-w-0 flex-col-reverse gap-2 pr-2 @sm/multipane:flex-row @sm/multipane:gap-4  @sm/multipane:overflow-visible"
      ref={containerRef}
    >
      {!hideColumn && (
        <TypesColumn
          width={width}
          columnWidth={typesColumnWidth}
          onResizeStart={handleTypesColumnResizeStart}
        />
      )}
      <ItemsColumn
        sectionId={sectionId}
        viewMode={viewMode}
        folder={folder}
        filesColumnWidth={filesColumnWidth}
        onFilesColumnResizeStart={handleFilesColumnResizeStart}
      />
    </div>
  );
}

function TypesColumn({
  width,
  columnWidth,
  onResizeStart,
}: {
  width: number;
  columnWidth: string;
  onResizeStart: React.MouseEventHandler<HTMLDivElement>;
}) {
  const { ref, isScrollable } = useIsScrollable();
  const isResizable = width > TYPES_COLUMN_MIN_CONTAINER_WIDTH;
  return (
    <article
      className="nodrag relative flex min-w-0 flex-col pr-1"
      style={isResizable ? { width: columnWidth } : undefined}
    >
      {isResizable && (
        <div className="absolute right-0 top-0 flex h-full items-center">
          <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        </div>
      )}
      <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
        Types
      </h3>

      <div
        ref={ref}
        className={`relative mb-2 mt-2 flex min-h-0 flex-col overflow-y-auto pr-1 ${isScrollable ? "nowheel" : ""}`}
      >
        {artifactTypes.map((x) => (
          <CheckboxNextToLabel key={x.type} icon={x.icon}>
            <p className="truncate">{x.type}</p>
          </CheckboxNextToLabel>
        ))}
      </div>
      <button className="nodrag mt-auto flex min-w-0 cursor-pointer select-none items-center justify-center gap-1 rounded-md border border-solid border-setta-100 px-2 py-2 text-xs font-bold uppercase leading-none text-setta-400 outline-none transition-colors duration-150 hover:bg-setta-50 focus-visible:!border-blue-500 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-400">
        <BiSolidSelectMultiple />
        Select All
      </button>
    </article>
  );
}

function ViewSelectorButton({
  view,
  setView,
  viewType,
  children,
}: {
  view: BrowserAreaViewMode;
  setView: (newView: BrowserAreaViewMode) => void;
  viewType: BrowserAreaViewMode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={() => {
        setView(viewType);
      }}
      className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-md p-1  hover:bg-setta-50  dark:hover:bg-setta-800 ${view === viewType ? "bg-blue-100 text-blue-600 dark:bg-transparent dark:text-blue-600" : "bg-transparent text-setta-400 dark:text-setta-500"}`}
    >
      {children}
    </button>
  );
}

function ViewSelector({
  view,
  setView,
}: {
  view: BrowserAreaViewMode;
  setView: (newView: BrowserAreaViewMode) => void;
}) {
  return (
    <div className="flex gap-0.5">
      <ViewSelectorButton view={view} setView={setView} viewType="list">
        <MdList />
      </ViewSelectorButton>
      <ViewSelectorButton view={view} setView={setView} viewType="thumbnail">
        <HiOutlineViewGrid />
      </ViewSelectorButton>
      <ViewSelectorButton view={view} setView={setView} viewType="carousel">
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
}: {
  size: string;
  thumbnailUrl?: string | null;
  previewKind: BrowserPreviewKind;
  badgeText?: string | null;
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className="group/thumbnail flex cursor-pointer flex-col items-center gap-1"
      style={{ width: size }}
      onClick={onClick}
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
        ></input>
      </div>
      <p className="w-full break-words text-center text-xs text-setta-600 group-hover/thumbnail:text-setta-900 dark:text-setta-200 group-hover/thumbnail:dark:text-white">
        {children}
      </p>
    </div>
  );
}

function ViewSwitch({
  view,
  items,
  filesColumnWidth,
  onFilesColumnResizeStart,
  fileUrlMap,
  selectedCarouselId,
  onSelectCarouselId,
  textPreviewMap,
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
  onOpenFolder: (path: string) => void;
  onOpenFile: (item: FolderContentItem) => void;
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
        <section
          aria-label="File explorer"
          className="flex min-h-0 flex-1 flex-col"
        >
          <FileBrowserPane
            useFileBrowserStateHook={useBrowserSectionFileBrowserState}
            showFilter={false}
            columnWidthConfig={{
              columnWidth: filesColumnWidth,
              onResizeStart: onFilesColumnResizeStart,
            }}
          />
        </section>
      );

    case BrowserAreaViewModeEnum.thumbnail:
      return (
        <div
          ref={ref}
          className={`nodrag h-full w-full overflow-y-auto overflow-x-hidden ${isScrollable ? "nowheel" : ""}`}
        >
          <div className="grid w-max max-w-full grid-flow-row auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 ">
            {items.map((item) => {
              const previewKind = getBrowserPreviewKind(item);
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
              return (
                <ThumbnailItem
                  key={item.fullPath}
                  previewKind={previewKind}
                  badgeText={badgeText}
                  thumbnailUrl={thumbnailUrl}
                  label={item.name}
                  onClick={handleClick}
                >
                  {item.name}
                </ThumbnailItem>
              );
            })}
          </div>
        </div>
      );

    case BrowserAreaViewModeEnum.carousel:
      return (
        <MediaCarousel
          items={items.map((item) => {
            const previewKind = getBrowserPreviewKind(item);
            const fileUrl =
              previewKind === "image"
                ? fileUrlMap[item.fullPath]?.url ?? null
                : null;
            return {
              id: item.fullPath,
              label: item.name,
              thumbnailUrl: fileUrl,
              imageUrl: fileUrl,
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
        />
      );

    default:
      return view satisfies never;
  }
}

function ItemsColumn({
  sectionId,
  viewMode,
  folder,
  filesColumnWidth,
  onFilesColumnResizeStart,
}: {
  sectionId: string;
  viewMode: BrowserAreaViewMode;
  folder: string;
  filesColumnWidth: string;
  onFilesColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
}) {
  const [value, setValue] = useLocalPendingValue(viewMode);
  const [items, setItems] = useState<Array<FolderContentItem>>([]);
  const [fileUrlMap, setFileUrlMap] = useState<Record<string, FileUrlEntry>>(
    {},
  );
  const fileUrlRequests = useRef<Set<string>>(new Set());
  const [selectedCarouselId, setSelectedCarouselId] = useState<string | null>(
    null,
  );
  const [textPreviewMap, setTextPreviewMap] = useState<
    Record<string, FileTextPreview>
  >({});
  const [rootInfo, setRootInfo] = useState<{
    rootPath: string;
    ignorePatterns: string[];
  } | null>(null);
  const [localFolder, setLocalFolder] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<{
    entries: string[];
    index: number;
  }>({ entries: [], index: -1 });
  const rootRequestIdRef = useRef(0);
  const folderRequestIdRef = useRef(0);
  const historyStateRef = useRef(historyState);
  const historySkipRef = useRef(false);
  const isListView = value === BrowserAreaViewModeEnum.list;
  const trimmedFolder = folder.trim();
  const effectiveFolder =
    localFolder ?? (trimmedFolder ? trimmedFolder : rootInfo?.rootPath ?? "");
  const selectedCarouselItem = useMemo(() => {
    if (!selectedCarouselId) {
      return null;
    }
    return items.find((item) => item.fullPath === selectedCarouselId) ?? null;
  }, [items, selectedCarouselId]);

  useEffect(() => {
    const trimmed = folder.trim();
    if (!trimmed) {
      return;
    }
    setLocalFolder(trimmed);
  }, [folder]);

  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);

  useEffect(() => {
    if (isListView) {
      return;
    }
    if (!effectiveFolder) {
      return;
    }
    if (historySkipRef.current) {
      historySkipRef.current = false;
      return;
    }
    const normalized = effectiveFolder.trim();
    if (!normalized) {
      return;
    }
    setHistoryState((prev) => {
      const current = prev.entries[prev.index];
      if (current === normalized) {
        return prev;
      }
      const nextEntries = prev.entries.slice(0, prev.index + 1);
      nextEntries.push(normalized);
      return { entries: nextEntries, index: nextEntries.length - 1 };
    });
  }, [effectiveFolder, isListView]);

  const requestFileUrls = useCallback(
    async (paths: string[], options: { force?: boolean } = {}) => {
      if (paths.length === 0) {
        return {};
      }
      const now = Date.now();
      const pending = paths.filter((path) => {
        const entry = fileUrlMap[path];
        if (!options.force && entry && !isFileUrlStale(entry, now)) {
          return false;
        }
        if (fileUrlRequests.current.has(path)) {
          return false;
        }
        return true;
      });
      if (pending.length === 0) {
        return {};
      }
      for (const path of pending) {
        fileUrlRequests.current.add(path);
      }
      const res = await route_get_file_browser_download_urls({
        paths: pending,
      });
      for (const path of pending) {
        fileUrlRequests.current.delete(path);
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        console.warn("Failed to load file preview URLs", detail ?? pending);
        return {};
      }
      const nextEntries: Record<string, FileUrlEntry> = {};
      for (const entry of res.data) {
        nextEntries[entry.path] = {
          url: entry.url,
          expiresAt: entry.expiresAt,
        };
      }
      setFileUrlMap((prev) => ({ ...prev, ...nextEntries }));
      return nextEntries;
    },
    [fileUrlMap],
  );

  const requestTextPreview = useCallback(
    async (item: FolderContentItem) => {
      if (item.size && item.size > TEXT_PREVIEW_MAX_BYTES) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview disabled for large files.",
          },
        }));
        return;
      }
      const existing = textPreviewMap[item.fullPath];
      if (existing && (existing.isLoading || existing.text || existing.error)) {
        return;
      }
      setTextPreviewMap((prev) => ({
        ...prev,
        [item.fullPath]: {
          text: "",
          truncated: false,
          isLoading: true,
          error: null,
        },
      }));
      let entry = fileUrlMap[item.fullPath];
      if (!entry || isFileUrlStale(entry, Date.now())) {
        const refreshed = await requestFileUrls([item.fullPath], {
          force: true,
        });
        entry = refreshed[item.fullPath] ?? fileUrlMap[item.fullPath];
      }
      if (!entry?.url) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      let response: Response;
      try {
        response = await fetch(entry.url);
      } catch {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      if (!response.ok) {
        setTextPreviewMap((prev) => ({
          ...prev,
          [item.fullPath]: {
            text: "",
            truncated: false,
            isLoading: false,
            error: "Preview unavailable.",
          },
        }));
        return;
      }
      const text = await response.text();
      const truncated = text.length > TEXT_PREVIEW_CHAR_LIMIT;
      const previewText = truncated
        ? text.slice(0, TEXT_PREVIEW_CHAR_LIMIT)
        : text;
      setTextPreviewMap((prev) => ({
        ...prev,
        [item.fullPath]: {
          text: previewText,
          truncated,
          isLoading: false,
          error: null,
        },
      }));
    },
    [fileUrlMap, requestFileUrls, textPreviewMap],
  );

  const loadFolderContents = useCallback(
    async (folderPath: string) => {
      const trimmed = folderPath.trim();
      if (!trimmed) {
        setItems([]);
        return;
      }
      const requestId = folderRequestIdRef.current + 1;
      folderRequestIdRef.current = requestId;
      const res = await route_get_folder_contents({
        folderPath: trimmed,
        ignorePatterns: rootInfo?.ignorePatterns ?? null,
        includeSize: true,
      });
      if (folderRequestIdRef.current !== requestId) {
        return;
      }
      if (res200(res)) {
        setItems(res.data);
      } else {
        setItems([]);
      }
    },
    [rootInfo?.ignorePatterns],
  );

  function setView(newView: BrowserAreaViewMode) {
    setValue(newView);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"BrowserSection">(state, sectionId, {
          viewMode: newView,
        });
      },
      send: (frontendOpId) =>
        route_set_browser_area_view_mode({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          viewMode: newView,
          frontendOpId,
        }),
    });
  }

  const setFolder = useCallback(
    async (newFolder: string) => {
      const trimmed = newFolder.trim();
      if (!trimmed) {
        setLocalFolder(null);
        setItems([]);
        return;
      }
      setLocalFolder(trimmed);
      await loadFolderContents(trimmed);
    },
    [loadFolderContents],
  );

  useEffect(() => {
    if (value !== BrowserAreaViewModeEnum.carousel) {
      setSelectedCarouselId(null);
      return;
    }
    if (items.length === 0) {
      setSelectedCarouselId(null);
      return;
    }
    if (
      selectedCarouselId &&
      items.some((item) => item.fullPath === selectedCarouselId)
    ) {
      return;
    }
    const preferred =
      items.find((item) => getBrowserPreviewKind(item) === "image") ?? items[0];
    if (preferred) {
      setSelectedCarouselId(preferred.fullPath);
    }
  }, [items, selectedCarouselId, value]);

  useEffect(() => {
    if (isListView) {
      return;
    }
    const filePaths = items
      .filter((item) => item.type.toLowerCase() === "file")
      .map((item) => item.fullPath);
    if (filePaths.length === 0) {
      return;
    }
    void requestFileUrls(filePaths);
  }, [isListView, items, requestFileUrls]);

  useEffect(() => {
    if (value !== BrowserAreaViewModeEnum.carousel) {
      return;
    }
    if (!selectedCarouselItem) {
      return;
    }
    if (getBrowserPreviewKind(selectedCarouselItem) !== "text") {
      return;
    }
    void requestTextPreview(selectedCarouselItem);
  }, [requestTextPreview, selectedCarouselItem, value]);

  const handleOpenFolder = useCallback(
    (path: string) => {
      void setFolder(path);
    },
    [setFolder],
  );

  const handleOpenFile = useCallback(
    (item: FolderContentItem) => {
      if (item.type.toLowerCase() === "folder") {
        return;
      }
      const extension = extractExtension(item.name);
      const isMarkdown = extension === ".md" || extension === ".markdown";
      const isPlaintext = extension === ".txt";
      if (!isMarkdown && !isPlaintext) {
        void openFileInCodeSection({
          filePath: item.fullPath,
          fileName: item.name,
          codeLanguage: resolveCodeLanguageFromPath(item.fullPath),
        });
        return;
      }
      const loadAndOpenText = async () => {
        let entry = fileUrlMap[item.fullPath];
        if (!entry || isFileUrlStale(entry, Date.now())) {
          const refreshed = await requestFileUrls([item.fullPath], {
            force: true,
          });
          entry = refreshed[item.fullPath] ?? fileUrlMap[item.fullPath];
        }
        if (!entry?.url) {
          void openFileInCodeSection({
            filePath: item.fullPath,
            fileName: item.name,
            codeLanguage: resolveCodeLanguageFromPath(item.fullPath),
          });
          return;
        }
        let response: Response;
        try {
          response = await fetch(entry.url);
        } catch {
          void openFileInCodeSection({
            filePath: item.fullPath,
            fileName: item.name,
            codeLanguage: resolveCodeLanguageFromPath(item.fullPath),
          });
          return;
        }
        if (!response.ok) {
          void openFileInCodeSection({
            filePath: item.fullPath,
            fileName: item.name,
            codeLanguage: resolveCodeLanguageFromPath(item.fullPath),
          });
          return;
        }
        const text = await response.text();
        void openFileInTextSection({
          fileName: item.name,
          text,
          format: isMarkdown
            ? TextBlockFormatEnum.Markdown
            : TextBlockFormatEnum.Plaintext,
          textDisplayMode: isMarkdown
            ? TextBlockDisplayModeEnum.Render
            : TextBlockDisplayModeEnum.Edit,
        });
      };
      void loadAndOpenText();
    },
    [
      fileUrlMap,
      openFileInCodeSection,
      openFileInTextSection,
      requestFileUrls,
      resolveCodeLanguageFromPath,
    ],
  );

  const canGoBack = historyState.index > 0;
  const canGoForward =
    historyState.index >= 0 &&
    historyState.index < historyState.entries.length - 1;

  const handleGoBack = useCallback(() => {
    const current = historyStateRef.current;
    if (current.index <= 0) {
      return;
    }
    const nextIndex = current.index - 1;
    const nextFolder = current.entries[nextIndex];
    if (!nextFolder) {
      return;
    }
    historySkipRef.current = true;
    setHistoryState({ entries: current.entries, index: nextIndex });
    void setFolder(nextFolder);
  }, [setFolder]);

  const handleGoForward = useCallback(() => {
    const current = historyStateRef.current;
    if (current.index < 0 || current.index >= current.entries.length - 1) {
      return;
    }
    const nextIndex = current.index + 1;
    const nextFolder = current.entries[nextIndex];
    if (!nextFolder) {
      return;
    }
    historySkipRef.current = true;
    setHistoryState({ entries: current.entries, index: nextIndex });
    void setFolder(nextFolder);
  }, [setFolder]);

  useEffect(() => {
    if (isListView || rootInfo) {
      return;
    }
    const requestId = rootRequestIdRef.current + 1;
    rootRequestIdRef.current = requestId;
    const loadRoot = async () => {
      const res = await route_get_file_browser_root();
      if (!res200(res)) {
        return;
      }
      if (rootRequestIdRef.current !== requestId) {
        return;
      }
      setRootInfo({
        rootPath: res.data.rootPath,
        ignorePatterns: res.data.ignorePatterns,
      });
    };
    void loadRoot();
  }, [isListView, rootInfo]);

  useEffect(() => {
    if (isListView) {
      return;
    }
    void loadFolderContents(effectiveFolder);
  }, [effectiveFolder, isListView, loadFolderContents]);

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col">
      <div className="-mt-[4.5px] mb-1 flex flex-row items-center gap-2">
        <div className="flex w-full min-w-0 items-center gap-2">
          {isListView ? (
            <FileBrowserFilter
              useFileBrowserStateHook={useBrowserSectionFileBrowserState}
            />
          ) : (
            <>
              <FolderHistoryControls
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                onBack={handleGoBack}
                onForward={handleGoForward}
              />
              <FolderPath folder={effectiveFolder} setFolder={setFolder} />
            </>
          )}
        </div>
        <ViewSelector view={value} setView={setView} />
      </div>
      <ViewSwitch
        view={value}
        items={items}
        filesColumnWidth={filesColumnWidth}
        onFilesColumnResizeStart={onFilesColumnResizeStart}
        fileUrlMap={fileUrlMap}
        selectedCarouselId={selectedCarouselId}
        onSelectCarouselId={setSelectedCarouselId}
        textPreviewMap={textPreviewMap}
        onOpenFolder={handleOpenFolder}
        onOpenFile={handleOpenFile}
      />
    </div>
  );
}

function CheckboxNextToLabel({
  children,
  checked,
  shown,
  onChange,
  onClick,
  onMouseEnter,
  icon,
}) {
  return (
    <li
      className="group/checkboxlabel flex justify-between"
      // onMouseEnter={onMouseEnter}
    >
      <label
        className={`flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-xs text-setta-700  group-hover/checkboxlabel:!text-blue-500 dark:text-setta-200`}
      >
        <input
          type="checkbox"
          className={
            icon
              ? "peer sr-only"
              : "h-[12px] w-[12px] min-w-[12px] cursor-pointer rounded-sm bg-setta-500/15 outline-offset-2 outline-blue-500 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500 focus-visible:outline"
          }
          // checked={checked}
          // onChange={onChange}
        />
        {icon && <i className="peer-checked:text-blue-600">{icon}</i>}

        {children}
      </label>
    </li>
  );
}

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-4 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";

  return (
    <StandardSearch
      leftElement={
        <i className="gg-sort-az mb-[2px] !scale-50 text-setta-400" />
      }
      placeholder="Filter"
      inputStyles={inputStyles}
      outerClasses="flex-1"
    />
  );
}

function FolderHistoryControls({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const baseClassName =
    "nodrag inline-flex h-7 w-7 items-center justify-center rounded-md border border-solid border-setta-100 text-setta-400 transition-colors duration-150 hover:bg-setta-50 focus-visible:!border-blue-500 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-800";
  const disabledClassName =
    "cursor-default opacity-40 hover:bg-transparent dark:hover:bg-transparent";
  const backClassName = `${baseClassName} ${canGoBack ? "" : disabledClassName}`;
  const forwardClassName = `${baseClassName} ${
    canGoForward ? "" : disabledClassName
  }`;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={backClassName}
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="Go back"
      >
        <FiChevronLeft size={16} />
      </button>
      <button
        type="button"
        className={forwardClassName}
        onClick={onForward}
        disabled={!canGoForward}
        aria-label="Go forward"
      >
        <FiChevronRight size={16} />
      </button>
    </div>
  );
}

function FolderPath({
  folder,
  setFolder,
}: {
  folder: string;
  setFolder: (newFolder: string) => void;
}) {
  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    folder,
    setFolder,
    () => true,
  );

  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-4 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";

  return (
    <search
      className={
        "nodrag relative mx-[2px] flex min-w-0 flex-1 items-center dark:text-setta-200"
      }
    >
      <input
        className={inputStyles}
        value={inputValue}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
    </search>
  );
}
