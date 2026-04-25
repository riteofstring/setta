import type { ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";
import { formatBytes } from "@setta/app-subsystem-frontend-sdk";
import type {
  FilebrowserFileBrowserDownloadUrlEntry,
  FilebrowserFolderContentItem as FolderContentItem,
  FilebrowserListFolderResponse as ListFolderResponse,
  FilebrowserRootResponse as RootResponse,
} from "openapi/http";
import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  type FileBrowserTypeFilters,
} from "utils/fileBrowserTypes";
import { isSpreadsheetPath } from "utils/spreadsheet";

const FILE_URL_REFRESH_BUFFER_MS = 30000;
export const FILE_URL_REQUEST_CHUNK_SIZE = 120;
export const TEXT_PREVIEW_CHAR_LIMIT = 4000;
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
export const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
export const FILTER_RECURSIVE_MIN_CHARS = 2;
export const FILTER_RECURSIVE_MAX_RESULTS = 600;
export const FILTER_RECURSIVE_MAX_FOLDERS = 600;

type BrowserFileAttachment = {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};

export type OpenableBrowserItem = {
  name: string;
  fullPath: string;
  type: string;
};

export type FileUrlEntry = Pick<
  FilebrowserFileBrowserDownloadUrlEntry,
  "url" | "expiresAt"
>;

export type GetFileBrowserDownloadURLsRouteResponse = ResponseDataAndStatus<
  Array<FilebrowserFileBrowserDownloadUrlEntry>
>;

export type GetFolderContentsRouteResponse =
  ResponseDataAndStatus<ListFolderResponse>;

export type GetFileBrowserRootRouteResponse =
  ResponseDataAndStatus<RootResponse>;

export type FileTextPreview = {
  text: string;
  truncated: boolean;
  isLoading: boolean;
  error: string | null;
};

export type BrowserPreviewKind =
  | "image"
  | "pdf"
  | "audio"
  | "video"
  | "spreadsheet"
  | "text"
  | "archive"
  | "folder"
  | "other";

export function extractExtension(value: string | undefined): string | null {
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

export function getExtensionBadge(value: string | undefined): string | null {
  const extension = extractExtension(value);
  if (!extension) {
    return null;
  }
  const label = extension.replace(".", "").toUpperCase();
  if (!label) {
    return null;
  }
  return label.length > 6 ? label.slice(0, 6) : label;
}

export function normalizeFolderPrefix(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function normalizeFileBrowserTypeFilters(
  typeFilters: Partial<FileBrowserTypeFilters> | null | undefined,
): typeof DEFAULT_FILE_BROWSER_TYPE_FILTERS {
  return typeFilters
    ? { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS, ...typeFilters }
    : { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS };
}

function toBrowserAttachment(item: FolderContentItem): BrowserFileAttachment {
  return {
    id: item.fullPath,
    name: item.name,
    mimeType: null,
    size: item.size ?? null,
  };
}

export function getBrowserPreviewKind(
  item: FolderContentItem,
): BrowserPreviewKind {
  if (item.type.toLowerCase() === "folder") {
    return "folder";
  }
  if (isSpreadsheetPath(item.name) || isSpreadsheetPath(item.fullPath)) {
    return "spreadsheet";
  }
  return getAttachmentPreviewKind(toBrowserAttachment(item));
}

export function isFileUrlStale(entry: FileUrlEntry, now: number): boolean {
  return entry.expiresAt * 1000 - FILE_URL_REFRESH_BUFFER_MS <= now;
}

export function getFileSizeLabel(item: FolderContentItem): string | null {
  if (item.type.toLowerCase() === "folder") {
    return null;
  }
  return item.size != null ? formatBytes(item.size) : null;
}
