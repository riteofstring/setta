import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { normalizeBrowserPath } from "utils/browserPaths";
import type { ObjectValues } from "utils/generatedTypes";
import {
  BrowserSearchScopeEnum,
  type BrowserSavedSearchTypeFilters,
} from "utils/generatedTypes";

export type FileBrowserSearchScope = ObjectValues<
  typeof BrowserSearchScopeEnum
>;

type FileBrowserTypeFilter = keyof BrowserSavedSearchTypeFilters;

export const DEFAULT_FILE_BROWSER_TYPE_FILTERS: BrowserSavedSearchTypeFilters =
  {
    image: true,
    video: true,
    audio: true,
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

function isFileBrowserFolderItem(item: FileBrowserItemLike): boolean {
  return item.type.toLowerCase() === "folder";
}

function getTextLikeFileBrowserTypeFilter(
  item: FileBrowserItemLike,
): FileBrowserTypeFilter {
  const ext = extractExtension(item.name) ?? extractExtension(item.fullPath);
  return ext && DATA_EXTENSIONS.has(ext) ? "data" : "text";
}

function getNonFolderFileBrowserTypeFilter(
  item: FileBrowserItemLike,
): FileBrowserTypeFilter {
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
      return "video";

    case "audio":
      return "audio";

    case "text":
    case "pdf":
      return getTextLikeFileBrowserTypeFilter(item);

    case "archive":
    case "other":
      return "data";

    default:
      return previewKind satisfies never;
  }
}

function getFileBrowserTypeFilterForItem(
  item: FileBrowserItemLike,
): FileBrowserTypeFilter | "folder" {
  return isFileBrowserFolderItem(item)
    ? "folder"
    : getNonFolderFileBrowserTypeFilter(item);
}

export function filterFileBrowserItemsByTypeFilters<
  T extends FileBrowserItemLike,
>(items: T[], typeFilters: BrowserSavedSearchTypeFilters): T[] {
  return items.filter((item) => {
    const category = getFileBrowserTypeFilterForItem(item);
    return category === "folder" || typeFilters[category] === true;
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
