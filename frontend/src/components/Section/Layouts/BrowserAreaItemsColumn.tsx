import {
  callOpenAPI,
  createNewId,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";
import { FileBrowserFilter } from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import {
  FileBrowserBreadcrumbs,
  FileBrowserGoUpButton,
  FileBrowserPathInput,
} from "components/Utils/FileBrowserPathControls";
import _ from "lodash";
import {
  getFileBrowserDownloadUrls,
  getFileBrowserRoot,
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
import { useShareCapabilities } from "state/hooks/share";
import { useLocalPendingValue } from "state/hooks/utils";
import { isAbsoluteBrowserPath } from "utils/browserPaths";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
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
  type FileBrowserTypeFilters,
} from "utils/fileBrowserTypes";
import {
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
  BrowserSavedSearch,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { isSpreadsheetPath } from "utils/spreadsheet";
import { ViewSelector, ViewSwitch } from "./BrowserAreaView";
import {
  FILE_URL_REQUEST_CHUNK_SIZE,
  FILTER_RECURSIVE_MAX_FOLDERS,
  FILTER_RECURSIVE_MAX_RESULTS,
  FILTER_RECURSIVE_MIN_CHARS,
  TEXT_PREVIEW_CHAR_LIMIT,
  TEXT_PREVIEW_MAX_BYTES,
  extractExtension,
  getBrowserPreviewKind,
  isFileUrlStale,
  normalizeFileBrowserTypeFilters,
  normalizeFolderPrefix,
  type FileTextPreview,
  type FileUrlEntry,
  type GetFileBrowserDownloadURLsRouteResponse,
  type GetFileBrowserRootRouteResponse,
  type GetFolderContentsRouteResponse,
  type OpenableBrowserItem,
} from "./browserAreaShared";

type BrowserAreaItemsColumnProps = {
  sectionId: string;
  viewMode: BrowserAreaViewMode;
  folder: string;
  filesColumnWidth: string;
  onFilesColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  savedSearches: BrowserSavedSearch[];
  isFrozen: boolean;
};

type RootInfo = {
  rootPath: string;
  ignorePatterns: string[];
  pathSeparator: string;
};

type FolderCompletionOptions = {
  rootPath: string | null;
  pathSeparator?: string;
  ignorePatterns?: string[] | null;
  maxEntries?: number;
};

type HistoryState = {
  entries: string[];
  index: number;
};

type RecursiveFolderSearchArgs = {
  queue: string[];
  visited: Set<string>;
  results: Array<FolderContentItem>;
  seen: Set<string>;
  filterText: string;
  ignorePatterns: string[] | null;
  activeRequestIdRef: React.MutableRefObject<number>;
  requestId: number;
  cache: Map<string, Array<FolderContentItem>>;
  onResults: (nextResults: Array<FolderContentItem>) => void;
};

type FileUrlRequestOptions = {
  force?: boolean;
};

function createTextPreviewEntry(
  overrides: Partial<FileTextPreview>,
): FileTextPreview {
  return {
    text: "",
    truncated: false,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function setTextPreviewEntry(
  setTextPreviewMap: React.Dispatch<
    React.SetStateAction<Record<string, FileTextPreview>>
  >,
  path: string,
  entry: FileTextPreview,
) {
  setTextPreviewMap((prev) => ({
    ...prev,
    [path]: entry,
  }));
}

function getPendingFileUrlPaths(
  paths: string[],
  currentMap: Record<string, FileUrlEntry>,
  pendingRequests: Set<string>,
  force: boolean,
  now: number,
) {
  return paths.filter((path) => {
    const entry = currentMap[path];
    if (!force && entry && !isFileUrlStale(entry, now)) {
      return false;
    }
    return !pendingRequests.has(path);
  });
}

function readFileText(
  entry: FileUrlEntry | null,
  maxChars?: number,
): Promise<{ text: string; truncated: boolean } | null> {
  if (!entry?.url) {
    return Promise.resolve(null);
  }
  return fetch(entry.url)
    .then((response) => {
      if (!response.ok) {
        return null;
      }
      return response.text();
    })
    .then((text) => {
      if (text == null) {
        return null;
      }
      const truncated = maxChars != null && text.length > maxChars;
      return {
        text: truncated && maxChars != null ? text.slice(0, maxChars) : text,
        truncated,
      };
    })
    .catch(() => null);
}

function getNextHistoryState(
  current: HistoryState,
  normalizedFolder: string,
): HistoryState {
  const activeFolder = current.entries[current.index];
  if (activeFolder === normalizedFolder) {
    return current;
  }
  const nextEntries = current.entries.slice(0, current.index + 1);
  nextEntries.push(normalizedFolder);
  return { entries: nextEntries, index: nextEntries.length - 1 };
}

function clearPendingFileUrlPaths(
  paths: string[],
  pendingRequests: Set<string>,
) {
  for (const path of paths) {
    pendingRequests.delete(path);
  }
}

async function loadFileUrlChunk(
  chunk: string[],
  pendingRequests: Set<string>,
  settleFileUrlPromises: (
    paths: string[],
    entries: Record<string, FileUrlEntry>,
  ) => void,
) {
  const res = (await callOpenAPI(
    getFileBrowserDownloadUrls({
      body: {
        paths: chunk,
      },
    } as Parameters<typeof getFileBrowserDownloadUrls>[0]),
  )) as GetFileBrowserDownloadURLsRouteResponse;
  clearPendingFileUrlPaths(chunk, pendingRequests);
  if (!res200(res)) {
    const detail = getErrorDetail(res.data);
    console.warn("Failed to load file preview URLs", detail ?? chunk);
    settleFileUrlPromises(chunk, {});
    return null;
  }
  const nextEntries: Record<string, FileUrlEntry> = {};
  for (const entry of res.data) {
    nextEntries[entry.path] = {
      url: entry.url,
      expiresAt: entry.expiresAt,
    };
  }
  settleFileUrlPromises(chunk, nextEntries);
  return nextEntries;
}

async function loadRecursiveFolderListing(
  folder: string,
  ignorePatterns: string[] | null,
  cache: Map<string, Array<FolderContentItem>>,
  activeRequestIdRef: React.MutableRefObject<number>,
  requestId: number,
) {
  const cachedListing = cache.get(folder);
  if (cachedListing) {
    return cachedListing;
  }
  const res = (await callOpenAPI(
    getFolderContents({
      body: {
        folderPath: folder,
        ignorePatterns,
        includeSize: true,
        missingFolderBehavior: "empty",
      },
    } as Parameters<typeof getFolderContents>[0]),
  )) as GetFolderContentsRouteResponse;
  if (activeRequestIdRef.current !== requestId || !res200(res)) {
    return null;
  }
  cache.set(res.data.folderPath, res.data.items);
  return res.data.items;
}

function shouldContinueRecursiveFolderSearch(args: RecursiveFolderSearchArgs) {
  return (
    args.queue.length > 0 &&
    args.visited.size < FILTER_RECURSIVE_MAX_FOLDERS &&
    args.results.length < FILTER_RECURSIVE_MAX_RESULTS &&
    args.activeRequestIdRef.current === args.requestId
  );
}

function takeNextRecursiveFolder(
  queue: string[],
  visited: Set<string>,
): string | null {
  while (queue.length > 0) {
    const nextFolder = queue.shift();
    if (!nextFolder || visited.has(nextFolder)) {
      continue;
    }
    visited.add(nextFolder);
    return nextFolder;
  }
  return null;
}

async function stepRecursiveFolderSearch(
  args: RecursiveFolderSearchArgs,
): Promise<"matched" | "continue" | "stale"> {
  const nextFolder = takeNextRecursiveFolder(args.queue, args.visited);
  if (!nextFolder) {
    return "continue";
  }
  const listing = await loadRecursiveFolderListing(
    nextFolder,
    args.ignorePatterns,
    args.cache,
    args.activeRequestIdRef,
    args.requestId,
  );
  if (!listing) {
    return args.activeRequestIdRef.current !== args.requestId
      ? "stale"
      : "continue";
  }
  enqueueChildFolders(listing, args.queue);
  return appendRecursiveMatches(
    listing,
    args.filterText,
    args.seen,
    args.results,
  )
    ? "matched"
    : "continue";
}

function enqueueChildFolders(
  listing: Array<FolderContentItem>,
  queue: string[],
) {
  for (const entry of listing) {
    if (entry.type.toLowerCase() === "folder") {
      queue.push(entry.fullPath);
    }
  }
}

function appendRecursiveMatches(
  listing: Array<FolderContentItem>,
  filterText: string,
  seen: Set<string>,
  results: Array<FolderContentItem>,
) {
  let didAdd = false;
  const matches = filterFileBrowserFolderItems(listing, filterText);
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
  return didAdd;
}

function resolveItemSubLabel(args: {
  item: FolderContentItem;
  shouldShowFolderPaths: boolean;
  normalizedEffectiveFolder: string | null;
  normalizedRootPath: string | null;
}) {
  if (!args.shouldShowFolderPaths) {
    return null;
  }
  const folderPath = getFileBrowserFolderPathLabel(args.item.fullPath);
  if (!folderPath) {
    return null;
  }
  const normalizedFolder = normalizeFolderPrefix(folderPath);
  if (
    args.normalizedEffectiveFolder &&
    normalizedFolder === args.normalizedEffectiveFolder
  ) {
    return null;
  }
  if (
    args.normalizedEffectiveFolder &&
    normalizedFolder.startsWith(`${args.normalizedEffectiveFolder}/`)
  ) {
    return normalizedFolder.slice(args.normalizedEffectiveFolder.length + 1);
  }
  if (
    args.normalizedRootPath &&
    normalizedFolder.startsWith(`${args.normalizedRootPath}/`)
  ) {
    return normalizedFolder.slice(args.normalizedRootPath.length + 1);
  }
  return normalizedFolder;
}

function resolveItemTooltip(args: {
  item: FolderContentItem;
  showSearchPathTooltips: boolean;
  normalizedEffectiveFolder: string | null;
  normalizedRootPath: string | null;
}) {
  if (!args.showSearchPathTooltips) {
    return null;
  }
  const normalizedItemPath = normalizeFolderPrefix(args.item.fullPath);
  if (
    args.normalizedEffectiveFolder &&
    normalizedItemPath.startsWith(`${args.normalizedEffectiveFolder}/`)
  ) {
    const relative = normalizedItemPath.slice(
      args.normalizedEffectiveFolder.length + 1,
    );
    return relative || normalizedItemPath;
  }
  if (
    args.normalizedRootPath &&
    normalizedItemPath.startsWith(`${args.normalizedRootPath}/`)
  ) {
    const relative = normalizedItemPath.slice(
      args.normalizedRootPath.length + 1,
    );
    return relative || normalizedItemPath;
  }
  return normalizedItemPath;
}

function setRecursiveFilterResultsWithRequestId(
  setRecursiveFilterResults: React.Dispatch<
    React.SetStateAction<Array<FolderContentItem> | null>
  >,
  requestIdRef: React.MutableRefObject<number>,
  nextResults: Array<FolderContentItem> | null,
) {
  setRecursiveFilterResults(nextResults);
  requestIdRef.current += 1;
}

function resolveRecursiveFilterPlan(args: {
  isListView: boolean;
  searchScope: string;
  filterQuery: ReturnType<typeof parseFileBrowserFilterText>;
  rootPath: string | null;
  effectiveFolder: string;
}) {
  if (
    args.isListView ||
    args.searchScope !== "recursive" ||
    args.filterQuery.kind === "none" ||
    !args.rootPath
  ) {
    return { kind: "clear" as const };
  }
  if (
    args.filterQuery.kind === "name" &&
    args.filterQuery.needle.length < FILTER_RECURSIVE_MIN_CHARS
  ) {
    return { kind: "clear" as const };
  }
  const trimmedFolder = args.effectiveFolder.trim();
  if (!trimmedFolder || !isAbsoluteBrowserPath(trimmedFolder)) {
    return { kind: "empty" as const };
  }
  return { kind: "search" as const, trimmedFolder };
}

async function crawlRecursiveFolders(args: RecursiveFolderSearchArgs) {
  while (shouldContinueRecursiveFolderSearch(args)) {
    const stepResult = await stepRecursiveFolderSearch(args);
    if (stepResult === "stale") {
      return;
    }
    if (stepResult === "matched") {
      args.onResults([...args.results]);
    }
  }
}

function useBrowserAreaRootInfo({
  browserStateRootPath,
  browserStateIgnorePatterns,
  browserStatePathSeparator,
}: {
  browserStateRootPath: string;
  browserStateIgnorePatterns: string[];
  browserStatePathSeparator: string;
}) {
  const [rootInfo, setRootInfo] = useState<RootInfo | null>(null);
  const rootRequestIdRef = useRef(0);
  useEffect(() => {
    if (rootInfo || !browserStateRootPath) {
      return;
    }
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
    if (rootInfo) {
      return;
    }
    const requestId = rootRequestIdRef.current + 1;
    rootRequestIdRef.current = requestId;
    const loadRoot = async () => {
      const res = (await callOpenAPI(
        getFileBrowserRoot(),
      )) as GetFileBrowserRootRouteResponse;
      if (!res200(res) || rootRequestIdRef.current !== requestId) {
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
  return { rootInfo, setRootInfo };
}

function useBrowserAreaPathState({
  effectiveFolder,
  rootInfo,
  browserStatePathSeparator,
  browserStateIgnorePatterns,
  filterQueryKind,
  isListView,
}: {
  effectiveFolder: string;
  rootInfo: RootInfo | null;
  browserStatePathSeparator: string;
  browserStateIgnorePatterns: string[];
  filterQueryKind: ReturnType<typeof parseFileBrowserFilterText>["kind"];
  isListView: boolean;
}) {
  const isTooltipKeyHeld = useTooltipKeyHeld(isListView);
  const folderCompletionSource = useFolderCompletionSource({
    effectiveFolder,
    rootInfo,
    browserStatePathSeparator,
    browserStateIgnorePatterns,
  });
  const shouldShowFolderPaths = filterQueryKind !== "none";
  const showSearchPathTooltips = shouldShowFolderPaths && isTooltipKeyHeld;
  const normalizedRootPathForPrefix = useMemo(() => {
    if (!rootInfo?.rootPath) {
      return null;
    }
    return normalizeFolderPrefix(rootInfo.rootPath);
  }, [rootInfo?.rootPath]);
  const normalizedEffectiveFolderForPrefix = useMemo(
    () => normalizeFolderPrefix(effectiveFolder),
    [effectiveFolder],
  );
  const getItemSubLabel = useCallback(
    (item: FolderContentItem): string | null =>
      resolveItemSubLabel({
        item,
        shouldShowFolderPaths,
        normalizedEffectiveFolder: normalizedEffectiveFolderForPrefix,
        normalizedRootPath: normalizedRootPathForPrefix,
      }),
    [
      normalizedEffectiveFolderForPrefix,
      normalizedRootPathForPrefix,
      shouldShowFolderPaths,
    ],
  );
  const getItemTooltip = useCallback(
    (item: FolderContentItem): string | null =>
      resolveItemTooltip({
        item,
        showSearchPathTooltips,
        normalizedEffectiveFolder: normalizedEffectiveFolderForPrefix,
        normalizedRootPath: normalizedRootPathForPrefix,
      }),
    [
      normalizedEffectiveFolderForPrefix,
      normalizedRootPathForPrefix,
      showSearchPathTooltips,
    ],
  );
  return { folderCompletionSource, getItemSubLabel, getItemTooltip };
}

function useTooltipKeyHeld(isListView: boolean) {
  const [isTooltipKeyHeld, setIsTooltipKeyHeld] = useState(false);
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
  return isTooltipKeyHeld;
}

function useFolderCompletionSource(args: {
  effectiveFolder: string;
  rootInfo: RootInfo | null;
  browserStatePathSeparator: string;
  browserStateIgnorePatterns: string[];
}) {
  const folderCompletionOptionsRef = useRef<FolderCompletionOptions>(
    resolveFolderCompletionOptions(args),
  );
  folderCompletionOptionsRef.current = resolveFolderCompletionOptions(args);
  return useMemo(
    () =>
      createDynamicFolderPathCompletionSource(
        () => folderCompletionOptionsRef.current,
      ),
    [],
  );
}

function resolveFolderCompletionOptions(args: {
  effectiveFolder: string;
  rootInfo: RootInfo | null;
  browserStatePathSeparator: string;
  browserStateIgnorePatterns: string[];
}): FolderCompletionOptions {
  return {
    rootPath: resolveFolderCompletionRootPath(
      args.rootInfo,
      args.effectiveFolder,
    ),
    pathSeparator: resolveFolderCompletionPathSeparator(
      args.rootInfo,
      args.browserStatePathSeparator,
    ),
    ignorePatterns: resolveFolderCompletionIgnorePatterns(
      args.rootInfo,
      args.browserStateIgnorePatterns,
    ),
  };
}

function resolveFolderCompletionRootPath(
  rootInfo: RootInfo | null,
  effectiveFolder: string,
) {
  if (rootInfo?.rootPath) {
    return rootInfo.rootPath;
  }
  const fallbackRootPath = effectiveFolder.trim();
  return fallbackRootPath || null;
}

function resolveFolderCompletionPathSeparator(
  rootInfo: RootInfo | null,
  browserStatePathSeparator: string,
) {
  return rootInfo?.pathSeparator ?? browserStatePathSeparator ?? undefined;
}

function resolveFolderCompletionIgnorePatterns(
  rootInfo: RootInfo | null,
  browserStateIgnorePatterns: string[],
) {
  return rootInfo?.ignorePatterns ?? browserStateIgnorePatterns ?? undefined;
}

function resolveNextSelectedCarouselId(args: {
  value: BrowserAreaViewMode;
  filteredVisibleItems: Array<FolderContentItem>;
  selectedCarouselId: string | null;
}) {
  if (args.value !== BrowserAreaViewModeEnum.carousel) {
    return null;
  }
  if (args.filteredVisibleItems.length === 0) {
    return null;
  }
  if (
    args.selectedCarouselId &&
    args.filteredVisibleItems.some(
      (item) => item.fullPath === args.selectedCarouselId,
    )
  ) {
    return args.selectedCarouselId;
  }
  return args.filteredVisibleItems[0]?.fullPath ?? null;
}

function collectImagePreviewPaths(items: Array<FolderContentItem>) {
  return items
    .filter((item) => item.type.toLowerCase() === "file")
    .filter((item) => getBrowserPreviewKind(item) === "image")
    .map((item) => item.fullPath);
}

function useBrowserAreaCarouselState(args: {
  value: BrowserAreaViewMode;
  filteredVisibleItems: Array<FolderContentItem>;
  isListView: boolean;
  requestFileUrls: (
    paths: string[],
    options?: { force?: boolean },
  ) => Promise<Record<string, FileUrlEntry>>;
  requestTextPreview: (item: FolderContentItem) => Promise<void>;
}) {
  const [selectedCarouselId, setSelectedCarouselId] = useState<string | null>(
    null,
  );
  const selectedCarouselItem = useMemo(() => {
    if (!selectedCarouselId) {
      return null;
    }
    return (
      args.filteredVisibleItems.find(
        (item) => item.fullPath === selectedCarouselId,
      ) ?? null
    );
  }, [args.filteredVisibleItems, selectedCarouselId]);
  useEffect(() => {
    setSelectedCarouselId(
      resolveNextSelectedCarouselId({
        value: args.value,
        filteredVisibleItems: args.filteredVisibleItems,
        selectedCarouselId,
      }),
    );
  }, [args.filteredVisibleItems, args.value, selectedCarouselId]);
  useEffect(() => {
    if (args.isListView) {
      return;
    }
    const imagePaths = collectImagePreviewPaths(args.filteredVisibleItems);
    if (imagePaths.length === 0) {
      return;
    }
    void args.requestFileUrls(imagePaths);
  }, [args.filteredVisibleItems, args.isListView, args.requestFileUrls]);
  useEffect(() => {
    if (
      args.value !== BrowserAreaViewModeEnum.carousel ||
      !selectedCarouselItem ||
      getBrowserPreviewKind(selectedCarouselItem) !== "text"
    ) {
      return;
    }
    void args.requestTextPreview(selectedCarouselItem);
  }, [args.requestTextPreview, args.value, selectedCarouselItem]);
  return { selectedCarouselId, setSelectedCarouselId, selectedCarouselItem };
}

function useBrowserAreaFilePreviewState() {
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

function getFreshFileUrlEntry(
  entry: FileUrlEntry | null | undefined,
  now: number,
): FileUrlEntry | null {
  return entry && !isFileUrlStale(entry, now) ? entry : null;
}

async function waitForFreshFileUrlEntry(
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

async function refreshFileUrlEntry(
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

function useBrowserAreaSectionActions(args: {
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

function useBrowserAreaOpenHandlers(args: {
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

function useRecursiveBrowserFilterState({
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

function useBrowserAreaHistoryState({
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

function useBrowserAreaFolderState(args: {
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

function useVisibleBrowserItems(args: {
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

export function BrowserAreaItemsColumn({
  sectionId,
  viewMode,
  folder,
  filesColumnWidth,
  onFilesColumnResizeStart,
  savedSearches,
  isFrozen,
}: BrowserAreaItemsColumnProps) {
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
  const { rootInfo } = useBrowserAreaRootInfo({
    browserStateRootPath,
    browserStateIgnorePatterns,
    browserStatePathSeparator,
  });
  const isListView = value === BrowserAreaViewModeEnum.list;
  const filterQuery = useMemo(
    () => parseFileBrowserFilterText(filterText),
    [filterText],
  );
  const {
    items,
    folderContentsCacheRef,
    effectiveFolder,
    setFolder,
    breadcrumbs,
    parentFolderPath,
  } = useBrowserAreaFolderState({
    folder,
    rootInfo,
    isListView,
  });
  const { folderCompletionSource, getItemSubLabel, getItemTooltip } =
    useBrowserAreaPathState({
      effectiveFolder,
      rootInfo,
      browserStatePathSeparator,
      browserStateIgnorePatterns,
      filterQueryKind: filterQuery.kind,
      isListView,
    });
  const recursiveFilterResults = useRecursiveBrowserFilterState({
    isListView,
    searchScope,
    filterQuery,
    rootInfo,
    effectiveFolder,
    items,
    filterText,
    cache: folderContentsCacheRef,
  });
  const filteredVisibleItems = useVisibleBrowserItems({
    isListView,
    items,
    filterQuery,
    recursiveFilterResults,
    filterText,
    typeFilters,
  });
  const {
    fileUrlMap,
    textPreviewMap,
    requestFileUrls,
    getFileUrlEntry,
    requestTextPreview,
  } = useBrowserAreaFilePreviewState();
  const { selectedCarouselId, setSelectedCarouselId } =
    useBrowserAreaCarouselState({
      value,
      filteredVisibleItems,
      isListView,
      requestFileUrls,
      requestTextPreview,
    });
  const { setView, handleSaveSearch } = useBrowserAreaSectionActions({
    sectionId,
    setValue,
    canSaveSearch,
    savedSearches,
    searchScope,
    typeFilters,
  });
  const { handleOpenFolder, handleOpenFile } = useBrowserAreaOpenHandlers({
    setFolder,
    getFileUrlEntry,
  });
  const { canGoBack, canGoForward, handleGoBack, handleGoForward, handleGoUp } =
    useBrowserAreaHistoryState({
      effectiveFolder,
      isListView,
      parentFolderPath,
      setFolder,
    });
  useEffect(() => {
    const trimmed = effectiveFolder.trim();
    if (!trimmed) {
      return;
    }
    if (rootInfo?.rootPath && !isAbsoluteBrowserPath(trimmed)) {
      return;
    }
    useBrowserSectionFileBrowserState.setState({
      rootPath: trimmed,
    });
  }, [effectiveFolder, rootInfo?.rootPath]);
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
          <ViewSelector view={value} setView={setView} />
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
