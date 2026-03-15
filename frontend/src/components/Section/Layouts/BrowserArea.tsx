import {
  FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
  FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
} from "components/Panes/Overview/FileBrowser/fileBrowserPaneListSurface";
import { FileBrowserFilter } from "components/Panes/Overview/FileBrowser/fileBrowserPaneSearchFilter";
import { ResizeHandle } from "components/Params/ResizeHandle";
import {
  FileBrowserBreadcrumbs,
  FileBrowserGoUpButton,
  FileBrowserPathInput,
} from "components/Utils/FileBrowserPathControls";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { type ReactNode, useCallback, useRef } from "react";
import { BiSolidSelectMultiple } from "react-icons/bi";
import {
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiMusic,
} from "react-icons/fi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdDataArray } from "react-icons/md";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import {
  openFileInCodeSection,
  openFileInImageSection,
  openFileInSpreadsheetSection,
  openFileInTextSection,
} from "state/actions/sections/createSectionFileOpenCommands";
import { useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionScrollability";
import { useBrowserColumnWidth } from "state/hooks/useBrowserColumnWidth";
import { useBrowserSectionFileBrowserState } from "state/stores/fileBrowserStores";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { DEFAULT_FILE_BROWSER_TYPE_FILTERS } from "utils/fileBrowserTypes";
import {
  BrowserAreaViewMode,
  BrowserSavedSearch,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { isSpreadsheetPath } from "utils/spreadsheet";
import { clamp } from "utils/utils";
import {
  BrowserAreaContentView,
  BrowserAreaViewSelector,
} from "./BrowserAreaContentView";
import {
  extractExtension,
  type OpenableBrowserItem,
} from "./browserAreaPreviewModel";
import { useBrowserAreaFolderSession } from "./useBrowserAreaFolderSession";
import { useBrowserAreaPreviewState } from "./useBrowserAreaPreviewState";

const artifactTypes = [
  { type: "image" as const, label: "Image", icon: <IoImageOutline /> },
  { type: "video" as const, label: "Video", icon: <IoVideocam /> },
  { type: "audio" as const, label: "Audio", icon: <FiMusic /> },
  { type: "text" as const, label: "Text", icon: <FiFileText /> },
  { type: "data" as const, label: "Other", icon: <MdDataArray /> },
];

const TYPES_COLUMN_MIN_CONTAINER_WIDTH = 384;
const BROWSER_TYPES_COLUMN_DEFAULT_RATIO = 0.24;
const BROWSER_TYPES_COLUMN_DEFAULT_MIN_WIDTH = 180;
const BROWSER_TYPES_COLUMN_DEFAULT_MAX_WIDTH = 260;
const BROWSER_FILES_COLUMN_DEFAULT_RATIO = 0.72;

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
    getDefaultWidth: (containerWidth) =>
      clamp(
        containerWidth * BROWSER_TYPES_COLUMN_DEFAULT_RATIO,
        BROWSER_TYPES_COLUMN_DEFAULT_MIN_WIDTH,
        Math.min(
          BROWSER_TYPES_COLUMN_DEFAULT_MAX_WIDTH,
          Math.max(
            BROWSER_TYPES_COLUMN_DEFAULT_MIN_WIDTH,
            containerWidth - FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
          ),
        ),
      ),
  });
  const typesColumnWidth = "var(--browser-types-column-width, 220px)";
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
    getDefaultWidth: (containerWidth) =>
      clamp(
        containerWidth * BROWSER_FILES_COLUMN_DEFAULT_RATIO,
        FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
        Math.max(
          FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
          containerWidth - FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
        ),
      ),
  });
  const filesColumnWidth = "var(--browser-column-width, 72%)";

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
  const { filterText, typeFilters, searchScope } =
    useBrowserSectionFileBrowserState((state) => ({
      filterText: state.filterText,
      typeFilters: state.typeFilters,
      searchScope: state.searchScope,
    }));
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
        className={`relative mb-2 mt-2 box-border flex min-h-0 min-w-0 flex-1 list-none flex-col overflow-y-auto overflow-x-hidden pr-1 ${isScrollable ? "nowheel" : ""}`}
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
  const {
    breadcrumbs,
    canGoBack,
    canGoForward,
    canSaveSearch,
    effectiveFolder,
    filteredVisibleItems,
    folderCompletionSource,
    getItemSubLabel,
    getItemTooltip,
    handleGoBack,
    handleGoForward,
    handleGoUp,
    handleOpenFolder,
    handlePathCommit,
    handleSaveSearch,
    items,
    isListView,
    parentFolderPath,
    setView,
    view,
  } = useBrowserAreaFolderSession({
    sectionId,
    viewMode,
    folder,
    savedSearches,
    isFrozen,
  });
  const {
    fileUrlMap,
    getFileUrlEntry,
    selectedCarouselId,
    setSelectedCarouselId,
    textPreviewMap,
  } = useBrowserAreaPreviewState({
    filteredVisibleItems,
    viewMode: view,
  });
  const handleOpenFile = useCallback(
    (item: OpenableBrowserItem) => {
      if (item.type.toLowerCase() === "folder") {
        return;
      }
      if (isSpreadsheetPath(item.name) || isSpreadsheetPath(item.fullPath)) {
        void openFileInSpreadsheetSection({
          filePath: item.fullPath,
          fileName: item.name,
        });
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
      openFileInSpreadsheetSection,
      openFileInTextSection,
      resolveCodeLanguageFromPath,
    ],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col">
      <div className="-mt-[4.5px] mb-1 flex flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <FolderHistoryControls
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onBack={handleGoBack}
              onForward={handleGoForward}
            />
            <FileBrowserGoUpButton
              disabled={!parentFolderPath}
              onClick={handleGoUp}
            />
            <div className="min-w-[200px] flex-[1_1_320px]">
              <FileBrowserPathInput
                inputId={`CodeMirror-${sectionId}-browser-path`}
                value={effectiveFolder}
                onCommit={handlePathCommit}
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
          <BrowserAreaViewSelector view={view} setView={setView} />
        </div>
        <FileBrowserBreadcrumbs
          breadcrumbs={breadcrumbs}
          currentPath={effectiveFolder}
          onSelect={handleOpenFolder}
          className="px-0.5"
        />
      </div>
      <BrowserAreaContentView
        view={view}
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
        className="nodrag flex min-h-7 w-full min-w-0 items-center gap-2 bg-transparent px-1 py-0.5 text-left text-xs text-setta-700 transition-colors hover:text-setta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-200 dark:hover:text-white"
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
