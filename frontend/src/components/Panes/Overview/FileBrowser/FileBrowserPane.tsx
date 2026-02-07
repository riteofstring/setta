import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { createFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { HiChevronDown, HiChevronRight, HiChevronUp } from "react-icons/hi";
import { TbFile, TbFolder } from "react-icons/tb";
import { List, useListRef } from "react-window";
import { openFileInCodeSection } from "state/actions/sections/createSections";
import { useFileBrowserState } from "state/definitions";
import { getDefaultColumnWidth } from "state/hooks/columnWidthUtils";
import { useColumnWidthDrag } from "state/hooks/useColumnWidthDrag";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { NO_PAN_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "utils/constants";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  matchesFileBrowserNameFilter,
  matchesFileBrowserPathFilter,
  normalizeFileBrowserPathForFilter,
  parseFileBrowserFilterText,
} from "utils/fileBrowserFilter";
import {
  filterFileBrowserItemsByTypeFilters,
  type FileBrowserSearchScope,
} from "utils/fileBrowserTypes";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import { clamp } from "utils/utils";

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 28;
export const FILE_BROWSER_DATE_COLUMN_MIN_WIDTH = 96;
export const FILE_BROWSER_FILE_COLUMN_MIN_WIDTH = 120;
const FILE_COLUMN_CSS_VAR = "--file-browser-column-width";
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});
const FILTER_DEBOUNCE_MS = 150;
const MAX_ENTRIES = 5000;
const FILTER_RECURSIVE_MIN_CHARS = 2;
const FILTER_RECURSIVE_MAX_FOLDERS = 600;

type NodeKind = "folder" | "file";

type SortKey = "name" | "modified";
type SortDirection = "asc" | "desc";

export type FileNode = {
  name: string;
  fullPath: string;
  type: NodeKind;
  parentPath: string | null;
  mtime?: number | null;
};

type FlattenedNode = FileNode & {
  depth: number;
};

export type FlattenedFileNode = FlattenedNode;

export function flattenFileBrowserTree({
  rootPath,
  nodesByPath,
  expandedPaths,
  filterText,
  searchScope = "recursive",
  getChildPaths,
}: {
  rootPath: string | null;
  nodesByPath: Record<string, FileNode>;
  expandedPaths: Record<string, boolean>;
  filterText: string;
  searchScope?: FileBrowserSearchScope;
  getChildPaths: (path: string) => string[];
}): FlattenedFileNode[] {
  if (!rootPath) {
    return [];
  }
  const rootNode = nodesByPath[rootPath];
  if (!rootNode) {
    return [];
  }

  const query = parseFileBrowserFilterText(filterText);
  if (query.kind === "none") {
    const result: FlattenedFileNode[] = [];
    const walk = (path: string, depth: number) => {
      const node = nodesByPath[path];
      if (!node) {
        return;
      }
      result.push({ ...node, depth });
      const isExpanded = expandedPaths[path] === true;
      if (node.type === "folder" && isExpanded) {
        const children = getChildPaths(path);
        for (const childPath of children) {
          walk(childPath, depth + 1);
        }
      }
    };
    walk(rootPath, 0);
    return result;
  }

  const normalizedRootPath = normalizeFileBrowserPathForFilter(rootPath);
  if (searchScope === "local") {
    const root = nodesByPath[rootPath];
    if (!root) {
      return [];
    }
    const result: FlattenedFileNode[] = [{ ...root, depth: 0 }];
    const children = getChildPaths(rootPath);
    for (const childPath of children) {
      const node = nodesByPath[childPath];
      if (!node) {
        continue;
      }
      let matched = false;
      if (query.kind === "path") {
        const normalizedFullPath = normalizeFileBrowserPathForFilter(
          node.fullPath,
        );
        let normalizedRelativePath: string | null = null;
        if (normalizedFullPath.startsWith(normalizedRootPath)) {
          normalizedRelativePath = normalizedFullPath.slice(
            normalizedRootPath.length,
          );
          if (normalizedRelativePath.startsWith("/")) {
            normalizedRelativePath = normalizedRelativePath.slice(1);
          }
        }
        matched = matchesFileBrowserPathFilter(
          query,
          normalizedFullPath,
          normalizedRelativePath,
        );
      } else {
        matched = matchesFileBrowserNameFilter(
          query,
          node.name.toLowerCase(),
          node.type,
        );
      }
      if (matched) {
        result.push({ ...node, depth: 1 });
      }
    }
    return result;
  }

  const collectFiltered = (path: string, depth: number) => {
    const node = nodesByPath[path];
    if (!node) {
      return { matched: false, items: [] as FlattenedFileNode[] };
    }

    let matched = false;
    if (query.kind === "path") {
      const normalizedFullPath = normalizeFileBrowserPathForFilter(
        node.fullPath,
      );
      let normalizedRelativePath: string | null = null;
      if (normalizedFullPath.startsWith(normalizedRootPath)) {
        normalizedRelativePath = normalizedFullPath.slice(
          normalizedRootPath.length,
        );
        if (normalizedRelativePath.startsWith("/")) {
          normalizedRelativePath = normalizedRelativePath.slice(1);
        }
      }
      matched = matchesFileBrowserPathFilter(
        query,
        normalizedFullPath,
        normalizedRelativePath,
      );
    } else {
      matched = matchesFileBrowserNameFilter(
        query,
        node.name.toLowerCase(),
        node.type,
      );
    }

    const children = getChildPaths(path);
    if (children.length === 0) {
      return matched
        ? { matched: true, items: [{ ...node, depth }] }
        : { matched: false, items: [] as FlattenedFileNode[] };
    }

    const childItems: FlattenedFileNode[] = [];
    for (const childPath of children) {
      const childResult = collectFiltered(childPath, depth + 1);
      if (childResult.matched) {
        matched = true;
        childItems.push(...childResult.items);
      }
    }
    if (!matched) {
      return { matched: false, items: [] as FlattenedFileNode[] };
    }
    return {
      matched: true,
      items: [{ ...node, depth }, ...childItems],
    };
  };
  return collectFiltered(rootPath, 0).items;
}

