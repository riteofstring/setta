import {
  callOpenAPI,
  createNewId,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import _ from "lodash";

import {
  getFolderContents,
  setBrowserAreaViewMode,
  setBrowserSavedSearches,
  type FilebrowserFolderContentItem as FolderContentItem,
  type FilebrowserListFolderResponse as ListFolderResponse,
} from "openapi/http";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";

import {
  openFileInCodeSection,
  openFileInImageSection,
  openFileInSpreadsheetSection,
  openFileInTextSection,
} from "state/actions/sections/createSections";

import { useBrowserSectionFileBrowserState } from "state/definitions";

import { resolveCodeLanguageFromPath } from "utils/codeLanguage";

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
  type FileBrowserTypeFilters,
} from "utils/fileBrowserTypes";

import {
  BrowserAreaViewMode,
  BrowserSavedSearch,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";

import { isSpreadsheetPath } from "utils/spreadsheet";

import {
  FILE_URL_REQUEST_CHUNK_SIZE,
  TEXT_PREVIEW_CHAR_LIMIT,
  TEXT_PREVIEW_MAX_BYTES,
  extractExtension,
  getBrowserPreviewKind,
  isFileUrlStale,
  normalizeFileBrowserTypeFilters,
  type FileTextPreview,
  type FileUrlEntry,
  type GetFolderContentsRouteResponse,
  type OpenableBrowserItem,
} from "../browserAreaShared";

import {
  FileUrlRequestOptions,
  HistoryState,
  RootInfo,
  crawlRecursiveFolders,
  createTextPreviewEntry,
  getNextHistoryState,
  getPendingFileUrlPaths,
  loadFileUrlChunk,
  readFileText,
  resolveRecursiveFilterPlan,
  setRecursiveFilterResultsWithRequestId,
  setTextPreviewEntry,
} from "./carouselState";

export function useBrowserAreaFilePreviewState() {
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
  const [textPreviewMap, setTextPreviewMap] = useState<
    Record<string, FileTextPreview>
  >({});
  useEffect(() => {
    fileUrlMapRef.current = fileUrlMap;
  }, [fileUrlMap]);
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
    async (paths: string[], options: FileUrlRequestOptions = {}) => {
      if (paths.length === 0) {
        return {};
      }
      const pending = getPendingFileUrlPaths(
        paths,
        fileUrlMapRef.current,
        fileUrlRequests.current,
        options.force === true,
        Date.now(),
      );
      if (pending.length === 0) {
        return {};
      }
      for (const path of pending) {
        fileUrlRequests.current.add(path);
        ensureFileUrlPromise(path);
      }
      const aggregated: Record<string, FileUrlEntry> = {};
      for (const chunk of _.chunk(pending, FILE_URL_REQUEST_CHUNK_SIZE)) {
        const nextEntries = await loadFileUrlChunk(
          chunk,
          fileUrlRequests.current,
          settleFileUrlPromises,
        );
        if (!nextEntries) {
          continue;
        }
        Object.assign(aggregated, nextEntries);
      }
      if (Object.keys(aggregated).length > 0) {
        setFileUrlMap((prev) => ({ ...prev, ...aggregated }));
      }
      return aggregated;
    },
    [ensureFileUrlPromise, settleFileUrlPromises],
  );
  const getFileUrlEntry = useCallback(
    async (path: string, options: FileUrlRequestOptions = {}) => {
      const cachedEntry = options.force
        ? null
        : getFreshFileUrlEntry(fileUrlMapRef.current[path], Date.now());
      if (cachedEntry) {
        return cachedEntry;
      }
      const pendingEntry = await waitForFreshFileUrlEntry(
        path,
        fileUrlPromises,
      );
      if (pendingEntry) {
        return pendingEntry;
      }
      return refreshFileUrlEntry(path, requestFileUrls, fileUrlMapRef);
    },
    [requestFileUrls],
  );
  const requestTextPreview = useCallback(
    async (item: FolderContentItem) => {
      if (item.size && item.size > TEXT_PREVIEW_MAX_BYTES) {
        setTextPreviewEntry(
          setTextPreviewMap,
          item.fullPath,
          createTextPreviewEntry({
            error: "Preview disabled for large files.",
          }),
        );
        return;
      }
      const existing = textPreviewMap[item.fullPath];
      if (existing && (existing.isLoading || existing.text || existing.error)) {
        return;
      }
      setTextPreviewEntry(
        setTextPreviewMap,
        item.fullPath,
        createTextPreviewEntry({ isLoading: true }),
      );
      const preview = await readFileText(
        await getFileUrlEntry(item.fullPath, { force: true }),
        TEXT_PREVIEW_CHAR_LIMIT,
      );
      if (!preview) {
        setTextPreviewEntry(
          setTextPreviewMap,
          item.fullPath,
          createTextPreviewEntry({ error: "Preview unavailable." }),
        );
        return;
      }
      setTextPreviewEntry(
        setTextPreviewMap,
        item.fullPath,
        createTextPreviewEntry({
          text: preview.text,
          truncated: preview.truncated,
        }),
      );
    },
    [getFileUrlEntry, textPreviewMap],
  );
  return {
    fileUrlMap,
    textPreviewMap,
    requestFileUrls,
    getFileUrlEntry,
    requestTextPreview,
  };
}

