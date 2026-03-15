import { normalizeBrowserPath } from "utils/browserPaths";
import {
  matchesFileBrowserNameFilter,
  matchesFileBrowserPathFilter,
  normalizeFileBrowserPathForFilter,
  parseFileBrowserFilterText,
} from "utils/fileBrowserFilter";
import type { FileBrowserSearchScope } from "utils/fileBrowserTypes";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

export type NodeKind = "folder" | "file";

export type SortKey = "name" | "modified";
export type SortDirection = "asc" | "desc";

export type FileUrlEntry = {
  url: string;
  expiresAt: number;
};

export type FileNode = {
  name: string;
  fullPath: string;
  type: NodeKind;
  parentPath: string | null;
  mtime?: number | null;
  isSettaInitialized?: boolean;
};

export type FlattenedNode = FileNode & {
  depth: number;
};

export function getSettaBadgeRefreshFolderPaths({
  rootPath,
  expandedPaths,
  nodesByPath,
}: {
  rootPath: string;
  expandedPaths: Record<string, boolean>;
  nodesByPath: Record<string, FileNode>;
}): string[] {
  const paths = new Set<string>([rootPath]);
  for (const [path, isExpanded] of Object.entries(expandedPaths)) {
    if (!isExpanded) {
      continue;
    }
    const node = nodesByPath[path];
    if (node?.type === "folder") {
      paths.add(path);
    }
  }
  return Array.from(paths);
}

export function shouldRefreshSettaBadgeDataOnToggleChange({
  previousIncludeSettaInitializedFolders,
  nextIncludeSettaInitializedFolders,
}: {
  previousIncludeSettaInitializedFolders: boolean;
  nextIncludeSettaInitializedFolders: boolean;
}): boolean {
  return (
    !previousIncludeSettaInitializedFolders &&
    nextIncludeSettaInitializedFolders
  );
}

export function shouldShowSettaInitializedFolderIcon({
  isFolder,
  isSettaInitialized,
}: {
  isFolder: boolean;
  isSettaInitialized: boolean;
}): boolean {
  return isFolder && isSettaInitialized;
}

export function shouldCheckRootWorkspaceInitialization({
  folderPath,
  rootPath,
}: {
  folderPath: string;
  rootPath: string | null;
}): boolean {
  return rootPath !== null && folderPath === rootPath;
}

export function shouldLoadRootWorkspaceInitializationMetadata({
  includeSettaInitializedFolders,
  folderPath,
  rootPath,
}: {
  includeSettaInitializedFolders: boolean;
  folderPath: string;
  rootPath: string | null;
}): boolean {
  return (
    includeSettaInitializedFolders &&
    shouldCheckRootWorkspaceInitialization({ folderPath, rootPath })
  );
}

export function buildFileBrowserLoadingPathOwner({
  rootRequestId,
  folderRequestId,
}: {
  rootRequestId: number;
  folderRequestId: number;
}): string {
  return `${rootRequestId}:${folderRequestId}`;
}

export function isOwnedFileBrowserLoadingPath({
  loadingPathOwnerByPath,
  folderPath,
  requestOwner,
}: {
  loadingPathOwnerByPath: Record<string, string>;
  folderPath: string;
  requestOwner: string;
}): boolean {
  return loadingPathOwnerByPath[folderPath] === requestOwner;
}

export async function forEachWithConcurrencyLimit<T>({
  items,
  limit,
  run,
}: {
  items: T[];
  limit: number;
  run: (item: T) => Promise<unknown>;
}): Promise<void> {
  if (limit < 1) {
    throw new RangeError("Concurrency limit must be at least 1.");
  }
  const workerCount = Math.min(limit, items.length);
  if (workerCount === 0) {
    return;
  }
  let nextIndex = 0;
  const workers: Promise<void>[] = [];
  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    workers.push(
      (async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          await run(items[currentIndex]);
        }
      })(),
    );
  }
  await Promise.all(workers);
}

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
}): FlattenedNode[] {
  if (!rootPath) {
    return [];
  }
  const rootNode = nodesByPath[rootPath];
  if (!rootNode) {
    return [];
  }

  const query = parseFileBrowserFilterText(filterText);
  if (query.kind === "none") {
    const result: FlattenedNode[] = [];
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
    const result: FlattenedNode[] = [{ ...root, depth: 0 }];
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
      return { matched: false, items: [] as FlattenedNode[] };
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
        : { matched: false, items: [] as FlattenedNode[] };
    }

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
    return sortDirection === "desc" ? result * -1 : result;
  });
  return sorted;
}

export function getDisplayNameFromPath(
  path: string,
  separator: string,
): string {
  if (!path) {
    return "";
  }
  const parts = path.split(separator).filter((part) => part.length > 0);
  if (parts.length > 0) {
    return parts[parts.length - 1];
  }
  return path;
}

export function getBaseNameFromPath(path: string): string {
  if (!path) {
    return "";
  }
  const parts = path.split(/[/\\]/).filter((part) => part.length > 0);
  if (parts.length > 0) {
    return parts[parts.length - 1];
  }
  return path;
}

export function formatBrowserPathTooltip(
  fullPath: string,
  rootPath: string | null,
): string {
  const normalizedFull = normalizeBrowserPath(fullPath).replace(/\/+$/, "");
  if (!rootPath) {
    return normalizedFull;
  }
  const normalizedRoot = normalizeBrowserPath(rootPath).replace(/\/+$/, "");
  if (!normalizedRoot) {
    return normalizedFull;
  }
  if (normalizedFull === normalizedRoot) {
    return normalizedFull;
  }
  if (normalizedFull.startsWith(`${normalizedRoot}/`)) {
    return normalizedFull.slice(normalizedRoot.length + 1);
  }
  return normalizedFull;
}

export function formatModifiedAt(mtime?: number | null): string {
  if (!mtime) {
    return "";
  }
  const date = new Date(mtime * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return DATE_FORMATTER.format(date);
}
