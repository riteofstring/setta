import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi";
import { TbFile, TbFolder } from "react-icons/tb";
import { List, useListRef } from "react-window";
import { openFileInCodeSection } from "state/actions/sections/createSections";
import { useFileBrowserState } from "state/definitions";
import { resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { res200 } from "utils/endpointUtils";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";

const ROW_HEIGHT = 24;
const BREADCRUMB_HEIGHT = 24;
const FILTER_DEBOUNCE_MS = 150;
const MAX_ENTRIES = 5000;

type NodeKind = "folder" | "file";

type FileNode = {
  name: string;
  fullPath: string;
  type: NodeKind;
  parentPath: string | null;
};

type FlattenedNode = FileNode & {
  depth: number;
};

type RowData = {
  items: FlattenedNode[];
  expandedPaths: Record<string, boolean>;
  selectedPath: string | null;
  loadingPaths: Record<string, boolean>;
  errorByPath: Record<string, string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
};

type FileBrowserRowProps = RowData & {
  index: number;
  style: CSSProperties;
};

export function FileBrowserPane() {
  const { rootPath, expandedPaths, selectedPath, filterText } =
    useFileBrowserState((state) => ({
      rootPath: state.rootPath,
      expandedPaths: state.expandedPaths,
      selectedPath: state.selectedPath,
      filterText: state.filterText,
    }));
  const [nodesByPath, setNodesByPath] = useState<Record<string, FileNode>>({});
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, string[]>
  >({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({});
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([]);
  const [pathSeparator, setPathSeparator] = useState("/");
  const [rootInput, setRootInput] = useState("");
  const [filterInput, setFilterInput] = useState(filterText);
  const [rootError, setRootError] = useState<string | null>(null);
  const [listSize, setListSize] = useState({ height: 320, width: 320 });
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const listRef = useListRef();
  const listWrapperRef = useRef<HTMLDivElement | null>(null);
  const didLoadRootRef = useRef(false);
  const rootRequestIdRef = useRef(0);
  const folderRequestIdRef = useRef<Record<string, number>>({});
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
    ) => {
      const activeIgnorePatterns = ignoreOverride ?? ignorePatterns;
      const activeRootRequestId = rootRequestId ?? rootRequestIdRef.current;
      const nextRequestId = (folderRequestIdRef.current[folderPath] ?? 0) + 1;
      folderRequestIdRef.current[folderPath] = nextRequestId;
      setLoadingPaths((prev) => ({ ...prev, [folderPath]: true }));
      const res = await route_get_folder_contents({
        folderPath,
        ignorePatterns: activeIgnorePatterns,
        maxEntries: MAX_ENTRIES,
      });
      if (rootRequestIdRef.current !== activeRootRequestId) {
        return;
      }
      if (folderRequestIdRef.current[folderPath] !== nextRequestId) {
        return;
      }
      if (res200(res)) {
        const items = res.data;
        const childPaths = items.map((item) => item.fullPath);
        setNodesByPath((prev) => {
          const next = { ...prev };
          for (const item of items) {
            next[item.fullPath] = {
              name: item.name,
              fullPath: item.fullPath,
              type: item.type,
              parentPath: folderPath,
            };
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
        if (res.hasResponse && res.status !== undefined) {
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
      const separator = separatorOverride ?? pathSeparator;
      const displayName = getDisplayNameFromPath(trimmed, separator);
      rootRequestIdRef.current += 1;
      const rootRequestId = rootRequestIdRef.current;
      folderRequestIdRef.current = {};
      setRootError(null);
      useFileBrowserState.setState({
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
    [fetchFolderContents, pathSeparator],
  );

  useEffect(() => {
    applyRootPathRef.current = applyRootPath;
  }, [applyRootPath]);

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
      setRootInput(res.data.rootPath);
      applyRootPathRef.current?.(
        res.data.rootPath,
        res.data.pathSeparator,
        res.data.ignorePatterns,
      );
    };
    void loadRoot();
  }, []);

  useEffect(() => {
    setFilterInput(filterText);
  }, [filterText]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      useFileBrowserState.setState({ filterText: filterInput });
    }, FILTER_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [filterInput]);

  const flattenedItems = useMemo(() => {
    if (!rootPath) {
      return [];
    }
    const rootNode = nodesByPath[rootPath];
    if (!rootNode) {
      return [];
    }
    const normalizedFilter = filterText.trim().toLowerCase();
    const hasFilter = normalizedFilter.length > 0;
    if (!hasFilter) {
      const result: FlattenedNode[] = [];
      const walk = (path: string, depth: number) => {
        const node = nodesByPath[path];
        if (!node) {
          return;
        }
        result.push({ ...node, depth });
        const isExpanded = expandedPaths[path] === true;
        if (node.type === "folder" && isExpanded) {
          const children = childrenByPath[path] ?? [];
          for (const childPath of children) {
            walk(childPath, depth + 1);
          }
        }
      };
      walk(rootPath, 0);
      return result;
    }
    const collectFiltered = (path: string, depth: number) => {
      const node = nodesByPath[path];
      if (!node) {
        return { matched: false, items: [] as FlattenedNode[] };
      }
      const nameMatches = node.name.toLowerCase().includes(normalizedFilter);
      const children = childrenByPath[path] ?? [];
      let matched = nameMatches;
      const childItems: FlattenedNode[] = [];
      for (const childPath of children) {
        const childResult = collectFiltered(childPath, depth + 1);
        if (childResult.matched) {
          matched = true;
          childItems.push(...childResult.items);
        }
      }
      if (!matched) {
        return { matched: false, items: [] as FlattenedNode[] };
      }
      return {
        matched: true,
        items: [{ ...node, depth }, ...childItems],
      };
    };
    return collectFiltered(rootPath, 0).items;
  }, [rootPath, nodesByPath, childrenByPath, expandedPaths, filterText]);

  const selectedIndex = useMemo(() => {
    if (!selectedPath) {
      return -1;
    }
    return flattenedItems.findIndex((item) => item.fullPath === selectedPath);
  }, [flattenedItems, selectedPath]);

  const breadcrumbPaths = useMemo(() => {
    if (flattenedItems.length === 0) {
      return [] as string[];
    }
    const anchorIndex = Math.min(
      Math.max(visibleStartIndex, 0),
      flattenedItems.length - 1,
    );
    const anchor = flattenedItems[anchorIndex];
    if (!anchor) {
      return [] as string[];
    }
    const paths: string[] = [];
    let current: FileNode | undefined = nodesByPath[anchor.fullPath];
    while (current) {
      paths.push(current.fullPath);
      if (!current.parentPath) {
        break;
      }
      current = nodesByPath[current.parentPath];
    }
    return paths.reverse();
  }, [flattenedItems, nodesByPath, visibleStartIndex]);

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
      useFileBrowserState.setState((state) => {
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
    [childrenByPath, expandedPaths, fetchFolderContents, nodesByPath],
  );

  const handleSelect = useCallback((path: string) => {
    useFileBrowserState.setState({ selectedPath: path });
  }, []);

  const handleOpen = useCallback(
    (path: string) => {
      const node = nodesByPath[path];
      if (!node) {
        return;
      }
      if (node.type === "folder") {
        handleToggle(path);
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
    [handleToggle, nodesByPath],
  );

  const handleRowsRendered = useCallback(
    (
      visibleRows: { startIndex: number; stopIndex: number },
      _allRows?: { startIndex: number; stopIndex: number },
    ) => {
      setVisibleStartIndex(visibleRows.startIndex);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (flattenedItems.length === 0) {
        return;
      }
      const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const currentItem = flattenedItems[currentIndex];
      if (!currentItem) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, flattenedItems.length - 1);
        const nextItem = flattenedItems[nextIndex];
        if (nextItem) {
          handleSelect(nextItem.fullPath);
          listRef.current?.scrollToRow({ index: nextIndex, align: "smart" });
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = Math.max(currentIndex - 1, 0);
        const nextItem = flattenedItems[nextIndex];
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
      expandedPaths,
      flattenedItems,
      handleOpen,
      handleSelect,
      handleToggle,
      selectedIndex,
    ],
  );

  const listHeight = Math.max(1, listSize.height - BREADCRUMB_HEIGHT);
  const listWidth = Math.max(1, listSize.width);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
          Root
        </label>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 truncate rounded border border-transparent bg-white px-2 py-1 text-xs text-setta-700 shadow-sm focus-visible:border-blue-300 focus-visible:outline-none dark:bg-setta-900 dark:text-setta-100"
            value={rootInput}
            onChange={(event) => setRootInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyRootPath(rootInput);
              }
            }}
            placeholder="/path/to/project"
            spellCheck={false}
          />
          <button
            className="rounded border border-transparent bg-setta-100 px-2 py-1 text-xs font-semibold text-setta-600 hover:bg-setta-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:bg-setta-800 dark:text-setta-200 dark:hover:bg-setta-700"
            onClick={() => applyRootPath(rootInput)}
          >
            Go
          </button>
        </div>
        {rootError && <p className="text-xs text-red-500">{rootError}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
          Filter
        </label>
        <input
          className="truncate rounded border border-transparent bg-white px-2 py-1 text-xs text-setta-700 shadow-sm focus-visible:border-blue-300 focus-visible:outline-none dark:bg-setta-900 dark:text-setta-100"
          value={filterInput}
          onChange={(event) => setFilterInput(event.target.value)}
          placeholder="Filter files and folders"
          spellCheck={false}
        />
      </div>
      <div
        ref={listWrapperRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="absolute left-0 right-0 top-0 z-10 flex h-6 items-center gap-1 border-b border-setta-200 bg-setta-50 px-2 text-[11px] font-medium text-setta-500 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-400">
          {breadcrumbPaths.length === 0 ? (
            <span className="truncate">No selection</span>
          ) : (
            breadcrumbPaths.map((path, index) => {
              const node = nodesByPath[path];
              const label = node
                ? node.name
                : getDisplayNameFromPath(path, pathSeparator);
              return (
                <div key={path} className="flex items-center gap-1">
                  <button
                    className="truncate rounded px-1 hover:bg-setta-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:hover:bg-setta-800"
                    onClick={() => {
                      handleSelect(path);
                      if (node && node.type === "folder") {
                        if (expandedPaths[path] !== true) {
                          handleToggle(path);
                        }
                      }
                    }}
                  >
                    {label}
                  </button>
                  {index < breadcrumbPaths.length - 1 && (
                    <span className="text-setta-300 dark:text-setta-700">
                      /
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="h-full w-full pt-6">
          <List
            listRef={listRef}
            rowComponent={FileBrowserRow}
            rowCount={flattenedItems.length}
            rowHeight={ROW_HEIGHT}
            onRowsRendered={handleRowsRendered}
            rowProps={{
              items: flattenedItems,
              expandedPaths,
              selectedPath,
              loadingPaths,
              errorByPath,
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
  const paddingLeft = 8 + item.depth * 12;
  const rowClasses = isSelected
    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
    : "text-setta-700 hover:bg-setta-100 dark:text-setta-200 dark:hover:bg-setta-900";

  return (
    <div
      style={{ ...style, paddingLeft }}
      className={`flex cursor-pointer items-center gap-1 pr-2 text-xs ${rowClasses}`}
      title={item.fullPath}
      onClick={() => onSelect(item.fullPath)}
      onDoubleClick={() => onOpen(item.fullPath)}
    >
      {isFolder ? (
        <button
          className="flex h-4 w-4 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
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
        </button>
      ) : (
        <span className="h-4 w-4" />
      )}
      {isFolder ? (
        <TbFolder className="text-setta-400" size={14} />
      ) : (
        <TbFile className="text-setta-400" size={14} />
      )}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {isLoading && (
        <span className="h-3 w-3 animate-spin rounded-full border border-setta-300 border-t-transparent" />
      )}
      {errorMessage && !isLoading && (
        <span className="truncate text-[10px] text-red-400">!</span>
      )}
    </div>
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