type RowData = {
  items: FlattenedNode[];
  expandedPaths: Record<string, boolean>;
  selectedPath: string | null;
  loadingPaths: Record<string, boolean>;
  errorByPath: Record<string, string>;
  columnWidth: string;
  listInsetLeft: number;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
};

type FileBrowserRowProps = RowData & {
  index: number;
  style: CSSProperties;
};

type FileBrowserPaneProps = {
  onFileOpen?: (node: FileNode) => void;
  onFolderOpen?: (node: FileNode) => void;
  onSelectionChange?: (node: FileNode | null) => void;
  useFileBrowserStateHook?: typeof useFileBrowserState;
  showFilter?: boolean;
  metaPaddingClassName?: string;
  listInsetLeft?: number;
  columnWidthConfig?: {
    columnWidth: string;
    onResizeStart: React.MouseEventHandler<HTMLDivElement>;
  };
};

export function FileBrowserPane({
  onFileOpen,
  onFolderOpen,
  onSelectionChange,
  useFileBrowserStateHook,
  showFilter = true,
  metaPaddingClassName,
  listInsetLeft = 0,
  columnWidthConfig,
}: FileBrowserPaneProps = {}) {
  const fileBrowserState = useFileBrowserStateHook ?? useFileBrowserState;
  const { rootPath, expandedPaths, selectedPath, filterText, typeFilters, searchScope } =
    fileBrowserState((state) => ({
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
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({});
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([]);
  const [pathSeparator, setPathSeparator] = useState("/");
  const [rootError, setRootError] = useState<string | null>(null);
  const [listSize, setListSize] = useState({ height: 320, width: 320 });
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const listRef = useListRef();
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const didLoadRootRef = useRef(false);
  const rootRequestIdRef = useRef(0);
  const folderRequestIdRef = useRef<Record<string, number>>({});
  const filterRequestIdRef = useRef(0);
  const appliedRootRef = useRef<string | null>(null);
  const applyRootPathRef =
    useRef<
      (
        nextRoot: string,
        separatorOverride?: string,
        ignoreOverride?: string[],
      ) => void
    >();

  useEffect(() => {
    const wrapper = listWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setListSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, []);

  const fetchFolderContents = useCallback(
    async (
      folderPath: string,
      ignoreOverride?: string[],
      rootRequestId?: number,
    ): Promise<FileNode[] | null> => {
      const activeIgnorePatterns = ignoreOverride ?? ignorePatterns;
      const activeRootRequestId = rootRequestId ?? rootRequestIdRef.current;
      const nextRequestId = (folderRequestIdRef.current[folderPath] ?? 0) + 1;
      folderRequestIdRef.current[folderPath] = nextRequestId;
      setLoadingPaths((prev) => ({ ...prev, [folderPath]: true }));
      const res = await route_get_folder_contents({
        folderPath,
        ignorePatterns: activeIgnorePatterns,
        maxEntries: MAX_ENTRIES,
        includeMtime: true,
      });
      if (rootRequestIdRef.current !== activeRootRequestId) {
        return null;
      }
      if (folderRequestIdRef.current[folderPath] !== nextRequestId) {
        return null;
      }
      let loadedNodes: FileNode[] | null = null;
      if (res200(res)) {
        const items = res.data;
        loadedNodes = items.map((item) => ({
          name: item.name,
          fullPath: item.fullPath,
          type: item.type,
          parentPath: folderPath,
          mtime: item.mtime ?? null,
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
      } else {
        let errorMessage = "Failed to load folder contents.";
        const detail = getErrorDetail(res.data);
        if (detail) {
          errorMessage = detail;
        } else if (res.hasResponse && res.status !== undefined) {
          errorMessage = `Failed to load folder contents (${res.status}).`;
        }
        setErrorByPath((prev) => ({ ...prev, [folderPath]: errorMessage }));
      }
      setLoadingPaths((prev) => {
        if (!(folderPath in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[folderPath];
        return next;
      });
      return loadedNodes;
    },
    [ignorePatterns],
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

  const handleSort = useCallback((nextKey: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === nextKey) {
        setSortDirection((prevDirection) =>
          prevDirection === "asc" ? "desc" : "asc",
        );
        return prevKey;
      }
      setSortDirection(nextKey === "modified" ? "desc" : "asc");
      return nextKey;
    });
  }, []);

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
    if (didLoadRootRef.current) {
      return;
    }
    didLoadRootRef.current = true;
    const loadRoot = async () => {
      const res = await route_get_file_browser_root();
      if (!res200(res)) {
        let errorMessage = "Failed to load file browser root.";
        if (res.hasResponse && res.status !== undefined) {
          errorMessage = `Failed to load file browser root (${res.status}).`;
        }
        setRootError(errorMessage);
        return;
      }
      setIgnorePatterns(res.data.ignorePatterns);
      setPathSeparator(res.data.pathSeparator);
      fileBrowserState.setState({
        pathSeparator: res.data.pathSeparator,
        ignorePatterns: res.data.ignorePatterns,
      });
      const preferredRoot =
        fileBrowserState.getState().rootPath ?? res.data.rootPath;
      applyRootPathRef.current?.(
        preferredRoot,
        res.data.pathSeparator,
        res.data.ignorePatterns,
      );
    };
    void loadRoot();
  }, []);

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
        if (!folder) {
          continue;
        }
        if (visited.has(folder)) {
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

  const flattenedItems = useMemo(() => {
    return flattenFileBrowserTree({
      rootPath,
      nodesByPath,
      expandedPaths,
      filterText,
      searchScope,
      getChildPaths: getSortedChildPaths,
    });
  }, [
    expandedPaths,
    filterText,
    getSortedChildPaths,
    nodesByPath,
    rootPath,
    searchScope,
  ]);

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

  const handleToggle = useCallback(
    (path: string) => {
      const node = nodesByPath[path];
      if (!node) {
        return;
      }
      if (node.type !== "folder") {
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
      const node = nodesByPath[path];
      onSelectionChange(node ?? null);
    },
    [fileBrowserState, nodesByPath, onSelectionChange],
  );

  const handleOpen = useCallback(
    (path: string) => {
      const node = nodesByPath[path];
      if (!node) {
        return;
      }
      if (node.type === "folder") {
        if (onFolderOpen) {
          onFolderOpen(node);
          return;
        }
        handleToggle(path);
        return;
      }
      if (onFileOpen) {
        onFileOpen(node);
        return;
      }
      const codeLanguage = resolveCodeLanguageFromPath(path);
      const fileName = getBaseNameFromPath(path);
      void openFileInCodeSection({
        filePath: path,
        fileName,
        codeLanguage,
      });
    },
    [handleToggle, nodesByPath, onFileOpen, onFolderOpen],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (displayedItems.length === 0) {
        return;
      }
      if (selectedIndex < 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          const nextIndex = 0;
          const nextItem = displayedItems[nextIndex];
          if (nextItem) {
            handleSelect(nextItem.fullPath);
            listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
          }
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          const nextIndex = displayedItems.length - 1;
          const nextItem = displayedItems[nextIndex];
          if (nextItem) {
            handleSelect(nextItem.fullPath);
            listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
          }
        }
        return;
      }
      const currentItem = displayedItems[selectedIndex];
      if (!currentItem) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(
          selectedIndex + 1,
          displayedItems.length - 1,
        );
        const nextItem = displayedItems[nextIndex];
        if (nextItem) {
          handleSelect(nextItem.fullPath);
          listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = Math.max(selectedIndex - 1, 0);
        const nextItem = displayedItems[nextIndex];
        if (nextItem) {
          handleSelect(nextItem.fullPath);
          listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (currentItem.type === "folder") {
          const isExpanded = expandedPaths[currentItem.fullPath] === true;
          if (!isExpanded) {
            handleToggle(currentItem.fullPath);
            return;
          }
          const children = childrenByPath[currentItem.fullPath] ?? [];
          if (children.length > 0) {
            const firstChild = children[0];
            handleSelect(firstChild);
          }
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentItem.type === "folder") {
          const isExpanded = expandedPaths[currentItem.fullPath] === true;
          if (isExpanded) {
            handleToggle(currentItem.fullPath);
            return;
          }
        }
        if (currentItem.parentPath) {
          handleSelect(currentItem.parentPath);
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        handleOpen(currentItem.fullPath);
      }
    },
    [
      childrenByPath,
      displayedItems,
      expandedPaths,
      handleOpen,
      handleSelect,
      handleToggle,
      selectedIndex,
    ],
  );

  const listHeight = Math.max(1, listSize.height - HEADER_HEIGHT);
  const listWidth = Math.max(1, listSize.width);
  const columnResizeDepthRef = useRef(1);
  const {
    handleResizeStart: handleLocalResizeStart,
    setNewWidth,
    widthRef,
  } = useColumnWidthDrag({
    outerRef: listWrapperRef,
    maxNestedDepthRef: columnResizeDepthRef,
    applyWidth: (width) => {
      if (listWrapperRef.current) {
        listWrapperRef.current.style.setProperty(
          FILE_COLUMN_CSS_VAR,
          `${width}px`,
        );
      }
    },
    persistWidth: () => {},
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

  useEffect(() => {
    if (columnWidthConfig || !listWrapperRef.current) {
      return;
    }
    const containerWidth = listWrapperRef.current.clientWidth;
    if (!containerWidth) {
      return;
    }
    if (widthRef.current.currentWidth !== 0) {
      return;
    }
    setNewWidth(containerWidth, getDefaultColumnWidth(containerWidth));
  }, [columnWidthConfig, listSize.width, setNewWidth, widthRef]);

  const columnWidth = columnWidthConfig?.columnWidth
    ? columnWidthConfig.columnWidth
    : `var(${FILE_COLUMN_CSS_VAR}, 55%)`;
  const handleResizeStart =
    columnWidthConfig?.onResizeStart ?? handleLocalResizeStart;
  const gridTemplateColumns = `minmax(${FILE_BROWSER_FILE_COLUMN_MIN_WIDTH}px, min(${columnWidth}, calc(100% - ${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px))) minmax(${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px, 1fr)`;
  const fileSortDirection = sortKey === "name" ? sortDirection : "asc";
  const dateSortDirection = sortKey === "modified" ? sortDirection : "desc";
  const showMeta = showFilter || rootError;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      {showMeta && (
        <div className={`flex flex-col gap-2 ${metaPaddingClassName ?? ""}`}>
          {showFilter && (
            <div className="flex flex-col gap-1">
              <FileBrowserFilter useFileBrowserStateHook={fileBrowserState} />
            </div>
          )}
          {rootError && <p className="text-xs text-red-500">{rootError}</p>}
        </div>
      )}
      <div
        ref={listWrapperRef}
        className="nodrag relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white/80 dark:bg-setta-950/60"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div
          className="group grid h-7 items-center border-b border-setta-100/80 bg-setta-50/70 px-2 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:border-setta-800/80 dark:bg-setta-900/40 dark:text-setta-400"
          style={{
            gridTemplateColumns,
          }}
        >
          <div
            className="relative flex items-center border-r border-transparent pr-6 transition-colors group-hover:border-setta-100/80 dark:group-hover:border-setta-800/80"
            style={listInsetLeft ? { paddingLeft: listInsetLeft } : undefined}
          >
            <button
              type="button"
              className="flex w-full min-w-0 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              onClick={() => handleSort("name")}
              aria-label={`Sort by name (${fileSortDirection === "asc" ? "A to Z" : "Z to A"})`}
            >
              <span className="min-w-0 truncate">Files</span>
              {fileSortDirection === "asc" ? (
                <HiChevronUp
                  className={
                    sortKey === "name"
                      ? "text-blue-500"
                      : "text-setta-400/70 dark:text-setta-600"
                  }
                />
              ) : (
                <HiChevronDown
                  className={
                    sortKey === "name"
                      ? "text-blue-500"
                      : "text-setta-400/70 dark:text-setta-600"
                  }
                />
              )}
            </button>
            <div
              className="group/resize nopan nodrag pointer-events-none absolute -right-2 top-0 flex h-full w-4 cursor-col-resize items-center justify-center opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
              onMouseDown={handleResizeStart}
            >
              <div className="h-4 w-1.5 rounded-full bg-setta-400/90 transition-colors group-hover/resize:bg-blue-500 dark:bg-setta-500 dark:group-hover/resize:bg-blue-400" />
            </div>
          </div>
          <div className="flex items-center justify-end pl-3">
            <button
              type="button"
              className="flex w-full min-w-0 items-center justify-end gap-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              onClick={() => handleSort("modified")}
              aria-label={`Sort by date modified (${dateSortDirection === "asc" ? "oldest to newest" : "newest to oldest"})`}
            >
              <span className="min-w-0 truncate text-right">Date modified</span>
              {dateSortDirection === "asc" ? (
                <HiChevronUp
                  className={
                    sortKey === "modified"
                      ? "text-blue-500"
                      : "text-setta-400/70 dark:text-setta-600"
                  }
                />
              ) : (
                <HiChevronDown
                  className={
                    sortKey === "modified"
                      ? "text-blue-500"
                      : "text-setta-400/70 dark:text-setta-600"
                  }
                />
              )}
            </button>
          </div>
        </div>
        <div className="h-full w-full">
          <List
            listRef={listRef}
            rowComponent={FileBrowserRow}
            rowCount={displayedItems.length}
            rowHeight={ROW_HEIGHT}
            className={`${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} nodrag`}
            rowProps={{
              items: displayedItems,
              expandedPaths,
              selectedPath,
              loadingPaths,
              errorByPath,
              columnWidth,
              listInsetLeft,
              onToggle: handleToggle,
              onSelect: handleSelect,
              onOpen: handleOpen,
            }}
            style={{ height: listHeight, width: listWidth }}
          />
        </div>
      </div>
    </div>
  );
}

function FileBrowserRow({
  index,
  style,
  items,
  expandedPaths,
  selectedPath,
  loadingPaths,
  errorByPath,
  columnWidth,
  listInsetLeft,
  onToggle,
  onSelect,
  onOpen,
}: FileBrowserRowProps) {
  const item = items[index];
  if (!item) {
    return null;
  }
  const isFolder = item.type === "folder";
  const isExpanded = expandedPaths[item.fullPath] === true;
  const isSelected = selectedPath === item.fullPath;
  const isLoading = loadingPaths[item.fullPath] === true;
  const errorMessage = errorByPath[item.fullPath];
  const paddingLeft = listInsetLeft + 8 + item.depth * 12;
  const modifiedLabel = formatModifiedAt(item.mtime);
  const rowClasses = isSelected
    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
    : "text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-900";

  function handleRowDoubleClick(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('[data-filebrowser-toggle="true"]')
    ) {
      return;
    }
    onSelect(item.fullPath);
    onOpen(item.fullPath);
  }

  return (
    <button
      type="button"
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: `minmax(${FILE_BROWSER_FILE_COLUMN_MIN_WIDTH}px, min(${columnWidth}, calc(100% - ${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px))) minmax(${FILE_BROWSER_DATE_COLUMN_MIN_WIDTH}px, 1fr)`,
      }}
      className={`cursor-pointer items-center gap-2 pr-2 text-left text-xs ${rowClasses}`}
      title={item.fullPath}
      onMouseDown={(event) => {
        event.stopPropagation();
        // Clicking a row should behave like a real file explorer: it should
        // take focus away from the address bar/filter so completion tooltips
        // don't keep intercepting clicks.
        if (typeof document !== "undefined") {
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            active.blur();
          }
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item.fullPath);
      }}
    >
      <div
        className="flex min-w-0 items-center gap-1 pr-2"
        style={{ paddingLeft }}
        onDoubleClick={handleRowDoubleClick}
      >
        {isFolder ? (
          <div
            role="button"
            tabIndex={-1}
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            data-filebrowser-toggle="true"
            className="flex h-4 w-4 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(item.fullPath);
            }}
          >
            {isExpanded ? (
              <HiChevronDown size={12} />
            ) : (
              <HiChevronRight size={12} />
            )}
          </div>
        ) : (
          <span className="h-4 w-4" />
        )}
        {isFolder ? (
          <TbFolder className="text-setta-400" size={14} />
        ) : (
          <TbFile className="text-setta-400" size={14} />
        )}
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={handleRowDoubleClick}
        >
          {item.name}
        </span>
        {isLoading && (
          <span className="h-3 w-3 animate-spin rounded-full border border-setta-300 border-t-transparent" />
        )}
        {errorMessage && !isLoading && (
          <span className="truncate text-[10px] text-red-400">!</span>
        )}
      </div>
      <div
        className="pr-1 text-right text-[11px] text-setta-400 dark:text-setta-500"
        onDoubleClick={handleRowDoubleClick}
      >
        {modifiedLabel}
      </div>
    </button>
  );
}

function getDisplayNameFromPath(path: string, separator: string): string {
  if (!path) {
    return "";
  }
  const parts = path.split(separator).filter((part) => part.length > 0);
  if (parts.length > 0) {
    return parts[parts.length - 1];
  }
  return path;
}

function getBaseNameFromPath(path: string): string {
  if (!path) {
    return "";
  }
  const parts = path.split(/[/\\]/).filter((part) => part.length > 0);
  if (parts.length > 0) {
    return parts[parts.length - 1];
  }
  return path;
}

function formatModifiedAt(mtime?: number | null): string {
  if (!mtime) {
    return "";
  }
  const date = new Date(mtime * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return DATE_FORMATTER.format(date);
}

export function FileBrowserFilter({
  useFileBrowserStateHook,
  className,
  tooltipParentDivId,
}: {
  useFileBrowserStateHook?: typeof useFileBrowserState;
  className?: string;
  tooltipParentDivId?: string | null;
}) {
  const fileBrowserState = useFileBrowserStateHook ?? useFileBrowserState;
  const { filterText, rootPath, pathSeparator, ignorePatterns, searchScope } =
    fileBrowserState((state) => ({
      filterText: state.filterText,
      rootPath: state.rootPath,
      pathSeparator: state.pathSeparator,
      ignorePatterns: state.ignorePatterns,
      searchScope: state.searchScope,
    }));
  const [filterInput, setFilterInput] = useState(filterText);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const inputId = useId();
  const completionSource = useMemo(
    () =>
      createFolderPathCompletionSource({
        rootPath,
        pathSeparator,
        ignorePatterns,
      }),
    [rootPath, pathSeparator, ignorePatterns],
  );

  useEffect(() => {
    setFilterInput(filterText);
  }, [filterText]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fileBrowserState.setState({ filterText: filterInput });
    }, FILTER_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [filterInput, fileBrowserState]);

  const keyComboActions = useMemo(
    () => ({
      Escape: () => {
        if (typeof document !== "undefined") {
          const active = document.activeElement;
          if (active instanceof HTMLElement) {
            active.blur();
          }
        }
        return true;
      },
    }),
    [],
  );

  const dummyInputClassName =
    "min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-3 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 font-sans";
  const realInputClassName =
    "min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent outline-0 [border-width:0_0_1px_0] focus-within:border-blue-300 [&_.cm-content]:!py-1 [&_.cm-content]:!pl-3 [&_.cm-content]:!pr-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs [&_.cm-content]:text-setta-700 dark:[&_.cm-content]:text-setta-300 [&_.cm-placeholder]:text-setta-400 dark:[&_.cm-placeholder]:text-setta-600 [&_.cm-content]:font-sans";

  return (
    <search
      className={`${NO_PAN_CLASS_NAME} nodrag relative flex min-w-0 flex-1 items-center ${className ?? ""}`}
    >
      <i className="gg-sort-az -mr-2 text-setta-300 dark:text-setta-600" />
      <InlineCodeMirrorInput
        id={`CodeMirror-FileBrowserFilter-${inputId}`}
        value={filterInput}
        placeholder="Filter files and folders"
        onChange={setFilterInput}
        className={realInputClassName}
        dummyClassName={dummyInputClassName}
        singleLine
        completionsFn={completionSource ?? undefined}
        keyComboActions={keyComboActions}
        tooltipParentDivId={tooltipParentDivId}
      />
      <StandardPopover
        open={searchMenuOpen}
        onOpenChange={setSearchMenuOpen}
        arrowClasses="fill-white dark:fill-setta-800"
        contentClasses="z-40 rounded-md border border-solid border-setta-200 bg-white px-2 py-2 shadow-lg dark:border-setta-700 dark:bg-setta-800"
        trigger={
          <button
            type="button"
            aria-label="Search scope options"
            className="nodrag ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-setta-400 hover:bg-setta-50 hover:text-setta-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-500 dark:hover:bg-setta-850 dark:hover:text-setta-200"
          >
            <HiChevronDown size={16} />
          </button>
        }
      >
        <div className="flex w-[220px] flex-col gap-1 text-xs text-setta-700 dark:text-setta-200">
          <button
            type="button"
            aria-pressed={searchScope === "recursive"}
            className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-setta-50 dark:hover:bg-setta-850 ${
              searchScope === "recursive"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                : ""
            }`}
            onClick={() => {
              fileBrowserState.setState({ searchScope: "recursive" });
              setSearchMenuOpen(false);
            }}
          >
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full border border-setta-300 bg-transparent dark:border-setta-600">
              {searchScope === "recursive" ? (
                <div className="h-full w-full rounded-full bg-blue-500" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="font-semibold">Recursive search</div>
              <div className="text-[11px] text-setta-400 dark:text-setta-500">
                Search the current folder and nested folders.
              </div>
            </div>
          </button>
          <button
            type="button"
            aria-pressed={searchScope === "local"}
            className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-setta-50 dark:hover:bg-setta-850 ${
              searchScope === "local"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                : ""
            }`}
            onClick={() => {
              fileBrowserState.setState({ searchScope: "local" });
              setSearchMenuOpen(false);
            }}
          >
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full border border-setta-300 bg-transparent dark:border-setta-600">
              {searchScope === "local" ? (
                <div className="h-full w-full rounded-full bg-blue-500" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="font-semibold">Local search</div>
              <div className="text-[11px] text-setta-400 dark:text-setta-500">
                Search only the current folder.
              </div>
            </div>
          </button>
        </div>
      </StandardPopover>
    </search>
  );
}

export function sortChildPaths({
  paths,
  nodesByPath,
  sortKey,
  sortDirection,
}: {
  paths: string[];
  nodesByPath: Record<string, FileNode>;
  sortKey: SortKey;
  sortDirection: SortDirection;
}): string[] {
  if (paths.length <= 1) {
    return paths;
  }
  const sorted = [...paths];
  sorted.sort((pathA, pathB) => {
    const nodeA = nodesByPath[pathA];
    const nodeB = nodesByPath[pathB];
    const typeRankA = nodeA?.type === "folder" ? 0 : 1;
    const typeRankB = nodeB?.type === "folder" ? 0 : 1;
    if (typeRankA !== typeRankB) {
      return typeRankA - typeRankB;
    }
    const nameA = (nodeA?.name ?? "").toLowerCase();
    const nameB = (nodeB?.name ?? "").toLowerCase();
    const mtimeA = nodeA?.mtime ?? 0;
    const mtimeB = nodeB?.mtime ?? 0;
    let result = 0;
    if (sortKey === "modified") {
      result = mtimeA - mtimeB;
      if (result === 0) {
        result = nameA.localeCompare(nameB);
      }
    } else {
      result = nameA.localeCompare(nameB);
      if (result === 0) {
        result = mtimeA - mtimeB;
      }
    }
    if (sortDirection === "desc") {
      return result * -1;
    }
    return result;
  });
  return sorted;
}
