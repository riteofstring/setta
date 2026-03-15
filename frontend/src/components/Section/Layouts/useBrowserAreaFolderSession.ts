import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import { useLocalPendingValue } from "state/hooks/utils";
import { useBrowserSectionFileBrowserState } from "state/stores/fileBrowserStores";
import { resolvePathWithinRoot } from "utils/browserPaths";
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
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

const FILTER_RECURSIVE_MIN_CHARS = 2;
const FILTER_RECURSIVE_MAX_RESULTS = 600;
const FILTER_RECURSIVE_MAX_FOLDERS = 600;

type BrowserAreaRootInfo = {
  rootPath: string;
  ignorePatterns: string[];
  pathSeparator: string;
};

type BrowserAreaHistoryState = {
  entries: string[];
  index: number;
};

function normalizeFolderPrefix(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function getActiveBrowserAreaTypeFilters(
  typeFilters: ReturnType<
    typeof useBrowserSectionFileBrowserState.getState
  >["typeFilters"],
) {
  return {
    image: typeFilters.image === true,
    video: typeFilters.video === true,
    audio: typeFilters.audio === true,
    text: typeFilters.text === true,
    data: typeFilters.data === true,
  };
}

function normalizeSavedSearchTypeFilters(
  typeFilters: BrowserSavedSearch["typeFilters"] | undefined,
) {
  return {
    image: typeFilters?.image ?? true,
    video: typeFilters?.video ?? true,
    audio: typeFilters?.audio ?? true,
    text: typeFilters?.text ?? true,
    data: typeFilters?.data ?? true,
  };
}

type UseBrowserAreaFolderSessionArgs = {
  sectionId: string;
  viewMode: BrowserAreaViewMode;
  folder: string;
  savedSearches: BrowserSavedSearch[];
  isFrozen: boolean;
};

// Owns browser root bootstrap, folder/history navigation, recursive filter crawling, and saved-search persistence.
export function useBrowserAreaFolderSession({
  sectionId,
  viewMode,
  folder,
  savedSearches,
  isFrozen,
}: UseBrowserAreaFolderSessionArgs) {
  const [view, setPendingView] = useLocalPendingValue(viewMode);
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
  const [rootInfo, setRootInfo] = useState<BrowserAreaRootInfo | null>(null);
  const [localFolder, setLocalFolder] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<BrowserAreaHistoryState>({
    entries: [],
    index: -1,
  });
  const rootRequestIdRef = useRef(0);
  const folderRequestIdRef = useRef(0);
  const historyStateRef = useRef(historyState);
  const historySkipRef = useRef(false);
  const isListView = view === BrowserAreaViewModeEnum.list;
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
    if (rootInfo || !browserStateRootPath) {
      return;
    }
    // FileBrowserPane populates the shared store early; use that cached root
    // first so the section browser path input can autocomplete immediately.
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
    if (
      rootInfo.ignorePatterns === browserStateIgnorePatterns &&
      rootInfo.pathSeparator === browserStatePathSeparator
    ) {
      return;
    }
    setRootInfo((previous) =>
      previous
        ? {
            ...previous,
            ignorePatterns: browserStateIgnorePatterns,
            pathSeparator: browserStatePathSeparator,
          }
        : previous,
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
    setHistoryState((previous) => {
      const current = previous.entries[previous.index];
      if (current === normalized) {
        return previous;
      }
      const nextEntries = previous.entries.slice(0, previous.index + 1);
      nextEntries.push(normalized);
      return { entries: nextEntries, index: nextEntries.length - 1 };
    });
  }, [effectiveFolder, isListView]);

  const loadFolderContents = useCallback(
    async (folderPath: string) => {
      const trimmed = folderPath.trim();
      if (!trimmed || !rootInfo?.rootPath) {
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
      const response = await route_get_folder_contents({
        folderPath: safeFolder,
        ignorePatterns: rootInfo.ignorePatterns ?? null,
        includeSize: true,
        missingFolderBehavior: "empty",
      });
      if (folderRequestIdRef.current !== requestId) {
        return;
      }
      if (res200(response)) {
        setItems(response.data);
        folderContentsCacheRef.current.set(safeFolder, response.data);
        return;
      }
      setItems([]);
      folderContentsCacheRef.current.delete(safeFolder);
    },
    [rootInfo?.ignorePatterns, rootInfo?.rootPath],
  );

  const setView = useCallback(
    (nextView: BrowserAreaViewMode) => {
      setPendingView(nextView);
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BrowserSection">(state, sectionId, {
            viewMode: nextView,
          });
        },
        send: (frontendOpId) =>
          route_set_browser_area_view_mode({
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            viewMode: nextView,
            frontendOpId,
          }),
      });
    },
    [sectionId, setPendingView],
  );

  const setFolder = useCallback(
    async (nextFolder: string) => {
      const trimmed = nextFolder.trim();
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

  const handlePathCommit = useCallback(
    (nextFolder: string) => {
      void setFolder(nextFolder);
    },
    [setFolder],
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
      const response = await route_get_file_browser_root();
      if (!res200(response) || rootRequestIdRef.current !== requestId) {
        return;
      }
      setRootInfo({
        rootPath: response.data.rootPath,
        ignorePatterns: response.data.ignorePatterns,
        pathSeparator: response.data.pathSeparator,
      });
      useBrowserSectionFileBrowserState.setState({
        ignorePatterns: response.data.ignorePatterns,
        pathSeparator: response.data.pathSeparator,
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
    if (
      isListView ||
      searchScope !== "recursive" ||
      filterQuery.kind === "none"
    ) {
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
        const currentFolder = queue.shift();
        if (!currentFolder || visited.has(currentFolder)) {
          continue;
        }
        visited.add(currentFolder);

        let listing = folderContentsCacheRef.current.get(currentFolder);
        if (!listing) {
          const response = await route_get_folder_contents({
            folderPath: currentFolder,
            ignorePatterns: rootInfo.ignorePatterns ?? null,
            includeSize: true,
            missingFolderBehavior: "empty",
          });
          if (recursiveFilterRequestIdRef.current !== requestId) {
            return;
          }
          if (!res200(response)) {
            continue;
          }
          listing = response.data;
          folderContentsCacheRef.current.set(currentFolder, listing);
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
      const nextTypeFilters = getActiveBrowserAreaTypeFilters(typeFilters);
      const alreadySaved = savedSearches.some((search) => {
        const normalizedFilters = normalizeSavedSearchTypeFilters(
          search.typeFilters,
        );
        return (
          (search.query ?? "").trim() === trimmed &&
          search.searchScope === searchScope &&
          _.isEqual(normalizedFilters, nextTypeFilters)
        );
      });
      if (alreadySaved) {
        return;
      }

      const nextSavedSearches = [
        ...savedSearches,
        {
          id: createNewId(),
          name: trimmed,
          query: trimmed,
          searchScope,
          typeFilters: nextTypeFilters,
          color: "#3b82f6",
          quickInfo: "",
        } satisfies BrowserSavedSearch,
      ];
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

  return {
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
    handleOpenFolder: handlePathCommit,
    handlePathCommit,
    handleSaveSearch,
    items,
    isListView,
    parentFolderPath,
    setView,
    view,
  };
}
