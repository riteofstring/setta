import { normalizeBrowserPath } from "utils/browserPaths";

export function normalizeFileBrowserPathForComparison(path: string): string {
  const normalized = normalizeBrowserPath(path).trim();
  if (!normalized) {
    return "";
  }
  if (normalized === "/") {
    return normalized;
  }
  return normalized.replace(/\/+$/, "");
}

export function isSameOrDescendantBrowserPath(
  path: string,
  ancestorPath: string,
): boolean {
  const normalizedPath = normalizeFileBrowserPathForComparison(path);
  const normalizedAncestor =
    normalizeFileBrowserPathForComparison(ancestorPath);
  if (!normalizedPath || !normalizedAncestor) {
    return false;
  }
  if (normalizedPath === normalizedAncestor) {
    return true;
  }
  return normalizedPath.startsWith(`${normalizedAncestor}/`);
}
