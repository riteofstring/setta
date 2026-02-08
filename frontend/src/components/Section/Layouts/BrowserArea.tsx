import {
  FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
  FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
  FileBrowserFilter,
  FileBrowserPane,
} from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { ResizeHandle } from "components/Params/ResizeHandle";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  MediaCarousel,
  type MediaCarouselItem,
} from "components/Utils/MediaCarousel";
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
import { MdDataArray, MdList } from "react-icons/md";
import { TbCarouselHorizontal, TbFolder } from "react-icons/tb";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  openFileInCodeSection,
  openFileInImageSection,
  openFileInTextSection,
} from "state/actions/sections/createSections";
import {
  useBrowserSectionFileBrowserState,
  useProjectState,
} from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import { useBrowserColumnWidth } from "state/hooks/useBrowserColumnWidth";
import { useLocalPendingValue } from "state/hooks/utils";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { formatBytes } from "utils/attachments";
import { resolvePathWithinRoot } from "utils/browserPaths";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
} from "utils/constants";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  filterFileBrowserFolderItems,
  parseFileBrowserFilterText,
} from "utils/fileBrowserFilter";
import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  filterFileBrowserItemsByTypeFilters,
  getFileBrowserFolderPathLabel,
} from "utils/fileBrowserTypes";
import {
  route_get_file_browser_download_urls,
  route_get_file_browser_root,
  route_get_folder_contents,
  route_set_browser_area_view_mode,
  route_set_browser_saved_searches,
} from "utils/generatedEndpoints";
import {
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
  BrowserSavedSearch,
  FolderContentItem,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { clamp } from "utils/utils";

const artifactTypes = [
  { type: "image" as const, label: "Image", icon: <IoImageOutline /> },
  { type: "video" as const, label: "Video", icon: <IoVideocam /> },
  { type: "audio" as const, label: "Audio", icon: <FiMusic /> },
  { type: "text" as const, label: "Text", icon: <FiFileText /> },
  { type: "data" as const, label: "Data", icon: <MdDataArray /> },
];

const TYPES_COLUMN_MIN_CONTAINER_WIDTH = 384;
const FILE_URL_REFRESH_BUFFER_MS = 30_000;
const FILE_URL_REQUEST_CHUNK_SIZE = 120;
const TEXT_PREVIEW_CHAR_LIMIT = 4_000;
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
const FILTER_RECURSIVE_MIN_CHARS = 2;
const FILTER_RECURSIVE_MAX_RESULTS = 600;
const FILTER_RECURSIVE_MAX_FOLDERS = 600;

type BrowserFileAttachment = {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};

type OpenableBrowserItem = {
  name: string;
  fullPath: string;
  type: string;
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

function normalizeFolderPrefix(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
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
  const { width, hideColumn, viewMode, folder, savedSearches, isFrozen } =
    useProjectState((x) => {
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
      savedSearches: impl.savedSearches ?? [],
      isFrozen: impl.isFrozen,
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
      className="section-main -mr-3 mb-2 mt-2 flex min-w-0 flex-col gap-2 pr-2 @sm/multipane:flex-row @sm/multipane:gap-4  @sm/multipane:overflow-visible"
      ref={containerRef}
    >
      {!hideColumn && (
        <TypesColumn
          width={width}
          columnWidth={typesColumnWidth}
          onResizeStart={handleTypesColumnResizeStart}
          savedSearches={savedSearches}
        />
      )}
      <ItemsColumn
        sectionId={sectionId}
        viewMode={viewMode}
        folder={folder}
        filesColumnWidth={filesColumnWidth}
        onFilesColumnResizeStart={handleFilesColumnResizeStart}
        savedSearches={savedSearches}
        isFrozen={isFrozen}
      />
    </div>
  );
}

function TypesColumn({
  width,
  columnWidth,
  onResizeStart,
  savedSearches,
}: {
  width: number;
  columnWidth: string;
  onResizeStart: React.MouseEventHandler<HTMLDivElement>;
  savedSearches: BrowserSavedSearch[];
}) {
  const { ref, isScrollable } = useIsScrollable();
  const { filterText, typeFilters, searchScope } = useBrowserSectionFileBrowserState(
    (state) => ({
      filterText: state.filterText,
      typeFilters: state.typeFilters,
      searchScope: state.searchScope,
    }),
  );
  const isResizable = width > TYPES_COLUMN_MIN_CONTAINER_WIDTH;
  return (
    <article
      className="nodrag relative flex min-w-0 flex-col pr-1 @sm/multipane:z-20"
      style={isResizable ? { width: columnWidth } : undefined}
    >
      {isResizable && (
        <div className="absolute -right-2 top-0 z-30 flex h-full items-center">
          <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
        </div>
      )}
      <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
        Filters
      </h3>

      <ul
        ref={ref}
        className={`relative mb-2 mt-2 flex min-h-0 min-w-0 flex-1 flex-col list-none overflow-y-auto overflow-x-hidden box-border pr-1 ${isScrollable ? "nowheel" : ""}`}
      >
        {artifactTypes.map((x) => (
          <FilterToggleRow
            key={x.type}
            icon={x.icon}
            checked={typeFilters[x.type] === true}
            onChange={(checked) => {
              useBrowserSectionFileBrowserState.setState((state) => ({
                typeFilters: { ...state.typeFilters, [x.type]: checked },
              }));
            }}
            label={x.label}
          />
        ))}
        {savedSearches.length > 0 ? (
          <li className="my-2 h-px w-full bg-setta-100 dark:bg-setta-800" />
        ) : null}
        {savedSearches.map((search) => {
          const activeTypeFilters = {
            image: typeFilters.image === true,
            video: typeFilters.video === true,
            audio: typeFilters.audio === true,
            text: typeFilters.text === true,
            data: typeFilters.data === true,
          };
          const isActive =
            filterText === (search.query ?? "") &&
            searchScope === search.searchScope &&
            _.isEqual(activeTypeFilters, search.typeFilters);
          const tooltipText =
            search.quickInfo?.trim().length > 0
              ? search.quickInfo
              : [
                  `Query: ${search.query || ""}`,
                  `Scope: ${search.searchScope}`,
                ].join("\n");
          const tooltipHandlers =
            tooltipText.trim().length > 0
              ? getFloatingBoxHandlers({
                  title: search.name || "Saved search",
                  content: tooltipText,
                })
              : null;
          return (
            <li key={search.id} className="group/savedsearch">
              <button
                type="button"
                className={`nodrag flex min-h-6 w-full min-w-0 items-center gap-2 overflow-hidden rounded px-1 py-0.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-200 ${
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                    : "text-setta-700 hover:bg-setta-50 dark:hover:bg-setta-900"
                }`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  useBrowserSectionFileBrowserState.setState({
                    filterText: search.query ?? "",
                    searchScope: search.searchScope,
                    typeFilters: {
                      image: search.typeFilters?.image ?? true,
                      video: search.typeFilters?.video ?? true,
                      audio: search.typeFilters?.audio ?? true,
                      text: search.typeFilters?.text ?? true,
                      data: search.typeFilters?.data ?? true,
                    },
                  });
                }}
                {...(tooltipHandlers ?? {})}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: search.color || "#3b82f6" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {search.name || search.query || "Saved search"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="nodrag mt-auto flex min-w-0 cursor-pointer select-none items-center justify-center gap-1 rounded-md border border-solid border-setta-100 px-2 py-2 text-xs font-bold uppercase leading-none text-setta-400 outline-none transition-colors duration-150 hover:bg-setta-50 focus-visible:!border-blue-500 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-400"
        onClick={() => {
          useBrowserSectionFileBrowserState.setState({
            typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
          });
        }}
      >
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

function ViewSelector({
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
}) {
  return (
    <div
      className="nodrag group/thumbnail flex cursor-pointer flex-col items-center gap-1"
      style={{ width: size }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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

function ViewSwitch({
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
                  previewKind={previewKind}
                  badgeText={badgeText}
                  thumbnailUrl={thumbnailUrl}
                  label={item.name}
                  onClick={handleClick ?? handleDoubleClickClick}
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

function ItemsColumn({
  sectionId,
  viewMode,
  folder,
  filesColumnWidth,
  onFilesColumnResizeStart,
  savedSearches,
  isFrozen,
}: {
  sectionId: string;
  viewMode: BrowserAreaViewMode;
  folder: string;
  filesColumnWidth: string;
  onFilesColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  savedSearches: BrowserSavedSearch[];
  isFrozen: boolean;
}) {
  const [value, setValue] = useLocalPendingValue(viewMode);
  const { canEditLayout } = useShareCapabilities();
  const filterText = useBrowserSectionFileBrowserState(
    (state) => state.filterText,
  );
  const searchScope = useBrowserSectionFileBrowserState(
    (state) => state.searchScope,
  );
  const typeFilters = useBrowserSectionFileBrowserState(
    (state) => state.typeFilters,
  );
  const browserStateRootPath = useBrowserSectionFileBrowserState(
    (state) => state.rootPath,
  );
  const browserStateIgnorePatterns = useBrowserSectionFileBrowserState(
    (state) => state.ignorePatterns,
  );
  const browserStatePathSeparator = useBrowserSectionFileBrowserState(
    (state) => state.pathSeparator,
  );
  const canSaveSearch = canEditLayout && !isFrozen;
  const [items, setItems] = useState<Array<FolderContentItem>>([]);
  const [recursiveFilterResults, setRecursiveFilterResults] =
    useState<Array<FolderContentItem> | null>(null);
  const recursiveFilterRequestIdRef = useRef(0);
  const folderContentsCacheRef = useRef<Map<string, Array<FolderContentItem>>>(
    new Map(),
  );
  const [fileUrlMap, setFileUrlMap] = useState<Record<string, FileUrlEntry>>(
    {},
  );
  const fileUrlMapRef = useRef<Record<string, FileUrlEntry>>({});
  const fileUrlRequests = useRef<Set<string>>(new Set());
  const fileUrlPromiseResolvers = useRef<
    Map<string, (entry: FileUrlEntry | null) => void>
  >(new Map());
  const fileUrlPromises = useRef<Map<string, Promise<FileUrlEntry | null>>>(
    new Map(),
  );
  const [selectedCarouselId, setSelectedCarouselId] = useState<string | null>(
    null,
  );
  const [textPreviewMap, setTextPreviewMap] = useState<
    Record<string, FileTextPreview>
  >({});
  const [rootInfo, setRootInfo] = useState<{
    rootPath: string;
    ignorePatterns: string[];
    pathSeparator: string;
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
  const [isTooltipKeyHeld, setIsTooltipKeyHeld] = useState(false);
  const filterQuery = useMemo(
    () => parseFileBrowserFilterText(filterText),
    [filterText],
  );
  const trimmedFolder = folder.trim();
  const effectiveFolder =
    localFolder ?? (trimmedFolder ? trimmedFolder : rootInfo?.rootPath ?? "");
  const visibleItems = useMemo(() => {
    if (isListView) {
      return items;
    }
    if (filterQuery.kind === "none") {
      return items;
    }
    if (recursiveFilterResults !== null) {
      return recursiveFilterResults;
    }
    return filterFileBrowserFolderItems(items, filterText);
  }, [filterQuery.kind, filterText, isListView, items, recursiveFilterResults]);

  const filteredVisibleItems = useMemo(
    () => filterFileBrowserItemsByTypeFilters(visibleItems, typeFilters),
    [typeFilters, visibleItems],
  );
  const selectedCarouselItem = useMemo(() => {
    if (!selectedCarouselId) {
      return null;
    }
    return (
      filteredVisibleItems.find((item) => item.fullPath === selectedCarouselId) ??
      null
    );
  }, [filteredVisibleItems, selectedCarouselId]);
  const folderCompletionOptionsRef = useRef<{
    rootPath: string | null;
    pathSeparator?: string;
    ignorePatterns?: string[] | null;
    maxEntries?: number;
  }>({ rootPath: null });
  const fallbackRootPath = effectiveFolder.trim();
  folderCompletionOptionsRef.current.rootPath =
    rootInfo?.rootPath ?? (fallbackRootPath ? fallbackRootPath : null);
  folderCompletionOptionsRef.current.pathSeparator =
    rootInfo?.pathSeparator ?? browserStatePathSeparator ?? undefined;
  folderCompletionOptionsRef.current.ignorePatterns =
    rootInfo?.ignorePatterns ?? browserStateIgnorePatterns ?? undefined;

  const folderCompletionSource = useMemo(
    () =>
      createDynamicFolderPathCompletionSource(
        () => folderCompletionOptionsRef.current,
      ),
    [],
  );

  const shouldShowFolderPaths = filterQuery.kind !== "none";
  const showSearchPathTooltips = shouldShowFolderPaths && isTooltipKeyHeld;

  useEffect(() => {
    if (isListView) {
      setIsTooltipKeyHeld(false);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "KeyQ") {
        setIsTooltipKeyHeld(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "KeyQ") {
        setIsTooltipKeyHeld(false);
      }
    }

    function handleWindowBlur() {
      setIsTooltipKeyHeld(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isListView]);
  const normalizedRootPathForPrefix = useMemo(() => {
    if (!rootInfo?.rootPath) {
      return null;
    }
    return normalizeFolderPrefix(rootInfo.rootPath);
  }, [rootInfo?.rootPath]);
  const normalizedEffectiveFolderForPrefix = useMemo(() => {
    if (!rootInfo?.rootPath) {
      return normalizeFolderPrefix(effectiveFolder);
    }
    const resolved = resolvePathWithinRoot(effectiveFolder, rootInfo.rootPath);
    if (!resolved) {
      return normalizeFolderPrefix(effectiveFolder);
    }
    return normalizeFolderPrefix(resolved);
  }, [effectiveFolder, rootInfo?.rootPath]);
  const getItemSubLabel = useCallback(
    (item: FolderContentItem): string | null => {
      if (!shouldShowFolderPaths) {
        return null;
      }
      if (!rootInfo?.rootPath) {
        return null;
      }
      const resolvedItemPath = resolvePathWithinRoot(
        item.fullPath,
        rootInfo.rootPath,
      );
      if (!resolvedItemPath) {
        return null;
      }
      const folderPath = getFileBrowserFolderPathLabel(resolvedItemPath);
      if (!folderPath) {
        return null;
      }
      const normalizedFolder = normalizeFolderPrefix(folderPath);
      if (
        normalizedEffectiveFolderForPrefix &&
        normalizedFolder === normalizedEffectiveFolderForPrefix
      ) {
        return null;
      }
      if (
        normalizedEffectiveFolderForPrefix &&
        normalizedFolder.startsWith(`${normalizedEffectiveFolderForPrefix}/`)
      ) {
        return normalizedFolder.slice(normalizedEffectiveFolderForPrefix.length + 1);
      }
      if (
        normalizedRootPathForPrefix &&
        normalizedFolder.startsWith(`${normalizedRootPathForPrefix}/`)
      ) {
        return normalizedFolder.slice(normalizedRootPathForPrefix.length + 1);
      }
      return normalizedFolder;
    },
    [
      normalizedEffectiveFolderForPrefix,
      normalizedRootPathForPrefix,
      rootInfo?.rootPath,
      shouldShowFolderPaths,
    ],
  );

  const getItemTooltip = useCallback(
    (item: FolderContentItem): string | null => {
      if (!showSearchPathTooltips) {
        return null;
      }
      if (!rootInfo?.rootPath) {
        return item.fullPath;
      }
      const resolvedItemPath = resolvePathWithinRoot(
        item.fullPath,
        rootInfo.rootPath,
      );
      if (!resolvedItemPath) {
        return item.fullPath;
      }
      const normalizedItemPath = normalizeFolderPrefix(resolvedItemPath);
      if (
        normalizedEffectiveFolderForPrefix &&
        normalizedItemPath.startsWith(`${normalizedEffectiveFolderForPrefix}/`)
      ) {
        const relative = normalizedItemPath.slice(
          normalizedEffectiveFolderForPrefix.length + 1,
        );
        return relative || normalizedItemPath;
      }
      if (
        normalizedRootPathForPrefix &&
        normalizedItemPath.startsWith(`${normalizedRootPathForPrefix}/`)
      ) {
        const relative = normalizedItemPath.slice(
          normalizedRootPathForPrefix.length + 1,
        );
        return relative || normalizedItemPath;
      }
      return normalizedItemPath;
    },
    [
      normalizedEffectiveFolderForPrefix,
      normalizedRootPathForPrefix,
      rootInfo?.rootPath,
      showSearchPathTooltips,
    ],
  );

  useEffect(() => {
    if (rootInfo) {
      return;
    }
    if (!browserStateRootPath) {
      return;
    }
    // FileBrowserPane fetches and populates the shared store early. Bootstrap
    // rootInfo from that store so path autocompletion works immediately (and in
    // e2e) without needing a second network request to finish first.
    setRootInfo({
      rootPath: browserStateRootPath,
      ignorePatterns: browserStateIgnorePatterns,
      pathSeparator: browserStatePathSeparator,
    });
  }, [
    browserStateIgnorePatterns,
    browserStatePathSeparator,
    browserStateRootPath,
    rootInfo,
  ]);

  useEffect(() => {
    if (!rootInfo) {
      return;
    }
    // Keep ignore patterns and path separator in sync with the shared store,
    // but keep the root path stable (it represents the browser sandbox root).
    if (
      rootInfo.ignorePatterns === browserStateIgnorePatterns &&
      rootInfo.pathSeparator === browserStatePathSeparator
    ) {
      return;
    }
    setRootInfo((prev) =>
      prev
        ? {
            ...prev,
            ignorePatterns: browserStateIgnorePatterns,
            pathSeparator: browserStatePathSeparator,
          }
        : prev,
    );
  }, [browserStateIgnorePatterns, browserStatePathSeparator, rootInfo]);

  useEffect(() => {
    const trimmed = folder.trim();
    if (!trimmed) {
      return;
    }
    setLocalFolder(trimmed);
  }, [folder]);

  useEffect(() => {
    fileUrlMapRef.current = fileUrlMap;
  }, [fileUrlMap]);

  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);

  useEffect(() => {
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

  const ensureFileUrlPromise = useCallback((path: string) => {
    const existing = fileUrlPromises.current.get(path);
    if (existing) {
      return existing;
    }
    let resolvePromise: (entry: FileUrlEntry | null) => void = () => undefined;
    const promise = new Promise<FileUrlEntry | null>((resolve) => {
      resolvePromise = resolve;
    });
    fileUrlPromises.current.set(path, promise);
    fileUrlPromiseResolvers.current.set(path, resolvePromise);
    return promise;
  }, []);

  const settleFileUrlPromises = useCallback(
    (paths: string[], entries: Record<string, FileUrlEntry>) => {
      for (const path of paths) {
        const resolver = fileUrlPromiseResolvers.current.get(path);
        if (!resolver) {
          continue;
        }
        resolver(entries[path] ?? null);
        fileUrlPromiseResolvers.current.delete(path);
        fileUrlPromises.current.delete(path);
      }
    },
    [],
  );

  const requestFileUrls = useCallback(
    async (paths: string[], options: { force?: boolean } = {}) => {
      if (paths.length === 0) {
        return {};
      }
      const now = Date.now();
      const currentMap = fileUrlMapRef.current;
      const pending = paths.filter((path) => {
        const entry = currentMap[path];
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
        ensureFileUrlPromise(path);
      }
      const aggregated: Record<string, FileUrlEntry> = {};
      const chunks = _.chunk(pending, FILE_URL_REQUEST_CHUNK_SIZE);
      for (const chunk of chunks) {
        const res = await route_get_file_browser_download_urls({
          paths: chunk,
        });
        for (const path of chunk) {
          fileUrlRequests.current.delete(path);
        }
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          console.warn("Failed to load file preview URLs", detail ?? chunk);
          settleFileUrlPromises(chunk, {});
          continue;
        }
        const nextEntries: Record<string, FileUrlEntry> = {};
        for (const entry of res.data) {
          nextEntries[entry.path] = {
            url: entry.url,
            expiresAt: entry.expiresAt,
          };
        }
        Object.assign(aggregated, nextEntries);
        settleFileUrlPromises(chunk, nextEntries);
      }
      if (Object.keys(aggregated).length > 0) {
        setFileUrlMap((prev) => ({ ...prev, ...aggregated }));
      }
      return aggregated;
    },
    [ensureFileUrlPromise, settleFileUrlPromises],
  );

  const getFileUrlEntry = useCallback(
    async (path: string, options: { force?: boolean } = {}) => {
      const now = Date.now();
      const existing = fileUrlMapRef.current[path];
      if (!options.force && existing && !isFileUrlStale(existing, now)) {
        return existing;
      }
      const pendingPromise = fileUrlPromises.current.get(path);
      if (pendingPromise) {
        const resolved = await pendingPromise;
        if (resolved && !isFileUrlStale(resolved, Date.now())) {
          return resolved;
        }
      }
      const refreshed = await requestFileUrls([path], { force: true });
      return refreshed[path] ?? fileUrlMapRef.current[path] ?? null;
    },
    [requestFileUrls],
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
      const pathKey = item.fullPath;
      const entry = await getFileUrlEntry(pathKey, { force: true });
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
    [getFileUrlEntry, textPreviewMap],
  );

  const loadFolderContents = useCallback(
    async (folderPath: string) => {
      const trimmed = folderPath.trim();
      if (!trimmed) {
        setItems([]);
        return;
      }
      if (!rootInfo?.rootPath) {
        setItems([]);
        return;
      }
      const safeFolder = resolvePathWithinRoot(trimmed, rootInfo.rootPath);
      if (!safeFolder) {
        setItems([]);
        return;
      }
      const requestId = folderRequestIdRef.current + 1;
      folderRequestIdRef.current = requestId;
      const res = await route_get_folder_contents({
        folderPath: safeFolder,
        ignorePatterns: rootInfo?.ignorePatterns ?? null,
        includeSize: true,
      });
      if (folderRequestIdRef.current !== requestId) {
        return;
      }
      if (res200(res)) {
        setItems(res.data);
        folderContentsCacheRef.current.set(safeFolder, res.data);
      } else {
        setItems([]);
        folderContentsCacheRef.current.delete(safeFolder);
      }
    },
    [rootInfo?.ignorePatterns, rootInfo?.rootPath],
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
      const safeFolder = rootInfo?.rootPath
        ? resolvePathWithinRoot(trimmed, rootInfo.rootPath)
        : null;
      if (safeFolder || !rootInfo?.rootPath) {
        useBrowserSectionFileBrowserState.setState({
          rootPath: safeFolder ?? trimmed,
        });
      }
      await loadFolderContents(trimmed);
    },
    [loadFolderContents, rootInfo?.rootPath],
  );

  useEffect(() => {
    if (value !== BrowserAreaViewModeEnum.carousel) {
      setSelectedCarouselId(null);
      return;
    }
    if (filteredVisibleItems.length === 0) {
      setSelectedCarouselId(null);
      return;
    }
    if (
      selectedCarouselId &&
      filteredVisibleItems.some((item) => item.fullPath === selectedCarouselId)
    ) {
      return;
    }
    const preferred =
      filteredVisibleItems.find((item) => getBrowserPreviewKind(item) === "image") ??
      filteredVisibleItems[0];
    if (preferred) {
      setSelectedCarouselId(preferred.fullPath);
    }
  }, [filteredVisibleItems, selectedCarouselId, value]);

  useEffect(() => {
    if (isListView) {
      return;
    }
    const imagePaths = filteredVisibleItems
      .filter((item) => item.type.toLowerCase() === "file")
      .filter((item) => getBrowserPreviewKind(item) === "image")
      .map((item) => item.fullPath);
    if (imagePaths.length === 0) {
      return;
    }
    void requestFileUrls(imagePaths);
  }, [filteredVisibleItems, isListView, requestFileUrls]);

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
    (item: OpenableBrowserItem) => {
      if (item.type.toLowerCase() === "folder") {
        return;
      }
      const previewKind = getAttachmentPreviewKind({
        id: item.fullPath,
        name: item.name,
        mimeType: null,
        size: null,
      });
      if (previewKind === "image") {
        void openFileInImageSection({
          filePath: item.fullPath,
          fileName: item.name,
        });
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
        const entry = await getFileUrlEntry(item.fullPath, { force: true });
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
      getFileUrlEntry,
      openFileInCodeSection,
      openFileInImageSection,
      openFileInTextSection,
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
    if (rootInfo) {
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
        pathSeparator: res.data.pathSeparator,
      });
      useBrowserSectionFileBrowserState.setState({
        ignorePatterns: res.data.ignorePatterns,
        pathSeparator: res.data.pathSeparator,
      });
    };
    void loadRoot();
  }, [rootInfo]);

  useEffect(() => {
    if (isListView) {
      return;
    }
    void loadFolderContents(effectiveFolder);
  }, [effectiveFolder, isListView, loadFolderContents]);

  useEffect(() => {
    if (isListView) {
      setRecursiveFilterResults(null);
      recursiveFilterRequestIdRef.current += 1;
      return;
    }
    if (searchScope !== "recursive") {
      setRecursiveFilterResults(null);
      recursiveFilterRequestIdRef.current += 1;
      return;
    }
    if (filterQuery.kind === "none") {
      setRecursiveFilterResults(null);
      recursiveFilterRequestIdRef.current += 1;
      return;
    }
    if (
      filterQuery.kind === "name" &&
      filterQuery.needle.length < FILTER_RECURSIVE_MIN_CHARS
    ) {
      setRecursiveFilterResults(null);
      recursiveFilterRequestIdRef.current += 1;
      return;
    }
    if (!rootInfo?.rootPath) {
      setRecursiveFilterResults(null);
      recursiveFilterRequestIdRef.current += 1;
      return;
    }

    const trimmed = effectiveFolder.trim();
    if (!trimmed) {
      setRecursiveFilterResults([]);
      recursiveFilterRequestIdRef.current += 1;
      return;
    }
    const safeFolder = resolvePathWithinRoot(trimmed, rootInfo.rootPath);
    if (!safeFolder) {
      setRecursiveFilterResults([]);
      recursiveFilterRequestIdRef.current += 1;
      return;
    }

    const requestId = recursiveFilterRequestIdRef.current + 1;
    recursiveFilterRequestIdRef.current = requestId;

    const initial = filterFileBrowserFolderItems(items, filterText);
    const seen = new Set<string>(initial.map((item) => item.fullPath));
    const results: FolderContentItem[] = [...initial];
    setRecursiveFilterResults(results);

    const queue: string[] = [safeFolder];
    const visited = new Set<string>();

    const crawl = async () => {
      while (
        queue.length > 0 &&
        visited.size < FILTER_RECURSIVE_MAX_FOLDERS &&
        results.length < FILTER_RECURSIVE_MAX_RESULTS &&
        recursiveFilterRequestIdRef.current === requestId
      ) {
        const folder = queue.shift();
        if (!folder) {
          continue;
        }
        if (visited.has(folder)) {
          continue;
        }
        visited.add(folder);

        let listing = folderContentsCacheRef.current.get(folder);
        if (!listing) {
          const res = await route_get_folder_contents({
            folderPath: folder,
            ignorePatterns: rootInfo.ignorePatterns ?? null,
            includeSize: true,
          });
          if (recursiveFilterRequestIdRef.current !== requestId) {
            return;
          }
          if (!res200(res)) {
            continue;
          }
          listing = res.data;
          folderContentsCacheRef.current.set(folder, listing);
        }

        for (const entry of listing) {
          if (entry.type.toLowerCase() === "folder") {
            queue.push(entry.fullPath);
          }
        }

        const matches = filterFileBrowserFolderItems(listing, filterText);
        let didAdd = false;
        for (const match of matches) {
          if (seen.has(match.fullPath)) {
            continue;
          }
          seen.add(match.fullPath);
          results.push(match);
          didAdd = true;
          if (results.length >= FILTER_RECURSIVE_MAX_RESULTS) {
            break;
          }
        }
        if (didAdd) {
          setRecursiveFilterResults([...results]);
        }
      }
    };

    void crawl();
  }, [
    effectiveFolder,
    filterQuery.kind,
    filterText,
    isListView,
    items,
    rootInfo?.ignorePatterns,
    rootInfo?.rootPath,
    searchScope,
  ]);

  useEffect(() => {
    const trimmed = effectiveFolder.trim();
    if (!trimmed) {
      return;
    }
    const safeFolder = rootInfo?.rootPath
      ? resolvePathWithinRoot(trimmed, rootInfo.rootPath)
      : trimmed;
    if (rootInfo?.rootPath && !safeFolder) {
      return;
    }
    useBrowserSectionFileBrowserState.setState({
      rootPath: safeFolder,
    });
  }, [effectiveFolder, rootInfo?.rootPath]);

  const handleSaveSearch = useCallback(
    (query: string) => {
      if (!canSaveSearch) {
        return;
      }
      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }
      const nextTypeFilters = {
        image: typeFilters.image === true,
        video: typeFilters.video === true,
        audio: typeFilters.audio === true,
        text: typeFilters.text === true,
        data: typeFilters.data === true,
      };
      const alreadySaved = savedSearches.some((search) => {
        const normalizedFilters = {
          image: search.typeFilters?.image ?? true,
          video: search.typeFilters?.video ?? true,
          audio: search.typeFilters?.audio ?? true,
          text: search.typeFilters?.text ?? true,
          data: search.typeFilters?.data ?? true,
        };
        return (
          (search.query ?? "").trim() === trimmed &&
          search.searchScope === searchScope &&
          _.isEqual(normalizedFilters, nextTypeFilters)
        );
      });
      if (alreadySaved) {
        return;
      }

      const newSearch: BrowserSavedSearch = {
        id: createNewId(),
        name: trimmed,
        query: trimmed,
        searchScope,
        typeFilters: nextTypeFilters,
        color: "#3b82f6",
        quickInfo: "",
      };
      const nextSavedSearches = [...savedSearches, newSearch];
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BrowserSection">(state, sectionId, {
            savedSearches: nextSavedSearches,
          });
        },
        send: (frontendOpId) =>
          route_set_browser_saved_searches({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            savedSearches: nextSavedSearches,
            frontendOpId,
          }),
      });
    },
    [canSaveSearch, savedSearches, searchScope, sectionId, typeFilters],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col">
      <div className="-mt-[4.5px] mb-1 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <FolderHistoryControls
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onBack={handleGoBack}
            onForward={handleGoForward}
          />
          <div className="min-w-[200px] flex-[1_1_320px]">
            <FolderPath
              sectionId={sectionId}
              folder={effectiveFolder}
              setFolder={setFolder}
              completionSource={folderCompletionSource}
            />
          </div>
          <div className="min-w-[140px] max-w-[260px] flex-[0_1_200px]">
            <FileBrowserFilter
              useFileBrowserStateHook={useBrowserSectionFileBrowserState}
              tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
              saveSearchConfig={{
                canSave: canSaveSearch,
                onSaveSearch: handleSaveSearch,
              }}
            />
          </div>
        </div>
        <ViewSelector view={value} setView={setView} />
      </div>
      <ViewSwitch
        view={value}
        items={isListView ? items : filteredVisibleItems}
        filesColumnWidth={filesColumnWidth}
        onFilesColumnResizeStart={onFilesColumnResizeStart}
        fileUrlMap={fileUrlMap}
        selectedCarouselId={selectedCarouselId}
        onSelectCarouselId={setSelectedCarouselId}
        textPreviewMap={textPreviewMap}
        getItemSubLabel={getItemSubLabel}
        getItemTooltip={getItemTooltip}
        onOpenFolder={handleOpenFolder}
        onOpenFile={handleOpenFile}
      />
    </div>
  );
}

function FilterToggleRow({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 justify-between">
      <button
        type="button"
        aria-pressed={checked}
        className="nodrag flex min-h-7 w-full min-w-0 items-center gap-2 bg-transparent px-1 py-0.5 text-left text-xs text-setta-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 hover:text-setta-900 dark:text-setta-200 dark:hover:text-white"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onChange(!checked);
        }}
      >
        {icon ? (
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center ${
              checked
                ? "text-blue-600 dark:text-blue-300"
                : "text-setta-400 dark:text-setta-500"
            }`}
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    </li>
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
  sectionId,
  folder,
  setFolder,
  completionSource,
}: {
  sectionId: string;
  folder: string;
  setFolder: (newFolder: string) => void;
  completionSource: ReturnType<typeof createDynamicFolderPathCompletionSource>;
}) {
  const { inputValue, onChange, onBlur, blurTriggeredByEscapeKey } =
    useEditableOnSubmit(folder, setFolder, () => true);

  const blurActiveElement = useCallback(() => {
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    }
  }, []);

  const keyComboActions = useMemo(
    () => ({
      Escape: () => {
        blurTriggeredByEscapeKey.current = true;
        onChange(folder);
        blurActiveElement();
        return true;
      },
    }),
    [blurActiveElement, folder, onChange, blurTriggeredByEscapeKey],
  );

  const dummyInputStyles =
    "flex-1 min-w-0 cursor-text truncate bg-transparent pl-4 py-1 text-xs leading-4 outline-0 placeholder-setta-300 dark:placeholder-setta-700 font-sans";
  const realInputStyles =
    "setta-cm-browser-path-input flex-1 min-w-0 h-full cursor-text truncate bg-transparent outline-0 [&_.cm-content]:!py-1 [&_.cm-content]:!pl-4 [&_.cm-content]:!pr-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs [&_.cm-content]:!leading-4 [&_.cm-content]:text-setta-700 dark:[&_.cm-content]:text-setta-200 [&_.cm-placeholder]:text-setta-300 dark:[&_.cm-placeholder]:text-setta-700 [&_.cm-content]:font-sans";

  return (
    <search
      className={
        "nodrag group/folderpath relative mx-[2px] flex h-7 min-w-0 flex-1 overflow-hidden border-solid border-transparent bg-transparent [border-width:0_0_1px_0] focus-within:border-blue-300 dark:text-setta-200"
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden opacity-100 transition-opacity duration-0 group-focus-within/folderpath:opacity-0 group-focus-within/folderpath:duration-150"
      >
        <span className="block min-w-0 truncate pl-4 py-1 text-xs leading-4 font-sans text-setta-700 dark:text-setta-200">
          {inputValue}
        </span>
      </div>
      <InlineCodeMirrorInput
        id={`CodeMirror-${sectionId}-browser-path`}
        value={inputValue}
        onChange={onChange}
        onBlur={(value) => onBlur(value)}
        onEnter={() => {
          // Enter in an address bar should "go" and close any open autocomplete UI.
          blurActiveElement();
        }}
        className={realInputStyles}
        dummyClassName={dummyInputStyles}
        singleLine
        completionsFn={completionSource ?? undefined}
        completionInteractionDelayMs={0}
        completionTriggerChars={["/", "\\"]}
        keyComboActions={keyComboActions}
        tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
    </search>
  );
}
