import { createFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileBrowserState } from "state/stores/fileBrowserStores";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { parseFileBrowserFilterText } from "utils/fileBrowserFilter";
import {
  buildFileBrowserBreadcrumbs,
  getFileBrowserParentPath,
} from "utils/fileBrowserNavigation";
import { normalizeFileBrowserPathForComparison } from "utils/fileBrowserPathRelation";
import { filterFileBrowserItemsByTypeFilters } from "utils/fileBrowserTypes";
import {
  route_check_workspace_initialized,
  route_get_file_browser_download_urls,
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import {
  buildFileBrowserLoadingPathOwner,
  flattenFileBrowserTree,
  forEachWithConcurrencyLimit,
  getDisplayNameFromPath,
  getSettaBadgeRefreshFolderPaths,
  isOwnedFileBrowserLoadingPath,
  shouldLoadRootWorkspaceInitializationMetadata,
  shouldRefreshSettaBadgeDataOnToggleChange,
  sortChildPaths,
  type FileNode,
  type FileUrlEntry,
  type SortDirection,
  type SortKey,
} from "./fileBrowserPaneTreeModel";

const MAX_ENTRIES = 5000;
const FILTER_RECURSIVE_MIN_CHARS = 2;
const FILTER_RECURSIVE_MAX_FOLDERS = 600;
const FILE_URL_REFRESH_BUFFER_MS = 30_000;
const SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT = 8;

type UseFileBrowserPaneTreeDataArgs = {
  allowOutsideWorkspaceRoot: boolean;
  fileBrowserState: typeof useFileBrowserState;
  includeSettaInitializedFolders: boolean;
  onSelectionChange?: (node: FileNode | null) => void;
  showPathNavigation: boolean;
};

export function useFileBrowserPaneTreeData({
  allowOutsideWorkspaceRoot,
  fileBrowserState,
  includeSettaInitializedFolders,
  onSelectionChange,
  showPathNavigation,
}: UseFileBrowserPaneTreeDataArgs) {
  const {
    rootPath,
    expandedPaths,
    selectedPath,
    filterText,
    typeFilters,
    searchScope,
  } = fileBrowserState((state) => ({
    rootPath: state.rootPath,
    expandedPaths: state.expandedPaths,
    selectedPath: state.selectedPath,
    filterText: state.filterText,
    typeFilters: state.typeFilters,
    searchScope: state.searchScope,
  }));
  const [nodesByPath, setNodesByPath] = useState<Record<string, FileNode>>({});
  const nodesByPathRef = useRef(nodesByPath);
  useEffect(() => {
    nodesByPathRef.current = nodesByPath;
  }, [nodesByPath]);
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, string[]>
  >({});
  const childrenByPathRef = useRef(childrenByPath);
  useEffect(() => {
    childrenByPathRef.current = childrenByPath;
  }, [childrenByPath]);
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const loadingPathOwnerByPathRef = useRef<Record<string, string>>({});
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({});
  const [browserRootPath, setBrowserRootPath] = useState<string | null>(null);
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([]);
  const [pathSeparator, setPathSeparator] = useState("/");
  const [rootError, setRootError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [fileUrlMap, setFileUrlMap] = useState<Record<string, FileUrlEntry>>(
    {},
  );
  const fileUrlMapRef = useRef(fileUrlMap);
  useEffect(() => {
    fileUrlMapRef.current = fileUrlMap;
  }, [fileUrlMap]);
  const fileUrlRequests = useRef<Set<string>>(new Set());
  const didLoadRootRef = useRef(false);
  const rootRequestIdRef = useRef(0);
  const folderRequestIdRef = useRef<Record<string, number>>({});
  const filterRequestIdRef = useRef(0);
  const appliedRootRef = useRef<string | null>(null);
  const includeSettaInitializedRef = useRef(includeSettaInitializedFolders);
  const applyRootPathRef =
    useRef<
      (
        nextRoot: string,
        separatorOverride?: string,
        ignoreOverride?: string[],
      ) => void
    >();

  const fetchFolderContents = useCallback(
    async (
      folderPath: string,
      ignoreOverride?: string[],
      rootRequestId?: number,
    ): Promise<FileNode[] | null> => {
      const activeIgnorePatterns = ignoreOverride ?? ignorePatterns;
      const activeRootRequestId = rootRequestId ?? rootRequestIdRef.current;
      const nextRequestId = (folderRequestIdRef.current[folderPath] ?? 0) + 1;
      const requestOwner = buildFileBrowserLoadingPathOwner({
        rootRequestId: activeRootRequestId,
        folderRequestId: nextRequestId,
      });
      folderRequestIdRef.current[folderPath] = nextRequestId;
      loadingPathOwnerByPathRef.current[folderPath] = requestOwner;
      setLoadingPaths((prev) => ({ ...prev, [folderPath]: true }));
      const clearLoadingPathForRequest = () => {
        if (
          !isOwnedFileBrowserLoadingPath({
            loadingPathOwnerByPath: loadingPathOwnerByPathRef.current,
            folderPath,
            requestOwner,
          })
        ) {
          return;
        }
        delete loadingPathOwnerByPathRef.current[folderPath];
        setLoadingPaths((prev) => {
          if (!(folderPath in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[folderPath];
          return next;
        });
      };
      try {
        const response = await route_get_folder_contents({
          folderPath,
          ignorePatterns: activeIgnorePatterns,
          maxEntries: MAX_ENTRIES,
          includeMtime: true,
          includeSettaInitialized: includeSettaInitializedRef.current,
          allowOutsideWorkspaceRoot,
          missingFolderBehavior: "empty",
        });
        if (rootRequestIdRef.current !== activeRootRequestId) {
          return null;
        }
        if (folderRequestIdRef.current[folderPath] !== nextRequestId) {
          return null;
        }
        let loadedNodes: FileNode[] | null = null;
        if (res200(response)) {
          const items = response.data;
          loadedNodes = items.map((item) => ({
            name: item.name,
            fullPath: item.fullPath,
            type: item.type,
            parentPath: folderPath,
            mtime: item.mtime ?? null,
            isSettaInitialized: item.isSettaInitialized ?? false,
          }));
          const childPaths = loadedNodes.map((node) => node.fullPath);
          setNodesByPath((prev) => {
            const next = { ...prev };
            for (const node of loadedNodes ?? []) {
              next[node.fullPath] = node;
            }
            return next;
          });
          setChildrenByPath((prev) => ({
            ...prev,
            [folderPath]: childPaths,
          }));
          setErrorByPath((prev) => {
            if (!(folderPath in prev)) {
              return prev;
            }
            const next = { ...prev };
            delete next[folderPath];
            return next;
          });
          const activeRootPath = fileBrowserState.getState().rootPath;
          if (activeRootPath === folderPath) {
            setRootError(null);
          }
          if (
            shouldLoadRootWorkspaceInitializationMetadata({
              includeSettaInitializedFolders:
                includeSettaInitializedRef.current,
              folderPath,
              rootPath: activeRootPath,
            })
          ) {
            const initializationResponse =
              await route_check_workspace_initialized({
                folderPath,
                allowOutsideWorkspaceRoot,
              });
            if (rootRequestIdRef.current !== activeRootRequestId) {
              return null;
            }
            if (folderRequestIdRef.current[folderPath] !== nextRequestId) {
              return null;
            }
            if (res200(initializationResponse)) {
              const isSettaInitialized = initializationResponse.data === true;
              setNodesByPath((prev) => {
                const folderNode = prev[folderPath];
                if (!folderNode || folderNode.type !== "folder") {
                  return prev;
                }
                if (folderNode.isSettaInitialized === isSettaInitialized) {
                  return prev;
                }
                return {
                  ...prev,
                  [folderPath]: {
                    ...folderNode,
                    isSettaInitialized,
                  },
                };
              });
            }
          }
        } else {
          let errorMessage = "Failed to load folder contents.";
          const detail = getErrorDetail(response.data);
          if (detail) {
            errorMessage = detail;
          } else if (response.hasResponse && response.status !== undefined) {
            errorMessage = `Failed to load folder contents (${response.status}).`;
          }
          setErrorByPath((prev) => ({ ...prev, [folderPath]: errorMessage }));
          const activeRootPath = fileBrowserState.getState().rootPath;
          if (activeRootPath === folderPath) {
            setRootError(errorMessage);
          }
        }
        return loadedNodes;
      } finally {
        clearLoadingPathForRequest();
      }
    },
    [allowOutsideWorkspaceRoot, fileBrowserState, ignorePatterns],
  );

  const applyRootPath = useCallback(
    (
      nextRoot: string,
      separatorOverride?: string,
      ignoreOverride?: string[],
    ) => {
      const trimmed = nextRoot.trim();
      if (!trimmed) {
        setRootError("Root path is required.");
        return;
      }
      appliedRootRef.current = trimmed;
      const separator = separatorOverride ?? pathSeparator;
      const displayName = getDisplayNameFromPath(trimmed, separator);
      rootRequestIdRef.current += 1;
      const rootRequestId = rootRequestIdRef.current;
      folderRequestIdRef.current = {};
      loadingPathOwnerByPathRef.current = {};
      setRootError(null);
      fileBrowserState.setState({
        rootPath: trimmed,
        selectedPath: trimmed,
        expandedPaths: { [trimmed]: true },
      });
      setNodesByPath({
        [trimmed]: {
          name: displayName,
          fullPath: trimmed,
          type: "folder",
          parentPath: null,
        },
      });
      setChildrenByPath({});
      setErrorByPath({});
      setLoadingPaths({});
      void fetchFolderContents(trimmed, ignoreOverride, rootRequestId);
    },
    [fetchFolderContents, fileBrowserState, pathSeparator],
  );

  const refreshLoadedFoldersForSettaBadges = useCallback(async () => {
    if (!rootPath) {
      return;
    }
    rootRequestIdRef.current += 1;
    const refreshRequestId = rootRequestIdRef.current;
    folderRequestIdRef.current = {};
    const folderPaths = getSettaBadgeRefreshFolderPaths({
      rootPath,
      expandedPaths,
      nodesByPath: nodesByPathRef.current,
    });
    await forEachWithConcurrencyLimit({
      items: folderPaths,
      limit: SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT,
      run: async (path) => {
        await fetchFolderContents(path, undefined, refreshRequestId);
      },
    });
  }, [expandedPaths, fetchFolderContents, rootPath]);

  const sortedChildrenByPath = useMemo(() => {
    const next: Record<string, string[]> = {};
    for (const [path, childPaths] of Object.entries(childrenByPath)) {
      next[path] = sortChildPaths({
        paths: childPaths,
        nodesByPath,
        sortKey,
        sortDirection,
      });
    }
    return next;
  }, [childrenByPath, nodesByPath, sortDirection, sortKey]);

  const getSortedChildPaths = useCallback(
    (path: string) => sortedChildrenByPath[path] ?? [],
    [sortedChildrenByPath],
  );
  const navigationRootPath =
    allowOutsideWorkspaceRoot && showPathNavigation
      ? rootPath
      : browserRootPath ?? rootPath;
  const pathCompletionSource = useMemo(
    () =>
      createFolderPathCompletionSource({
        rootPath: navigationRootPath,
        pathSeparator,
        ignorePatterns,
        allowOutsideWorkspaceRoot,
      }),
    [
      allowOutsideWorkspaceRoot,
      ignorePatterns,
      navigationRootPath,
      pathSeparator,
    ],
  );
  const breadcrumbs = useMemo(() => {
    if (!rootPath) {
      return [];
    }
    return buildFileBrowserBreadcrumbs({
      rootPath: navigationRootPath,
      currentPath: rootPath,
    });
  }, [navigationRootPath, rootPath]);
  const parentPath = useMemo(() => {
    if (!rootPath) {
      return null;
    }
    return getFileBrowserParentPath({
      rootPath: navigationRootPath,
      currentPath: rootPath,
    });
  }, [navigationRootPath, rootPath]);

  useEffect(() => {
    applyRootPathRef.current = applyRootPath;
  }, [applyRootPath]);

  useEffect(() => {
    if (!rootPath) {
      return;
    }
    if (appliedRootRef.current === rootPath) {
      return;
    }
    applyRootPath(rootPath, pathSeparator, ignorePatterns);
  }, [applyRootPath, ignorePatterns, pathSeparator, rootPath]);

  useEffect(() => {
    if (!rootPath) {
      includeSettaInitializedRef.current = includeSettaInitializedFolders;
      return;
    }
    const previousIncludeSettaInitializedFolders =
      includeSettaInitializedRef.current;
    if (
      previousIncludeSettaInitializedFolders === includeSettaInitializedFolders
    ) {
      return;
    }
    includeSettaInitializedRef.current = includeSettaInitializedFolders;
    if (
      !shouldRefreshSettaBadgeDataOnToggleChange({
        previousIncludeSettaInitializedFolders,
        nextIncludeSettaInitializedFolders: includeSettaInitializedFolders,
      })
    ) {
      return;
    }
    void refreshLoadedFoldersForSettaBadges();
  }, [
    includeSettaInitializedFolders,
    refreshLoadedFoldersForSettaBadges,
    rootPath,
  ]);

  useEffect(() => {
    if (didLoadRootRef.current) {
      return;
    }
    didLoadRootRef.current = true;
    const loadRoot = async () => {
      const response = await route_get_file_browser_root();
      if (!res200(response)) {
        let errorMessage = "Failed to load file browser root.";
        if (response.hasResponse && response.status !== undefined) {
          errorMessage = `Failed to load file browser root (${response.status}).`;
        }
        setRootError(errorMessage);
        return;
      }
      setBrowserRootPath(response.data.rootPath);
      setIgnorePatterns(response.data.ignorePatterns);
      setPathSeparator(response.data.pathSeparator);
      fileBrowserState.setState({
        pathSeparator: response.data.pathSeparator,
        ignorePatterns: response.data.ignorePatterns,
      });
      const preferredRoot =
        fileBrowserState.getState().rootPath ?? response.data.rootPath;
      applyRootPathRef.current?.(
        preferredRoot,
        response.data.pathSeparator,
        response.data.ignorePatterns,
      );
    };
    void loadRoot();
  }, [fileBrowserState]);

  useEffect(() => {
    if (searchScope !== "recursive") {
      filterRequestIdRef.current += 1;
      return;
    }
    const query = parseFileBrowserFilterText(filterText);
    if (query.kind === "none") {
      filterRequestIdRef.current += 1;
      return;
    }
    if (
      query.kind === "name" &&
      query.needle.length < FILTER_RECURSIVE_MIN_CHARS
    ) {
      filterRequestIdRef.current += 1;
      return;
    }
    if (!rootPath) {
      return;
    }

    const requestId = filterRequestIdRef.current + 1;
    filterRequestIdRef.current = requestId;
    const rootRequestId = rootRequestIdRef.current;
    const queue: string[] = [rootPath];
    const visited = new Set<string>();

    const crawl = async () => {
      while (
        queue.length > 0 &&
        visited.size < FILTER_RECURSIVE_MAX_FOLDERS &&
        filterRequestIdRef.current === requestId
      ) {
        const folder = queue.shift();
        if (!folder || visited.has(folder)) {
          continue;
        }
        visited.add(folder);

        const cachedChildren = childrenByPathRef.current[folder];
        if (cachedChildren !== undefined) {
          for (const childPath of cachedChildren) {
            const childNode = nodesByPathRef.current[childPath];
            if (childNode?.type === "folder") {
              queue.push(childPath);
            }
          }
          continue;
        }

        const loaded = await fetchFolderContents(
          folder,
          undefined,
          rootRequestId,
        );
        if (filterRequestIdRef.current !== requestId) {
          return;
        }
        if (!loaded) {
          continue;
        }
        for (const node of loaded) {
          if (node.type === "folder") {
            queue.push(node.fullPath);
          }
        }
      }
    };

    void crawl();
  }, [fetchFolderContents, filterText, rootPath, searchScope]);

  const requestFileUrls = useCallback(async (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }
    const now = Date.now();
    const pending = paths.filter((path) => {
      const existing = fileUrlMapRef.current[path];
      if (
        existing &&
        existing.expiresAt * 1000 - FILE_URL_REFRESH_BUFFER_MS > now
      ) {
        return false;
      }
      if (fileUrlRequests.current.has(path)) {
        return false;
      }
      return true;
    });
    if (pending.length === 0) {
      return;
    }
    for (const path of pending) {
      fileUrlRequests.current.add(path);
    }
    const response = await route_get_file_browser_download_urls({
      paths: pending,
    });
    for (const path of pending) {
      fileUrlRequests.current.delete(path);
    }
    if (!res200(response)) {
      const detail = getErrorDetail(response.data);
      console.warn("Failed to load file preview URLs", detail ?? pending);
      return;
    }
    const nextEntries: Record<string, FileUrlEntry> = {};
    for (const entry of response.data) {
      nextEntries[entry.path] = { url: entry.url, expiresAt: entry.expiresAt };
    }
    setFileUrlMap((prev) => ({ ...prev, ...nextEntries }));
  }, []);

  const flattenedItems = useMemo(
    () =>
      flattenFileBrowserTree({
        rootPath,
        nodesByPath,
        expandedPaths,
        filterText,
        searchScope,
        getChildPaths: getSortedChildPaths,
      }),
    [
      expandedPaths,
      filterText,
      getSortedChildPaths,
      nodesByPath,
      rootPath,
      searchScope,
    ],
  );
  const displayedItems = useMemo(
    () => filterFileBrowserItemsByTypeFilters(flattenedItems, typeFilters),
    [flattenedItems, typeFilters],
  );
  const selectedIndex = useMemo(() => {
    if (!selectedPath) {
      return -1;
    }
    return displayedItems.findIndex((item) => item.fullPath === selectedPath);
  }, [displayedItems, selectedPath]);

  const handleSort = useCallback((nextKey: SortKey) => {
    setSortKey((previousKey) => {
      if (previousKey === nextKey) {
        setSortDirection((previousDirection) =>
          previousDirection === "asc" ? "desc" : "asc",
        );
        return previousKey;
      }
      setSortDirection(nextKey === "modified" ? "desc" : "asc");
      return nextKey;
    });
  }, []);

  const handleToggle = useCallback(
    (path: string) => {
      const node = nodesByPath[path];
      if (!node || node.type !== "folder") {
        return;
      }
      const isExpanded = expandedPaths[path] === true;
      fileBrowserState.setState((state) => {
        const next = { ...state.expandedPaths };
        if (isExpanded) {
          delete next[path];
        } else {
          next[path] = true;
        }
        return { expandedPaths: next };
      });
      if (!isExpanded && childrenByPath[path] === undefined) {
        void fetchFolderContents(path);
      }
    },
    [
      childrenByPath,
      expandedPaths,
      fetchFolderContents,
      fileBrowserState,
      nodesByPath,
    ],
  );

  const handleSelect = useCallback(
    (path: string) => {
      fileBrowserState.setState({ selectedPath: path });
      if (!onSelectionChange) {
        return;
      }
      onSelectionChange(nodesByPath[path] ?? null);
    },
    [fileBrowserState, nodesByPath, onSelectionChange],
  );

  const handleNavigateToPath = useCallback(
    (nextPath: string) => {
      const trimmed = nextPath.trim();
      if (!trimmed) {
        setRootError("Root path is required.");
        return;
      }
      if (
        normalizeFileBrowserPathForComparison(trimmed) ===
        normalizeFileBrowserPathForComparison(rootPath ?? "")
      ) {
        return;
      }
      applyRootPath(trimmed);
    },
    [applyRootPath, rootPath],
  );

  const handleNavigateUp = useCallback(() => {
    if (!parentPath) {
      return;
    }
    handleNavigateToPath(parentPath);
  }, [handleNavigateToPath, parentPath]);

  return {
    breadcrumbs,
    childrenByPath,
    displayedItems,
    errorByPath,
    expandedPaths,
    fetchFolderContents,
    fileUrlMap,
    filterText,
    handleNavigateToPath,
    handleNavigateUp,
    handleSelect,
    handleSort,
    handleToggle,
    loadingPaths,
    nodesByPath,
    parentPath,
    pathCompletionSource,
    requestFileUrls,
    rootError,
    rootPath,
    selectedIndex,
    selectedPath,
    sortDirection,
    sortKey,
  };
}