export function getFreshFileUrlEntry(
  entry: FileUrlEntry | null | undefined,
  now: number,
): FileUrlEntry | null {
  return entry && !isFileUrlStale(entry, now) ? entry : null;
}

export async function waitForFreshFileUrlEntry(
  path: string,
  fileUrlPromises: React.MutableRefObject<
    Map<string, Promise<FileUrlEntry | null>>
  >,
): Promise<FileUrlEntry | null> {
  const pendingPromise = fileUrlPromises.current.get(path);
  if (!pendingPromise) {
    return null;
  }
  return getFreshFileUrlEntry(await pendingPromise, Date.now());
}

export async function refreshFileUrlEntry(
  path: string,
  requestFileUrls: (
    paths: string[],
    options?: FileUrlRequestOptions,
  ) => Promise<Record<string, FileUrlEntry>>,
  fileUrlMapRef: React.MutableRefObject<Record<string, FileUrlEntry>>,
): Promise<FileUrlEntry | null> {
  const refreshed = await requestFileUrls([path], { force: true });
  return refreshed[path] ?? fileUrlMapRef.current[path] ?? null;
}

export function useBrowserAreaSectionActions(args: {
  sectionId: string;
  setValue: (nextValue: BrowserAreaViewMode) => void;
  canSaveSearch: boolean;
  savedSearches: BrowserSavedSearch[];
  searchScope: string;
  typeFilters: FileBrowserTypeFilters;
}) {
  const setView = useCallback(
    (newView: BrowserAreaViewMode) => {
      args.setValue(newView);
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BrowserSection">(
            state,
            args.sectionId,
            {
              viewMode: newView,
            },
          );
        },
        send: (frontendOpId) =>
          callOpenAPI(
            setBrowserAreaViewMode({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId: args.sectionId,
                viewMode: newView,
                frontendOpId,
              },
            } as Parameters<typeof setBrowserAreaViewMode>[0]),
          ),
      });
    },
    [args],
  );
  const handleSaveSearch = useCallback(
    (query: string) => {
      if (!args.canSaveSearch) {
        return;
      }
      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }
      const nextTypeFilters = normalizeFileBrowserTypeFilters(args.typeFilters);
      const alreadySaved = args.savedSearches.some((search) => {
        return (
          (search.query ?? "").trim() === trimmed &&
          search.searchScope === args.searchScope &&
          _.isEqual(
            normalizeFileBrowserTypeFilters(search.typeFilters),
            nextTypeFilters,
          )
        );
      });
      if (alreadySaved) {
        return;
      }
      const nextSavedSearches = [
        ...args.savedSearches,
        {
          id: createNewId(),
          name: trimmed,
          query: trimmed,
          searchScope: args.searchScope,
          typeFilters: nextTypeFilters,
          color: "#3b82f6",
          quickInfo: "",
        },
      ];
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BrowserSection">(
            state,
            args.sectionId,
            {
              savedSearches: nextSavedSearches,
            },
          );
        },
        send: (frontendOpId) =>
          callOpenAPI(
            setBrowserSavedSearches({
              body: {
                projectConfigId: getCurrProjectConfigId(),
                sectionId: args.sectionId,
                savedSearches: nextSavedSearches,
                frontendOpId,
              },
            } as Parameters<typeof setBrowserSavedSearches>[0]),
          ),
      });
    },
    [args],
  );
  return { setView, handleSaveSearch };
}

