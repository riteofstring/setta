import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";

import {
  getFileBrowserDownloadUrls,
  getFileBrowserRoot,
  getFolderContents,
  type FilebrowserFolderContentItem as FolderContentItem,
} from "openapi/http";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBrowserSectionFileBrowserState } from "state/definitions";

import { isAbsoluteBrowserPath } from "utils/browserPaths";

import {
  filterFileBrowserFolderItems,
  parseFileBrowserFilterText,
} from "utils/fileBrowserFilter";

import { getFileBrowserFolderPathLabel } from "utils/fileBrowserTypes";

import {
  BrowserAreaViewMode,
  BrowserAreaViewModeEnum,
  BrowserSavedSearch,
} from "utils/generatedTypes";

import {
  FILTER_RECURSIVE_MAX_FOLDERS,
  FILTER_RECURSIVE_MAX_RESULTS,
  FILTER_RECURSIVE_MIN_CHARS,
  getBrowserPreviewKind,
  isFileUrlStale,
  normalizeFolderPrefix,
  type FileTextPreview,
  type FileUrlEntry,
  type GetFileBrowserDownloadURLsRouteResponse,
  type GetFileBrowserRootRouteResponse,
  type GetFolderContentsRouteResponse,
} from "../browserAreaShared";

export type BrowserAreaItemsColumnProps = {
  sectionId: string;
  viewMode: BrowserAreaViewMode;
  folder: string;
  filesColumnWidth: string;
  onFilesColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  savedSearches: BrowserSavedSearch[];
  isFrozen: boolean;
};

export type RootInfo = {
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

export type HistoryState = {
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

export type FileUrlRequestOptions = {
  force?: boolean;
};

export function createTextPreviewEntry(
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

export function setTextPreviewEntry(
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

export function getPendingFileUrlPaths(
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

export function readFileText(
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

export function getNextHistoryState(
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

export async function loadFileUrlChunk(
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

export function setRecursiveFilterResultsWithRequestId(
  setRecursiveFilterResults: React.Dispatch<
    React.SetStateAction<Array<FolderContentItem> | null>
  >,
  requestIdRef: React.MutableRefObject<number>,
  nextResults: Array<FolderContentItem> | null,
) {
  setRecursiveFilterResults(nextResults);
  requestIdRef.current += 1;
}

export function resolveRecursiveFilterPlan(args: {
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

export async function crawlRecursiveFolders(args: RecursiveFolderSearchArgs) {
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

export function useBrowserAreaRootInfo({
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

export function useBrowserAreaPathState({
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

export function useBrowserAreaCarouselState(args: {
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
