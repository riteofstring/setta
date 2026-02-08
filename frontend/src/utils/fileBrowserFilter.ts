type FileBrowserFilterQuery =
  | { kind: "none" }
  | { kind: "path"; needle: string }
  | { kind: "extension"; suffix: string }
  | { kind: "name"; needle: string };

function normalizeFileBrowserFilterText(value: string): string {
  return value.trim().toLowerCase();
}

function isPathLikeFileBrowserFilterText(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

export function normalizeFileBrowserPathForFilter(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .toLowerCase();
}

export function parseFileBrowserFilterText(
  filterText: string,
): FileBrowserFilterQuery {
  const normalized = normalizeFileBrowserFilterText(filterText);
  if (!normalized) {
    return { kind: "none" };
  }
  if (isPathLikeFileBrowserFilterText(normalized)) {
    return {
      kind: "path",
      needle: normalizeFileBrowserPathForFilter(normalized),
    };
  }
  if (normalized.startsWith("*.") && normalized.length > 2) {
    return { kind: "extension", suffix: normalized.slice(1) };
  }
  return { kind: "name", needle: normalized };
}

export function fuzzySubsequenceMatch(
  needle: string,
  haystack: string,
): boolean {
  if (!needle) {
    return true;
  }
  if (!haystack) {
    return false;
  }
  let needleIndex = 0;
  for (
    let haystackIndex = 0;
    haystackIndex < haystack.length;
    haystackIndex++
  ) {
    if (haystack[haystackIndex] === needle[needleIndex]) {
      needleIndex += 1;
      if (needleIndex >= needle.length) {
        return true;
      }
    }
  }
  return false;
}

export function matchesFileBrowserNameFilter(
  query: FileBrowserFilterQuery,
  nameLower: string,
  type: "file" | "folder",
): boolean {
  if (query.kind === "extension") {
    if (type !== "file") {
      return false;
    }
    return nameLower.endsWith(query.suffix);
  }
  if (query.kind !== "name") {
    return false;
  }
  if (nameLower.includes(query.needle)) {
    return true;
  }
  if (query.needle.length < 2) {
    return false;
  }
  return fuzzySubsequenceMatch(query.needle, nameLower);
}

export function matchesFileBrowserPathFilter(
  query: FileBrowserFilterQuery,
  normalizedFullPath: string,
  normalizedRelativePath?: string | null,
): boolean {
  if (query.kind !== "path") {
    return false;
  }
  if (normalizedRelativePath && normalizedRelativePath.includes(query.needle)) {
    return true;
  }
  return normalizedFullPath.includes(query.needle);
}

export function filterFileBrowserFolderItems<
  T extends { name: string; fullPath: string; type: string },
>(items: T[], filterText: string): T[] {
  const query = parseFileBrowserFilterText(filterText);
  if (query.kind === "none") {
    return items;
  }
  return items.filter((item) => {
    if (query.kind === "path") {
      return matchesFileBrowserPathFilter(
        query,
        normalizeFileBrowserPathForFilter(item.fullPath),
      );
    }
    const type = item.type.toLowerCase() === "folder" ? "folder" : "file";
    return matchesFileBrowserNameFilter(query, item.name.toLowerCase(), type);
  });
}
