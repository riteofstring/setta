import { normalizeBrowserPath } from "utils/browserPaths";
import {
  isSameOrDescendantBrowserPath,
  normalizeFileBrowserPathForComparison,
} from "utils/fileBrowserPathRelation";

export type FileBrowserBreadcrumb = {
  label: string;
  path: string;
};

function buildPathFromSegments({
  segments,
  isAbsolute,
}: {
  segments: string[];
  isAbsolute: boolean;
}): string {
  if (segments.length === 0) {
    return isAbsolute ? "/" : "";
  }
  return `${isAbsolute ? "/" : ""}${segments.join("/")}`;
}

function getPathLabel(path: string): string {
  if (path === "/") {
    return "/";
  }
  const segments = normalizeBrowserPath(path).split("/").filter(Boolean);
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
  const currentIsAbsolute = normalizedCurrent.startsWith("/");
  const currentSegments = normalizeBrowserPath(normalizedCurrent)
    .split("/")
    .filter(Boolean);

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

    const rootSegments = normalizeBrowserPath(normalizedRoot)
      .split("/")
      .filter(Boolean);
    for (
      let segmentCount = rootSegments.length + 1;
      segmentCount <= currentSegments.length;
      segmentCount += 1
    ) {
      const path = buildPathFromSegments({
        segments: currentSegments.slice(0, segmentCount),
        isAbsolute: currentIsAbsolute,
      });
      breadcrumbs.push({
        label: getPathLabel(path),
        path,
      });
    }
    return breadcrumbs;
  }

  const breadcrumbs: FileBrowserBreadcrumb[] = [];
  for (let segmentCount = 1; segmentCount <= currentSegments.length; segmentCount += 1) {
    const path = buildPathFromSegments({
      segments: currentSegments.slice(0, segmentCount),
      isAbsolute: currentIsAbsolute,
    });
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
