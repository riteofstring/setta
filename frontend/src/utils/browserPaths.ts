const ABSOLUTE_WINDOWS_PATH_REGEX = /^[A-Za-z]:[\\/]/;

export function normalizeBrowserPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function getBrowserPathRoot(path: string): string {
  const normalizedPath = normalizeBrowserPath(path).trim();
  if (normalizedPath === "/") {
    return "/";
  }
  const windowsDriveRootMatch = normalizedPath.match(/^([A-Za-z]:)(?:\/|$)/);
  if (windowsDriveRootMatch?.[1]) {
    return `${windowsDriveRootMatch[1]}/`;
  }
  if (normalizedPath.startsWith("/")) {
    return "/";
  }
  return "";
}

export function splitBrowserPath(path: string): {
  root: string;
  segments: string[];
} {
  const normalizedPath = normalizeBrowserPath(path).trim();
  const root = getBrowserPathRoot(normalizedPath);
  const pathWithoutRoot =
    root === "/"
      ? normalizedPath.slice(1)
      : root
        ? normalizedPath.slice(root.length)
        : normalizedPath;
  return {
    root,
    segments: pathWithoutRoot.split("/").filter((part) => part.length > 0),
  };
}

export function joinBrowserPath(root: string, segments: string[]): string {
  if (root === "/") {
    return segments.length > 0 ? `/${segments.join("/")}` : "/";
  }
  if (root) {
    return segments.length > 0 ? `${root}${segments.join("/")}` : root;
  }
  return segments.join("/");
}

export function isAbsoluteBrowserPath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    ABSOLUTE_WINDOWS_PATH_REGEX.test(path)
  );
}
