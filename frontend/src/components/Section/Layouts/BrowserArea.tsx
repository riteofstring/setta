import {
  FILE_BROWSER_DATE_COLUMN_MIN_WIDTH,
  FILE_BROWSER_FILE_COLUMN_MIN_WIDTH,
} from "components/Panes/Overview/FileBrowser/fileBrowserPaneListSurface";
import { FileBrowserFilter } from "components/Panes/Overview/FileBrowser/fileBrowserPaneSearchFilter";
import { ResizeHandle } from "components/Params/ResizeHandle";
import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import {
  FileBrowserBreadcrumbs,
  FileBrowserGoUpButton,
  FileBrowserPathInput,
} from "components/Utils/FileBrowserPathControls";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
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
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiMusic,
} from "react-icons/fi";
import { IoImageOutline, IoVideocam } from "react-icons/io5";
import { MdDataArray } from "react-icons/md";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  openFileInCodeSection,
  openFileInImageSection,
  openFileInSpreadsheetSection,
  openFileInTextSection,
} from "state/actions/sections/createSectionFileOpenCommands";
import { useProjectState } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionScrollability";
import { useShareCapabilities } from "state/hooks/share";
import { useBrowserColumnWidth } from "state/hooks/useBrowserColumnWidth";
import { useLocalPendingValue } from "state/hooks/utils";
import { useBrowserSectionFileBrowserState } from "state/stores/fileBrowserStores";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { resolvePathWithinRoot } from "utils/browserPaths";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  filterFileBrowserFolderItems,
  parseFileBrowserFilterText,
} from "utils/fileBrowserFilter";
import {
  buildFileBrowserBreadcrumbs,
  getFileBrowserParentPath,
} from "utils/fileBrowserNavigation";
import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  filterFileBrowserItemsByTypeFilters,
  getFileBrowserFolderPathLabel,
} from "utils/fileBrowserTypes";
import {
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
import { useBrowserAreaPreviewState } from "./useBrowserAreaPreviewState";

const artifactTypes = [
  { type: "image" as const, label: "Image", icon: <IoImageOutline /> },
  { type: "video" as const, label: "Video", icon: <IoVideocam /> },
  { type: "audio" as const, label: "Audio", icon: <FiMusic /> },
  { type: "text" as const, label: "Text", icon: <FiFileText /> },
  { type: "data" as const, label: "Other", icon: <MdDataArray /> },
];

const TYPES_COLUMN_MIN_CONTAINER_WIDTH = 384;
const FILTER_RECURSIVE_MIN_CHARS = 2;
const FILTER_RECURSIVE_MAX_RESULTS = 600;
const FILTER_RECURSIVE_MAX_FOLDERS = 600;
const BROWSER_TYPES_COLUMN_DEFAULT_RATIO = 0.24;
const BROWSER_TYPES_COLUMN_DEFAULT_MIN_WIDTH = 180;
const BROWSER_TYPES_COLUMN_DEFAULT_MAX_WIDTH = 260;
const BROWSER_FILES_COLUMN_DEFAULT_RATIO = 0.72;

function normalizeFolderPrefix(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
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
  const {
    fileUrlMap,
    getFileUrlEntry,
    selectedCarouselId,
    setSelectedCarouselId,
    textPreviewMap,
  } = useBrowserAreaPreviewState({
    filteredVisibleItems,
    viewMode: value,
  });
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
        return normalizedFolder.slice(
          normalizedEffectiveFolderForPrefix.length + 1,
        );
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
        missingFolderBehavior: "empty",
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
  const breadcrumbs = useMemo(() => {
    if (!effectiveFolder.trim()) {
      return [];
    }
    return buildFileBrowserBreadcrumbs({
      rootPath: rootInfo?.rootPath ?? null,
      currentPath: effectiveFolder,
    });
  }, [effectiveFolder, rootInfo?.rootPath]);
  const parentFolderPath = useMemo(() => {
    if (!effectiveFolder.trim()) {
      return null;
    }
    return getFileBrowserParentPath({
      rootPath: rootInfo?.rootPath ?? null,
      currentPath: effectiveFolder,
    });
  }, [effectiveFolder, rootInfo?.rootPath]);

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
  const handleGoUp = useCallback(() => {
    if (!parentFolderPath) {
      return;
    }
    void setFolder(parentFolderPath);
  }, [parentFolderPath, setFolder]);

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
            missingFolderBehavior: "empty",
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
                onCommit={setFolder}
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
          <BrowserAreaViewSelector view={value} setView={setView} />
        </div>
        <FileBrowserBreadcrumbs
          breadcrumbs={breadcrumbs}
          currentPath={effectiveFolder}
          onSelect={(path) => {
            void setFolder(path);
          }}
          className="px-0.5"
        />
      </div>
      <BrowserAreaContentView
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
