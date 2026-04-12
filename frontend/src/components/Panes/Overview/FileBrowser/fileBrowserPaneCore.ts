import { normalizeBrowserPath } from "utils/browserPaths";
import { normalizeFileBrowserPathForComparison } from "utils/fileBrowserPathRelation";
import type {
  FileBrowserRootStateSnapshot,
  FileNode,
  NodeKind,
} from "./fileBrowserPaneShared";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

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
    if (isExpanded !== true) {
      continue;
    }
    if (nodesByPath[path]?.type === "folder") {
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

export function getResolvedFileBrowserRootState({
  state,
  requestedRootPath,
  resolvedRootPath,
}: {
  state: FileBrowserRootStateSnapshot;
  requestedRootPath: string;
  resolvedRootPath: string;
}): FileBrowserRootStateSnapshot {
  if (requestedRootPath === resolvedRootPath) {
    return state;
  }
  const nextExpandedPaths = { ...state.expandedPaths };
  const requestedExpanded = nextExpandedPaths[requestedRootPath];
  delete nextExpandedPaths[requestedRootPath];
  nextExpandedPaths[resolvedRootPath] = requestedExpanded ?? true;
  return {
    rootPath: resolvedRootPath,
    selectedPath:
      state.selectedPath === requestedRootPath
        ? resolvedRootPath
        : state.selectedPath,
    expandedPaths: nextExpandedPaths,
  };
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

export function isEditableFileBrowserTarget(
  target: EventTarget | null,
): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const maybeElement = target as {
    closest?: unknown;
    isContentEditable?: unknown;
  };
  if (maybeElement.isContentEditable === true) {
    return true;
  }
  if (typeof maybeElement.closest !== "function") {
    return false;
  }
  const closest = maybeElement.closest as (selector: string) => unknown;
  return (
    closest("input, textarea, select") !== null ||
    closest('[contenteditable]:not([contenteditable="false"])') !== null ||
    closest(".cm-editor") !== null
  );
}

export function shouldSkipFileBrowserTransfer(args: {
  operation: "copy" | "move";
  sourceParentPath: string | null;
  destinationFolderPath: string;
}): boolean {
  if (args.operation !== "move" || !args.sourceParentPath) {
    return false;
  }
  const normalizedSourceParent = normalizeFileBrowserPathForComparison(
    args.sourceParentPath,
  );
  const normalizedDestination = normalizeFileBrowserPathForComparison(
    args.destinationFolderPath,
  );
  if (!normalizedSourceParent || !normalizedDestination) {
    return false;
  }
  return normalizedSourceParent === normalizedDestination;
}

export function shouldRefreshRootAfterFileBrowserTransfer(args: {
  rootPath: string | null;
  sourceParentPath: string | null;
  destinationFolderPath: string;
}): boolean {
  if (!args.rootPath) {
    return false;
  }
  const normalizedRootPath = normalizeFileBrowserPathForComparison(
    args.rootPath,
  );
  const normalizedSourceParent = args.sourceParentPath
    ? normalizeFileBrowserPathForComparison(args.sourceParentPath)
    : null;
  const normalizedDestination = normalizeFileBrowserPathForComparison(
    args.destinationFolderPath,
  );
  if (!normalizedRootPath || !normalizedDestination) {
    return false;
  }
  return (
    normalizedSourceParent === normalizedRootPath ||
    normalizedDestination === normalizedRootPath
  );
}

export function shouldRefreshMovedExpandedFolder(args: {
  operation: "copy" | "move";
  sourceType: NodeKind;
  sourcePath: string;
  destinationPath: string | null;
  expandedPaths: Record<string, boolean>;
}): boolean {
  if (args.operation !== "move" || args.sourceType !== "folder") {
    return false;
  }
  if (!args.destinationPath) {
    return false;
  }
  const normalizedSourcePath = normalizeFileBrowserPathForComparison(
    args.sourcePath,
  );
  const normalizedDestinationPath = normalizeFileBrowserPathForComparison(
    args.destinationPath,
  );
  if (!normalizedSourcePath || !normalizedDestinationPath) {
    return false;
  }
  if (normalizedSourcePath === normalizedDestinationPath) {
    return false;
  }
  return Object.entries(args.expandedPaths).some(
    ([path, isExpanded]) =>
      isExpanded === true &&
      normalizeFileBrowserPathForComparison(path) === normalizedSourcePath,
  );
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
  if (!normalizedRoot || normalizedFull === normalizedRoot) {
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
