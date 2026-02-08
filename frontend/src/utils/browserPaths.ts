const ABSOLUTE_WINDOWS_PATH_REGEX = /^[A-Za-z]:[\\/]/;

function normalizeBrowserPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function isAbsoluteBrowserPath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    ABSOLUTE_WINDOWS_PATH_REGEX.test(path)
  );
}

function normalizeSegments(path: string): string {
  const isAbsolute = path.startsWith("/");
  const parts = path.split("/").filter((part) => part.length > 0);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === ".") {
      continue;
    }
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
        continue;
      }
      if (!isAbsolute) {
        stack.push("..");
      }
      continue;
    }
    stack.push(part);
  }
  const joined = stack.join("/");
  if (!joined) {
    return isAbsolute ? "/" : "";
  }
  return isAbsolute ? `/${joined}` : joined;
}

function startsWithPathPrefix(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}/`);
}

export function resolvePathWithinRoot(
  input: string,
  rootPath: string,
): string | null {
  let normalizedRoot = normalizeBrowserPath(rootPath).replace(/\/+$/, "");
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
  const combined = isAbsoluteBrowserPath(input)
    ? normalizedInput
    : `${normalizedRoot}/${normalizedInput}`;
  const normalizedCombined = normalizeSegments(combined);
  if (!normalizedCombined.startsWith(normalizedRoot)) {
    return null;
  }
  const boundary = normalizedCombined.charAt(normalizedRoot.length);
  if (boundary && boundary !== "/") {
    return null;
  }
  return normalizedCombined;
}
