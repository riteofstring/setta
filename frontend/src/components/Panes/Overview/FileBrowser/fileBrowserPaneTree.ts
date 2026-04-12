import {
  matchesFileBrowserNameFilter,
  matchesFileBrowserPathFilter,
  normalizeFileBrowserPathForFilter,
  parseFileBrowserFilterText,
} from "utils/fileBrowserFilter";
import type { FileBrowserSearchScope } from "utils/fileBrowserTypes";
import type {
  FileNode,
  FlattenedFileNode,
  SortDirection,
  SortKey,
} from "./fileBrowserPaneShared";

function buildRelativePath(
  fullPath: string,
  normalizedRootPath: string,
): string | null {
  if (!fullPath.startsWith(normalizedRootPath)) {
    return null;
  }
  const relativePath = fullPath.slice(normalizedRootPath.length);
  return relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
}

function matchesFilterQuery(args: {
  node: FileNode;
  normalizedRootPath: string;
  query: ReturnType<typeof parseFileBrowserFilterText>;
}): boolean {
  const { node, normalizedRootPath, query } = args;
  if (query.kind === "path") {
    const normalizedFullPath = normalizeFileBrowserPathForFilter(node.fullPath);
    return matchesFileBrowserPathFilter(
      query,
      normalizedFullPath,
      buildRelativePath(normalizedFullPath, normalizedRootPath),
    );
  }
  return matchesFileBrowserNameFilter(
    query,
    node.name.toLowerCase(),
    node.type,
  );
}

function flattenExpandedTree(args: {
  path: string;
  depth: number;
  expandedPaths: Record<string, boolean>;
  nodesByPath: Record<string, FileNode>;
  getChildPaths: (path: string) => string[];
  result: FlattenedFileNode[];
}): void {
  const { path, depth, expandedPaths, nodesByPath, getChildPaths, result } =
    args;
  const node = nodesByPath[path];
  if (!node) {
    return;
  }
  result.push({ ...node, depth });
  if (node.type !== "folder" || expandedPaths[path] !== true) {
    return;
  }
  for (const childPath of getChildPaths(path)) {
    flattenExpandedTree({
      path: childPath,
      depth: depth + 1,
      expandedPaths,
      nodesByPath,
      getChildPaths,
      result,
    });
  }
}

function collectLocalMatches(args: {
  rootPath: string;
  nodesByPath: Record<string, FileNode>;
  getChildPaths: (path: string) => string[];
  normalizedRootPath: string;
  query: ReturnType<typeof parseFileBrowserFilterText>;
}): FlattenedFileNode[] {
  const rootNode = args.nodesByPath[args.rootPath];
  if (!rootNode) {
    return [];
  }
  const result: FlattenedFileNode[] = [{ ...rootNode, depth: 0 }];
  for (const childPath of args.getChildPaths(args.rootPath)) {
    const node = args.nodesByPath[childPath];
    if (!node) {
      continue;
    }
    if (
      matchesFilterQuery({
        node,
        normalizedRootPath: args.normalizedRootPath,
        query: args.query,
      })
    ) {
      result.push({ ...node, depth: 1 });
    }
  }
  return result;
}

function collectRecursiveMatches(args: {
  path: string;
  depth: number;
  nodesByPath: Record<string, FileNode>;
  getChildPaths: (path: string) => string[];
  normalizedRootPath: string;
  query: ReturnType<typeof parseFileBrowserFilterText>;
}): { matched: boolean; items: FlattenedFileNode[] } {
  const node = args.nodesByPath[args.path];
  if (!node) {
    return { matched: false, items: [] };
  }
  let matched = matchesFilterQuery({
    node,
    normalizedRootPath: args.normalizedRootPath,
    query: args.query,
  });
  const childItems: FlattenedFileNode[] = [];
  for (const childPath of args.getChildPaths(args.path)) {
    const childResult = collectRecursiveMatches({
      ...args,
      path: childPath,
      depth: args.depth + 1,
    });
    if (!childResult.matched) {
      continue;
    }
    matched = true;
    childItems.push(...childResult.items);
  }
  if (!matched) {
    return { matched: false, items: [] };
  }
  return {
    matched: true,
    items: [{ ...node, depth: args.depth }, ...childItems],
  };
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
}): FlattenedFileNode[] {
  if (!rootPath || !nodesByPath[rootPath]) {
    return [];
  }
  const query = parseFileBrowserFilterText(filterText);
  if (query.kind === "none") {
    const result: FlattenedFileNode[] = [];
    flattenExpandedTree({
      path: rootPath,
      depth: 0,
      expandedPaths,
      nodesByPath,
      getChildPaths,
      result,
    });
    return result;
  }
  const normalizedRootPath = normalizeFileBrowserPathForFilter(rootPath);
  if (searchScope === "local") {
    return collectLocalMatches({
      rootPath,
      nodesByPath,
      getChildPaths,
      normalizedRootPath,
      query,
    });
  }
  return collectRecursiveMatches({
    path: rootPath,
    depth: 0,
    nodesByPath,
    getChildPaths,
    normalizedRootPath,
    query,
  }).items;
}

function compareNodeKinds(nodeA?: FileNode, nodeB?: FileNode): number {
  const typeRankA = nodeA?.type === "folder" ? 0 : 1;
  const typeRankB = nodeB?.type === "folder" ? 0 : 1;
  return typeRankA - typeRankB;
}

function compareNodeNames(nodeA?: FileNode, nodeB?: FileNode): number {
  return (nodeA?.name ?? "")
    .toLowerCase()
    .localeCompare((nodeB?.name ?? "").toLowerCase());
}

function compareNodeModifiedTimes(nodeA?: FileNode, nodeB?: FileNode): number {
  return (nodeA?.mtime ?? 0) - (nodeB?.mtime ?? 0);
}

function compareNodes(args: {
  nodeA?: FileNode;
  nodeB?: FileNode;
  sortKey: SortKey;
  sortDirection: SortDirection;
}): number {
  const typeResult = compareNodeKinds(args.nodeA, args.nodeB);
  if (typeResult !== 0) {
    return typeResult;
  }
  const primaryResult =
    args.sortKey === "modified"
      ? compareNodeModifiedTimes(args.nodeA, args.nodeB)
      : compareNodeNames(args.nodeA, args.nodeB);
  const fallbackResult =
    args.sortKey === "modified"
      ? compareNodeNames(args.nodeA, args.nodeB)
      : compareNodeModifiedTimes(args.nodeA, args.nodeB);
  const direction = args.sortDirection === "desc" ? -1 : 1;
  return (primaryResult || fallbackResult) * direction;
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
  return [...paths].sort((pathA, pathB) =>
    compareNodes({
      nodeA: nodesByPath[pathA],
      nodeB: nodesByPath[pathB],
      sortKey,
      sortDirection,
    }),
  );
}