export function useBrowserAreaOpenHandlers(args: {
  setFolder: (newFolder: string) => Promise<void>;
  getFileUrlEntry: (
    path: string,
    options?: { force?: boolean },
  ) => Promise<FileUrlEntry | null>;
}) {
  const handleOpenFolder = useCallback(
    (path: string) => {
      void args.setFolder(path);
    },
    [args],
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
      if (getBrowserPreviewKind(item as FolderContentItem) === "image") {
        void openFileInImageSection({
          filePath: item.fullPath,
          fileName: item.name,
        });
        return;
      }
      const extension = extractExtension(item.name);
      if (
        extension !== ".md" &&
        extension !== ".markdown" &&
        extension !== ".txt"
      ) {
        void openFileInCodeSection({
          filePath: item.fullPath,
          fileName: item.name,
          codeLanguage: resolveCodeLanguageFromPath(item.fullPath),
        });
        return;
      }
      const loadAndOpenText = async () => {
        const preview = await readFileText(
          await args.getFileUrlEntry(item.fullPath, { force: true }),
        );
        if (!preview) {
          void openFileInCodeSection({
            filePath: item.fullPath,
            fileName: item.name,
            codeLanguage: resolveCodeLanguageFromPath(item.fullPath),
          });
          return;
        }
        const isMarkdown = extension === ".md" || extension === ".markdown";
        void openFileInTextSection({
          fileName: item.name,
          text: preview.text,
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
    [args],
  );
  return { handleOpenFolder, handleOpenFile };
}

export function useRecursiveBrowserFilterState({
  isListView,
  searchScope,
  filterQuery,
  rootInfo,
  effectiveFolder,
  items,
  filterText,
  cache,
}: {
  isListView: boolean;
  searchScope: string;
  filterQuery: ReturnType<typeof parseFileBrowserFilterText>;
  rootInfo: RootInfo | null;
  effectiveFolder: string;
  items: Array<FolderContentItem>;
  filterText: string;
  cache: React.MutableRefObject<Map<string, Array<FolderContentItem>>>;
}) {
  const [recursiveFilterResults, setRecursiveFilterResults] =
    useState<Array<FolderContentItem> | null>(null);
  const recursiveFilterRequestIdRef = useRef(0);
  useEffect(() => {
    const plan = resolveRecursiveFilterPlan({
      isListView,
      searchScope,
      filterQuery,
      rootPath: rootInfo?.rootPath ?? null,
      effectiveFolder,
    });
    if (plan.kind === "clear") {
      setRecursiveFilterResultsWithRequestId(
        setRecursiveFilterResults,
        recursiveFilterRequestIdRef,
        null,
      );
      return;
    }
    if (plan.kind === "empty") {
      setRecursiveFilterResultsWithRequestId(
        setRecursiveFilterResults,
        recursiveFilterRequestIdRef,
        [],
      );
      return;
    }
    const requestId = recursiveFilterRequestIdRef.current + 1;
    recursiveFilterRequestIdRef.current = requestId;
    const initial = filterFileBrowserFolderItems(items, filterText);
    const seen = new Set<string>(initial.map((item) => item.fullPath));
    const results: FolderContentItem[] = [...initial];
    setRecursiveFilterResults(results);
    void crawlRecursiveFolders({
      queue: [plan.trimmedFolder],
      visited: new Set<string>(),
      results,
      seen,
      filterText,
      ignorePatterns: rootInfo?.ignorePatterns ?? null,
      activeRequestIdRef: recursiveFilterRequestIdRef,
      requestId,
      cache: cache.current,
      onResults: setRecursiveFilterResults,
    });
  }, [
    cache,
    effectiveFolder,
    filterQuery,
    filterText,
    isListView,
    items,
    rootInfo?.ignorePatterns,
    rootInfo?.rootPath,
    searchScope,
  ]);
  return recursiveFilterResults;
}

export function useBrowserAreaHistoryState({
  effectiveFolder,
  isListView,
  parentFolderPath,
  setFolder,
}: {
  effectiveFolder: string;
  isListView: boolean;
  parentFolderPath: string | null;
  setFolder: (newFolder: string) => Promise<void>;
}) {
  const [historyState, setHistoryState] = useState<HistoryState>({
    entries: [],
    index: -1,
  });
  const historyStateRef = useRef(historyState);
  const historySkipRef = useRef(false);
  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);
  useEffect(() => {
    const normalizedFolder = effectiveFolder.trim();
    if (!normalizedFolder) {
      return;
    }
    if (historySkipRef.current) {
      historySkipRef.current = false;
      return;
    }
    setHistoryState((prev) => getNextHistoryState(prev, normalizedFolder));
  }, [effectiveFolder, isListView]);
  const navigateHistory = useCallback(
    (nextIndex: number) => {
      const current = historyStateRef.current;
      const nextFolder = current.entries[nextIndex];
      if (!nextFolder) {
        return;
      }
      historySkipRef.current = true;
      setHistoryState({ entries: current.entries, index: nextIndex });
      void setFolder(nextFolder);
    },
    [setFolder],
  );
  const handleGoBack = useCallback(() => {
    const current = historyStateRef.current;
    if (current.index <= 0) {
      return;
    }
    navigateHistory(current.index - 1);
  }, [navigateHistory]);
  const handleGoForward = useCallback(() => {
    const current = historyStateRef.current;
    if (current.index < 0 || current.index >= current.entries.length - 1) {
      return;
    }
    navigateHistory(current.index + 1);
  }, [navigateHistory]);
  const handleGoUp = useCallback(() => {
    if (!parentFolderPath) {
      return;
    }
    void setFolder(parentFolderPath);
  }, [parentFolderPath, setFolder]);
  return {
    canGoBack: historyState.index > 0,
    canGoForward:
      historyState.index >= 0 &&
      historyState.index < historyState.entries.length - 1,
    handleGoBack,
    handleGoForward,
    handleGoUp,
  };
}

export function useBrowserAreaFolderState(args: {
  folder: string;
  rootInfo: RootInfo | null;
  isListView: boolean;
}) {
  const [items, setItems] = useState<Array<FolderContentItem>>([]);
  const folderContentsCacheRef = useRef<Map<string, Array<FolderContentItem>>>(
    new Map(),
  );
  const [localFolder, setLocalFolder] = useState<string | null>(null);
  const folderRequestIdRef = useRef(0);
  const trimmedFolder = args.folder.trim();
  const effectiveFolder =
    localFolder ??
    (trimmedFolder ? trimmedFolder : args.rootInfo?.rootPath ?? "");
  useEffect(() => {
    if (!trimmedFolder) {
      return;
    }
    setLocalFolder(trimmedFolder);
  }, [trimmedFolder]);
  const loadFolderContents = useCallback(
    async (folderPath: string): Promise<ListFolderResponse | null> => {
      const trimmed = folderPath.trim();
      if (!trimmed || !args.rootInfo?.rootPath) {
        setItems([]);
        return null;
      }
      const requestId = folderRequestIdRef.current + 1;
      folderRequestIdRef.current = requestId;
      const res = (await callOpenAPI(
        getFolderContents({
          body: {
            folderPath: trimmed,
            baseFolderPath: args.rootInfo.rootPath,
            ignorePatterns: args.rootInfo.ignorePatterns ?? null,
            includeSize: true,
            missingFolderBehavior: "empty",
          },
        } as Parameters<typeof getFolderContents>[0]),
      )) as GetFolderContentsRouteResponse;
      if (folderRequestIdRef.current !== requestId) {
        return null;
      }
      if (!res200(res)) {
        setItems([]);
        folderContentsCacheRef.current.delete(trimmed);
        return null;
      }
      setItems(res.data.items);
      folderContentsCacheRef.current.set(res.data.folderPath, res.data.items);
      if (res.data.folderPath !== trimmed) {
        setLocalFolder(res.data.folderPath);
      }
      return res.data;
    },
    [args.rootInfo],
  );
  const setFolder = useCallback(
    async (newFolder: string) => {
      const trimmed = newFolder.trim();
      if (!trimmed) {
        setLocalFolder(null);
        setItems([]);
        return;
      }
      setLocalFolder(trimmed);
      if (!args.rootInfo?.rootPath) {
        useBrowserSectionFileBrowserState.setState({
          rootPath: trimmed,
        });
        await loadFolderContents(trimmed);
        return;
      }
      const response = await loadFolderContents(trimmed);
      if (!response) {
        return;
      }
      useBrowserSectionFileBrowserState.setState({
        rootPath: response.folderPath,
      });
    },
    [args.rootInfo, loadFolderContents],
  );
  useEffect(() => {
    if (args.isListView) {
      return;
    }
    void loadFolderContents(effectiveFolder);
  }, [args.isListView, effectiveFolder, loadFolderContents]);
  const breadcrumbs = useMemo(() => {
    if (!effectiveFolder.trim()) {
      return [];
    }
    return buildFileBrowserBreadcrumbs({
      rootPath: args.rootInfo?.rootPath ?? null,
      currentPath: effectiveFolder,
    });
  }, [effectiveFolder, args.rootInfo?.rootPath]);
  const parentFolderPath = useMemo(() => {
    if (!effectiveFolder.trim()) {
      return null;
    }
    return getFileBrowserParentPath({
      rootPath: args.rootInfo?.rootPath ?? null,
      currentPath: effectiveFolder,
    });
  }, [effectiveFolder, args.rootInfo?.rootPath]);
  return {
    items,
    folderContentsCacheRef,
    effectiveFolder,
    loadFolderContents,
    setFolder,
    breadcrumbs,
    parentFolderPath,
  };
}

export function useVisibleBrowserItems(args: {
  isListView: boolean;
  items: Array<FolderContentItem>;
  filterQuery: ReturnType<typeof parseFileBrowserFilterText>;
  recursiveFilterResults: Array<FolderContentItem> | null;
  filterText: string;
  typeFilters: FileBrowserTypeFilters;
}) {
  const visibleItems = useMemo(() => {
    if (args.isListView) {
      return args.items;
    }
    if (args.filterQuery.kind === "none") {
      return args.items;
    }
    if (args.recursiveFilterResults !== null) {
      return args.recursiveFilterResults;
    }
    return filterFileBrowserFolderItems(args.items, args.filterText);
  }, [args]);
  return useMemo(
    () => filterFileBrowserItemsByTypeFilters(visibleItems, args.typeFilters),
    [args.typeFilters, visibleItems],
  );
}

export function FolderHistoryControls({
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
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={`${baseClassName} ${canGoBack ? "" : disabledClassName}`}
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="Go back"
      >
        <FiChevronLeft size={16} />
      </button>
      <button
        type="button"
        className={`${baseClassName} ${canGoForward ? "" : disabledClassName}`}
        onClick={onForward}
        disabled={!canGoForward}
        aria-label="Go forward"
      >
        <FiChevronRight size={16} />
      </button>
    </div>
  );
}
