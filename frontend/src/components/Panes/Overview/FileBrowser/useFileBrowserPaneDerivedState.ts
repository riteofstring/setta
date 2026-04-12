import { createFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { useCallback, useMemo, useState } from "react";
import {
  buildFileBrowserBreadcrumbs,
  getFileBrowserParentPath,
} from "utils/fileBrowserNavigation";
import type { FileBrowserSearchScope } from "utils/fileBrowserTypes";
import { filterFileBrowserItemsByTypeFilters } from "utils/fileBrowserTypes";
import type { FileNode, SortDirection, SortKey } from "./fileBrowserPaneShared";
import { flattenFileBrowserTree, sortChildPaths } from "./fileBrowserPaneTree";

type UseFileBrowserPaneDerivedStateArgs = {
  allowOutsideWorkspaceRoot: boolean;
  browserRootPath: string | null;
  childrenByPath: Record<string, string[]>;
  expandedPaths: Record<string, boolean>;
  filterText: string;
  ignorePatterns: string[];
  nodesByPath: Record<string, FileNode>;
  pathSeparator: string;
  rootPath: string | null;
  searchScope: FileBrowserSearchScope;
  selectedPath: string | null;
  showPathNavigation: boolean;
  typeFilters: Record<string, boolean>;
};

export function useFileBrowserPaneDerivedState({
  allowOutsideWorkspaceRoot,
  browserRootPath,
  childrenByPath,
  expandedPaths,
  filterText,
  ignorePatterns,
  nodesByPath,
  pathSeparator,
  rootPath,
  searchScope,
  selectedPath,
  showPathNavigation,
  typeFilters,
}: UseFileBrowserPaneDerivedStateArgs) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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

  const sortedChildrenByPath = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(childrenByPath).map(([path, childPaths]) => [
          path,
          sortChildPaths({
            paths: childPaths,
            nodesByPath,
            sortKey,
            sortDirection,
          }),
        ]),
      ),
    [childrenByPath, nodesByPath, sortDirection, sortKey],
  );
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
  const displayedItems = useMemo(
    () =>
      filterFileBrowserItemsByTypeFilters(
        flattenFileBrowserTree({
          rootPath,
          nodesByPath,
          expandedPaths,
          filterText,
          searchScope,
          getChildPaths: getSortedChildPaths,
        }),
        typeFilters,
      ),
    [
      expandedPaths,
      filterText,
      getSortedChildPaths,
      nodesByPath,
      rootPath,
      searchScope,
      typeFilters,
    ],
  );
  const selectedIndex = useMemo(
    () =>
      selectedPath
        ? displayedItems.findIndex((item) => item.fullPath === selectedPath)
        : -1,
    [displayedItems, selectedPath],
  );

  return {
    sortKey,
    sortDirection,
    fileSortDirection: sortKey === "name" ? sortDirection : "asc",
    dateSortDirection: sortKey === "modified" ? sortDirection : "desc",
    handleSort,
    pathCompletionSource,
    breadcrumbs,
    parentPath,
    displayedItems,
    selectedIndex,
  };
}
