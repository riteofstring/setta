import {
  checkWorkspaceInitialized,
  getFileBrowserRoot,
  getFolderContents,
  type FilebrowserListFolderResponse,
  type FilebrowserRootResponse,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import { parseFileBrowserFilterText } from "utils/fileBrowserFilter";
import type { FileBrowserSearchScope } from "utils/fileBrowserTypes";
import {
  buildFileBrowserLoadingPathOwner,
  forEachWithConcurrencyLimit,
  getDisplayNameFromPath,
  getResolvedFileBrowserRootState,
  getSettaBadgeRefreshFolderPaths,
  isOwnedFileBrowserLoadingPath,
  shouldLoadRootWorkspaceInitializationMetadata,
  shouldRefreshSettaBadgeDataOnToggleChange,
} from "./fileBrowserPaneCore";
import {
  FILTER_RECURSIVE_MAX_FOLDERS,
  FILTER_RECURSIVE_MIN_CHARS,
  MAX_ENTRIES,
  SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT,
  type FileNode,
} from "./fileBrowserPaneShared";
import { useSyncedRef } from "./useSyncedRef";

type CheckWorkspaceInitializedRouteResponse = ResponseDataAndStatus<boolean>;
type FileBrowserRootRouteResponse =
  ResponseDataAndStatus<FilebrowserRootResponse>;
type FolderContentsRouteResponse =
  ResponseDataAndStatus<FilebrowserListFolderResponse>;

function buildLoadedNodes(
  resolvedFolderPath: string,
  items: FilebrowserListFolderResponse["items"],
): FileNode[] {
  return items.map((item) => ({
    name: item.name,
    fullPath: item.fullPath,
    type: item.type,
    parentPath: resolvedFolderPath,
    mtime: item.mtime ?? null,
    isSettaInitialized: item.isSettaInitialized ?? false,
  }));
}

function isStaleFolderResponse(args: {
  activeRootRequestId: number;
  nextRequestId: number;
  folderPath: string;
  rootRequestIdRef: MutableRefObject<number>;
  folderRequestIdRef: MutableRefObject<Record<string, number>>;
}): boolean {
  return (
    args.rootRequestIdRef.current !== args.activeRootRequestId ||
    args.folderRequestIdRef.current[args.folderPath] !== args.nextRequestId
  );
}

function clearFolderErrors(args: {
  resolvedFolderPath: string;
  folderPath: string;
  setErrorByPath: Dispatch<SetStateAction<Record<string, string>>>;
}): void {
  args.setErrorByPath((prev) => {
    if (!(args.resolvedFolderPath in prev) && !(args.folderPath in prev)) {
      return prev;
    }
    const next = { ...prev };
    delete next[args.resolvedFolderPath];
    delete next[args.folderPath];
    return next;
  });
}

function applyResolvedRootPath(args: {
  activeRootPath: string | null;
  folderPath: string;
  resolvedFolderPath: string;
  fileBrowserState: typeof import("state/definitions").useFileBrowserState;
  appliedRootRef: MutableRefObject<string | null>;
  setNodesByPath: Dispatch<SetStateAction<Record<string, FileNode>>>;
}): string | null {
  if (
    args.activeRootPath !== args.folderPath ||
    args.resolvedFolderPath === args.folderPath
  ) {
    return args.activeRootPath;
  }
  args.appliedRootRef.current = args.resolvedFolderPath;
  args.fileBrowserState.setState((state) =>
    getResolvedFileBrowserRootState({
      state,
      requestedRootPath: args.folderPath,
      resolvedRootPath: args.resolvedFolderPath,
    }),
  );
  args.setNodesByPath((prev) => {
    const rootNode = prev[args.folderPath];
    if (!rootNode || rootNode.type !== "folder") {
      return prev;
    }
    const next = { ...prev };
    delete next[args.folderPath];
    next[args.resolvedFolderPath] = {
      ...rootNode,
      fullPath: args.resolvedFolderPath,
    };
    return next;
  });
  return args.resolvedFolderPath;
}

function resolveFolderLoadError(res: FolderContentsRouteResponse): string {
  const detail = getErrorDetail(res.data);
  if (detail) {
    return detail;
  }
  if (res.hasResponse && res.status !== undefined) {
    return `Failed to load folder contents (${res.status}).`;
  }
  return "Failed to load folder contents.";
}

async function refreshWorkspaceInitialization(args: {
  folderPath: string;
  resolvedFolderPath: string;
  allowOutsideWorkspaceRoot: boolean;
  activeRootRequestId: number;
  nextRequestId: number;
  rootRequestIdRef: MutableRefObject<number>;
  folderRequestIdRef: MutableRefObject<Record<string, number>>;
  setNodesByPath: Dispatch<SetStateAction<Record<string, FileNode>>>;
}): Promise<void> {
  const initializationRes = (await callOpenAPI(
    checkWorkspaceInitialized({
      body: {
        folderPath: args.resolvedFolderPath,
        allowOutsideWorkspaceRoot: args.allowOutsideWorkspaceRoot,
      },
    } as Parameters<typeof checkWorkspaceInitialized>[0]),
  )) as CheckWorkspaceInitializedRouteResponse;
  if (
    isStaleFolderResponse({
      activeRootRequestId: args.activeRootRequestId,
      nextRequestId: args.nextRequestId,
      folderPath: args.folderPath,
      rootRequestIdRef: args.rootRequestIdRef,
      folderRequestIdRef: args.folderRequestIdRef,
    }) ||
    !res200(initializationRes)
  ) {
    return;
  }
  const isSettaInitialized = initializationRes.data === true;
  args.setNodesByPath((prev) => {
    const folderNode = prev[args.resolvedFolderPath];
    if (!folderNode || folderNode.type !== "folder") {
      return prev;
    }
    if (folderNode.isSettaInitialized === isSettaInitialized) {
      return prev;
    }
    return {
      ...prev,
      [args.resolvedFolderPath]: {
        ...folderNode,
        isSettaInitialized,
      },
    };
  });
}

async function crawlRecursiveSearch(args: {
  rootPath: string;
  requestId: number;
  rootRequestId: number;
  filterRequestIdRef: MutableRefObject<number>;
  fetchFolderContents: (
    folderPath: string,
    ignoreOverride?: string[],
    rootRequestId?: number,
  ) => Promise<FileNode[] | null>;
  childrenByPathRef: MutableRefObject<Record<string, string[]>>;
  nodesByPathRef: MutableRefObject<Record<string, FileNode>>;
}): Promise<void> {
  const queue: string[] = [args.rootPath];
  const visited = new Set<string>();
  const enqueueFolderPaths = (paths: string[]) => {
    for (const path of paths) {
      queue.push(path);
    }
  };
  const getCachedFolderChildren = (folder: string): string[] | null => {
    const cachedChildren = args.childrenByPathRef.current[folder];
    if (cachedChildren === undefined) {
      return null;
    }
    return cachedChildren.filter(
      (childPath) => args.nodesByPathRef.current[childPath]?.type === "folder",
    );
  };
  const getLoadedFolderChildren = async (folder: string): Promise<string[]> => {
    const loaded = await args.fetchFolderContents(
      folder,
      undefined,
      args.rootRequestId,
    );
    if (args.filterRequestIdRef.current !== args.requestId || !loaded) {
      return [];
    }
    return loaded
      .filter((node) => node.type === "folder")
      .map((node) => node.fullPath);
  };
  while (
    queue.length > 0 &&
    visited.size < FILTER_RECURSIVE_MAX_FOLDERS &&
    args.filterRequestIdRef.current === args.requestId
  ) {
    const folder = queue.shift();
    if (!folder || visited.has(folder)) {
      continue;
    }
    visited.add(folder);
    const cachedChildren = getCachedFolderChildren(folder);
    if (cachedChildren !== null) {
      enqueueFolderPaths(cachedChildren);
      continue;
    }
    enqueueFolderPaths(await getLoadedFolderChildren(folder));
  }
}

type UseFileBrowserPaneDataArgs = {
  fileBrowserState: typeof import("state/definitions").useFileBrowserState;
  rootPath: string | null;
  expandedPaths: Record<string, boolean>;
  filterText: string;
  searchScope: FileBrowserSearchScope;
  allowOutsideWorkspaceRoot: boolean;
  includeSettaInitializedFolders: boolean;
};

export function useFileBrowserPaneData({
  fileBrowserState,
  rootPath,
  expandedPaths,
  filterText,
  searchScope,
  allowOutsideWorkspaceRoot,
  includeSettaInitializedFolders,
}: UseFileBrowserPaneDataArgs) {
  const [nodesByPath, setNodesByPath] = useState<Record<string, FileNode>>({});
  const nodesByPathRef = useSyncedRef(nodesByPath);
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, string[]>
  >({});
  const childrenByPathRef = useSyncedRef(childrenByPath);
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const loadingPathOwnerByPathRef = useRef<Record<string, string>>({});
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({});
  const [browserRootPath, setBrowserRootPath] = useState<string | null>(null);
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([]);
  const [pathSeparator, setPathSeparator] = useState("/");
  const [rootError, setRootError] = useState<string | null>(null);
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
        const res = (await callOpenAPI(
          getFolderContents({
            body: {
              folderPath,
              ignorePatterns: activeIgnorePatterns,
              maxEntries: MAX_ENTRIES,
              includeMtime: true,
              includeSettaInitialized: includeSettaInitializedRef.current,
              allowOutsideWorkspaceRoot,
              missingFolderBehavior: "empty",
            },
          } as Parameters<typeof getFolderContents>[0]),
        )) as FolderContentsRouteResponse;
        if (
          isStaleFolderResponse({
            activeRootRequestId,
            nextRequestId,
            folderPath,
            rootRequestIdRef,
            folderRequestIdRef,
          })
        ) {
          return null;
        }
        if (!res200(res)) {
          const errorMessage = resolveFolderLoadError(res);
          setErrorByPath((prev) => ({ ...prev, [folderPath]: errorMessage }));
          if (fileBrowserState.getState().rootPath === folderPath) {
            setRootError(errorMessage);
          }
          return null;
        }

        const resolvedFolderPath = res.data.folderPath;
        const loadedNodes = buildLoadedNodes(
          resolvedFolderPath,
          res.data.items,
        );
        const childPaths = loadedNodes.map((node) => node.fullPath);
        setNodesByPath((prev) => ({
          ...prev,
          ...Object.fromEntries(
            loadedNodes.map((node) => [node.fullPath, node] as const),
          ),
        }));
        setChildrenByPath((prev) => ({
          ...prev,
          [resolvedFolderPath]: childPaths,
        }));
        clearFolderErrors({ resolvedFolderPath, folderPath, setErrorByPath });

        const activeRootPath = fileBrowserState.getState().rootPath;
        const effectiveRootPath = applyResolvedRootPath({
          activeRootPath,
          folderPath,
          resolvedFolderPath,
          fileBrowserState,
          appliedRootRef,
          setNodesByPath,
        });
        if (
          effectiveRootPath === resolvedFolderPath ||
          effectiveRootPath === folderPath
        ) {
          setRootError(null);
        }
        if (
          shouldLoadRootWorkspaceInitializationMetadata({
            includeSettaInitializedFolders: includeSettaInitializedRef.current,
            folderPath: resolvedFolderPath,
            rootPath: effectiveRootPath,
          })
        ) {
          await refreshWorkspaceInitialization({
            folderPath,
            resolvedFolderPath,
            allowOutsideWorkspaceRoot,
            activeRootRequestId,
            nextRequestId,
            rootRequestIdRef,
            folderRequestIdRef,
            setNodesByPath,
          });
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
    await forEachWithConcurrencyLimit({
      items: getSettaBadgeRefreshFolderPaths({
        rootPath,
        expandedPaths,
        nodesByPath: nodesByPathRef.current,
      }),
      limit: SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT,
      run: async (path) => {
        await fetchFolderContents(path, undefined, refreshRequestId);
      },
    });
  }, [expandedPaths, fetchFolderContents, nodesByPathRef, rootPath]);

  useEffect(() => {
    applyRootPathRef.current = applyRootPath;
  }, [applyRootPath]);

  useEffect(() => {
    if (!rootPath || appliedRootRef.current === rootPath) {
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
      const res = (await callOpenAPI(
        getFileBrowserRoot(),
      )) as FileBrowserRootRouteResponse;
      if (!res200(res)) {
        const errorMessage =
          res.hasResponse && res.status !== undefined
            ? `Failed to load file browser root (${res.status}).`
            : "Failed to load file browser root.";
        setRootError(errorMessage);
        return;
      }
      setBrowserRootPath(res.data.rootPath);
      setIgnorePatterns(res.data.ignorePatterns);
      setPathSeparator(res.data.pathSeparator);
      fileBrowserState.setState({
        pathSeparator: res.data.pathSeparator,
        ignorePatterns: res.data.ignorePatterns,
      });
      applyRootPathRef.current?.(
        fileBrowserState.getState().rootPath ?? res.data.rootPath,
        res.data.pathSeparator,
        res.data.ignorePatterns,
      );
    };
    void loadRoot();
  }, [fileBrowserState]);

  useEffect(() => {
    const query = parseFileBrowserFilterText(filterText);
    const shouldSkipRecursiveSearch =
      searchScope !== "recursive" ||
      query.kind === "none" ||
      (query.kind === "name" &&
        query.needle.length < FILTER_RECURSIVE_MIN_CHARS);
    if (shouldSkipRecursiveSearch) {
      filterRequestIdRef.current += 1;
      return;
    }
    if (!rootPath) {
      return;
    }
    const requestId = filterRequestIdRef.current + 1;
    filterRequestIdRef.current = requestId;
    void crawlRecursiveSearch({
      rootPath,
      requestId,
      rootRequestId: rootRequestIdRef.current,
      filterRequestIdRef,
      fetchFolderContents,
      childrenByPathRef,
      nodesByPathRef,
    });
  }, [
    childrenByPathRef,
    fetchFolderContents,
    filterText,
    nodesByPathRef,
    rootPath,
    searchScope,
  ]);

  return {
    nodesByPath,
    nodesByPathRef,
    childrenByPath,
    childrenByPathRef,
    loadingPaths,
    errorByPath,
    browserRootPath,
    ignorePatterns,
    pathSeparator,
    rootError,
    fetchFolderContents,
  };
}
