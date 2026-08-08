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
  const currentSegments = currentPathParts.segments;
  const shouldIncludeAbsoluteRootCrumb =
    normalizedRoot === null && currentPathParts.root.length > 0;

  if (
    normalizedRoot &&
    isSameOrDescendantBrowserPath(normalizedCurrent, normalizedRoot)
  ) {
    const breadcrumbs: FileBrowserBreadcrumb[] = [
      {
        label: getPathLabel(normalizedRoot),
        path: normalizedRoot,
      },
    ];
    if (normalizedCurrent === normalizedRoot) {
      return breadcrumbs;
    }

    const rootSegments = splitBrowserPath(normalizedRoot).segments;
    for (
      let segmentCount = rootSegments.length + 1;
      segmentCount <= currentSegments.length;
      segmentCount += 1
    ) {
      const path = joinBrowserPath(
        currentPathParts.root,
        currentSegments.slice(0, segmentCount),
      );
      breadcrumbs.push({
        label: getPathLabel(path),
        path,
      });
    }
    return breadcrumbs;
  }

  const breadcrumbs: FileBrowserBreadcrumb[] = [];
  if (shouldIncludeAbsoluteRootCrumb) {
    breadcrumbs.push({
      label: currentPathParts.root,
      path: currentPathParts.root,
    });
  }
  for (
    let segmentCount = 1;
    segmentCount <= currentSegments.length;
    segmentCount += 1
  ) {
    const path = joinBrowserPath(
      currentPathParts.root,
      currentSegments.slice(0, segmentCount),
    );
    breadcrumbs.push({
      label: getPathLabel(path),
      path,
    });
  }
  if (breadcrumbs.length > 0) {
    return breadcrumbs;
  }
  return [
    {
      label: normalizedCurrent,
      path: normalizedCurrent,
    },
  ];
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
