const ABSOLUTE_WINDOWS_PATH_REGEX = /^[A-Za-z]:[\\/]/;
const WINDOWS_DRIVE_ROOT_REGEX = /^[A-Za-z]:\/$/;

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

function normalizeSegments(path: string): string {
  const { root, segments } = splitBrowserPath(path);
  const stack: string[] = [];
  for (const part of segments) {
    if (part === ".") {
      continue;
    }
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
        continue;
      }
      if (!root) {
        stack.push("..");
      }
      continue;
    }
    stack.push(part);
  }
  return joinBrowserPath(root, stack);
}

function startsWithPathPrefix(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}/`);
}

export function resolvePathWithinRoot(
  input: string,
  rootPath: string,
): string | null {
  let normalizedRoot = normalizeBrowserPath(rootPath).trim();
  if (
    normalizedRoot !== "/" &&
    !WINDOWS_DRIVE_ROOT_REGEX.test(normalizedRoot)
  ) {
    normalizedRoot = normalizedRoot.replace(/\/+$/, "");
  }
  if (!normalizedRoot) {
    return null;
  }
  let normalizedInput = normalizeBrowserPath(input);
  if (
    startsWithPathPrefix(normalizedRoot, "/private/var") ||
    startsWithPathPrefix(normalizedInput, "/private/var")
  ) {
    if (startsWithPathPrefix(normalizedRoot, "/var")) {
      normalizedRoot = `/private${normalizedRoot}`;
    }
    if (startsWithPathPrefix(normalizedInput, "/var")) {
      normalizedInput = `/private${normalizedInput}`;
    }
  }
  if (
    startsWithPathPrefix(normalizedRoot, "/private/tmp") ||
    startsWithPathPrefix(normalizedInput, "/private/tmp")
  ) {
    if (startsWithPathPrefix(normalizedRoot, "/tmp")) {
      normalizedRoot = `/private${normalizedRoot}`;
    }
    if (startsWithPathPrefix(normalizedInput, "/tmp")) {
      normalizedInput = `/private${normalizedInput}`;
    }
  }
  normalizedRoot = normalizeSegments(normalizedRoot);
  const combined = isAbsoluteBrowserPath(input)
    ? normalizedInput
    : `${normalizedRoot}/${normalizedInput}`;
  const normalizedCombined = normalizeSegments(combined);
  const normalizedRootRoot = getBrowserPathRoot(normalizedRoot);
  if (normalizedRoot === "/") {
    return normalizedCombined.startsWith("/") ? normalizedCombined : null;
  }
  if (WINDOWS_DRIVE_ROOT_REGEX.test(normalizedRoot)) {
    return normalizedCombined.startsWith(normalizedRootRoot)
      ? normalizedCombined
      : null;
  }
  if (!normalizedCombined.startsWith(normalizedRoot)) {
    return null;
  }
  const boundary = normalizedCombined.charAt(normalizedRoot.length);
  if (boundary && boundary !== "/") {
    return null;
  }
  return normalizedCombined;
}
