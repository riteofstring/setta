import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { normalizeBrowserPath } from "utils/browserPaths";

export type FileBrowserSearchScope = "recursive" | "local";

export type FileBrowserTypeFilter = "image" | "video" | "text" | "data";

export const DEFAULT_FILE_BROWSER_TYPE_FILTERS: Record<
  FileBrowserTypeFilter,
  boolean
> = {
  image: true,
  video: true,
  text: true,
  data: true,
};

const DATA_EXTENSIONS = new Set([
  ".avro",
  ".arrow",
  ".csv",
  ".db",
  ".duckdb",
  ".feather",
  ".json",
  ".jsonl",
  ".ndjson",
  ".npy",
  ".npz",
  ".orc",
  ".parquet",
  ".sqlite",
  ".tsv",
  ".xls",
  ".xlsx",
]);

type FileBrowserItemLike = {
  name: string;
  fullPath: string;
  type: string;
  mimeType?: string | null;
  size?: number | null;
};

function extractExtension(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const baseName = value.split(/[/\\]/).pop() ?? value;
  if (!baseName) {
    return null;
  }
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return null;
  }
  return baseName.slice(dotIndex).toLowerCase();
}

export function getFileBrowserTypeFilterForItem(
  item: FileBrowserItemLike,
): FileBrowserTypeFilter | "folder" {
  if (item.type.toLowerCase() === "folder") {
    return "folder";
  }

  const previewKind = getAttachmentPreviewKind({
    id: item.fullPath,
    name: item.name,
    mimeType: item.mimeType ?? null,
    size: item.size ?? null,
  });

  switch (previewKind) {
    case "image":
      return "image";

    case "video":
    case "audio":
      return "video";

    case "text":
    case "pdf": {
      const ext = extractExtension(item.name) ?? extractExtension(item.fullPath);
      if (ext && DATA_EXTENSIONS.has(ext)) {
        return "data";
      }
      return "text";
    }

    case "archive":
    case "other":
      return "data";

    default:
      return previewKind satisfies never;
  }
}

export function filterFileBrowserItemsByTypeFilters<T extends FileBrowserItemLike>(
  items: T[],
  typeFilters: Record<FileBrowserTypeFilter, boolean>,
): T[] {
  return items.filter((item) => {
    if (item.type.toLowerCase() === "folder") {
      return true;
    }
    const category = getFileBrowserTypeFilterForItem(item);
    if (category === "folder") {
      return true;
    }
    return typeFilters[category] === true;
  });
}

export function getFileBrowserFolderPathLabel(fullPath: string): string | null {
  const normalized = normalizeBrowserPath(fullPath).replace(/\/+$/, "");
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex <= 0) {
    return null;
  }
  const folder = normalized.slice(0, slashIndex);
  return folder || null;
}

