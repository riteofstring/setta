import {
  getBrowserPathRoot,
  joinBrowserPath,
  normalizeBrowserPath,
  splitBrowserPath,
} from "utils/browserPaths";
import {
  isSameOrDescendantBrowserPath,
  normalizeFileBrowserPathForComparison,
} from "utils/fileBrowserPathRelation";

export type FileBrowserBreadcrumb = {
  label: string;
  path: string;
};

function getPathLabel(path: string): string {
  const normalizedPath = normalizeBrowserPath(path);
  const root = getBrowserPathRoot(normalizedPath);
  if (normalizedPath === root) {
    return root;
  }
  const segments = splitBrowserPath(normalizedPath).segments;
  if (segments.length === 0) {
    return path;
  }
  return segments[segments.length - 1] ?? path;
}

function createBreadcrumb(path: string): FileBrowserBreadcrumb {
  return {
    label: getPathLabel(path),
    path,
  };
}

function buildBreadcrumbRange(args: {
  root: string;
  segments: string[];
  startCount: number;
}): FileBrowserBreadcrumb[] {
  const breadcrumbs: FileBrowserBreadcrumb[] = [];
  for (
    let segmentCount = args.startCount;
    segmentCount <= args.segments.length;
    segmentCount += 1
  ) {
    const path = joinBrowserPath(
      args.root,
      args.segments.slice(0, segmentCount),
    );
    breadcrumbs.push(createBreadcrumb(path));
  }
  return breadcrumbs;
}

function buildRootScopedBreadcrumbs(args: {
  normalizedRoot: string;
  currentRoot: string;
  currentSegments: string[];
}): FileBrowserBreadcrumb[] {
  const breadcrumbs = [createBreadcrumb(args.normalizedRoot)];
  if (
    joinBrowserPath(args.currentRoot, args.currentSegments) ===
    args.normalizedRoot
  ) {
    return breadcrumbs;
  }
  const rootSegments = splitBrowserPath(args.normalizedRoot).segments;
  breadcrumbs.push(
    ...buildBreadcrumbRange({
      root: args.currentRoot,
      segments: args.currentSegments,
      startCount: rootSegments.length + 1,
    }),
  );
  return breadcrumbs;
}

function buildAbsoluteBreadcrumbs(args: {
  normalizedCurrent: string;
  currentRoot: string;
  currentSegments: string[];
}): FileBrowserBreadcrumb[] {
  const breadcrumbs =
    args.currentRoot.length > 0 ? [createBreadcrumb(args.currentRoot)] : [];
  breadcrumbs.push(
    ...buildBreadcrumbRange({
      root: args.currentRoot,
      segments: args.currentSegments,
      startCount: 1,
    }),
  );
  if (breadcrumbs.length > 0) {
    return breadcrumbs;
  }
  return [createBreadcrumb(args.normalizedCurrent)];
}

export function buildFileBrowserBreadcrumbs(args: {
  rootPath: string | null;
  currentPath: string;
}): FileBrowserBreadcrumb[] {
  const normalizedCurrent = normalizeFileBrowserPathForComparison(
    args.currentPath,
  );
  if (!normalizedCurrent) {
    return [];
  }

  const normalizedRoot = args.rootPath
    ? normalizeFileBrowserPathForComparison(args.rootPath)
    : null;
  const currentPathParts = splitBrowserPath(normalizedCurrent);

  if (
    normalizedRoot &&
    isSameOrDescendantBrowserPath(normalizedCurrent, normalizedRoot)
  ) {
    return buildRootScopedBreadcrumbs({
      normalizedRoot,
      currentRoot: currentPathParts.root,
      currentSegments: currentPathParts.segments,
    });
  }

  return buildAbsoluteBreadcrumbs({
    normalizedCurrent,
    currentRoot: currentPathParts.root,
    currentSegments: currentPathParts.segments,
  });
}

export function getFileBrowserParentPath(args: {
  rootPath: string | null;
  currentPath: string;
}): string | null {
  const breadcrumbs = buildFileBrowserBreadcrumbs(args);
  if (breadcrumbs.length <= 1) {
    return null;
  }
  return breadcrumbs[breadcrumbs.length - 2]?.path ?? null;
}
