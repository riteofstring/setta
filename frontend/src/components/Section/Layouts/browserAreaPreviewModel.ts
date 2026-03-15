import { getAttachmentPreviewKind } from "utils/attachmentPreview";
import { formatBytes } from "utils/attachments";
import { type FolderContentItem } from "utils/generatedTypes";
import { isSpreadsheetPath } from "utils/spreadsheet";

export const FILE_URL_REFRESH_BUFFER_MS = 30_000;
export const FILE_URL_REQUEST_CHUNK_SIZE = 120;
export const TEXT_PREVIEW_CHAR_LIMIT = 4_000;
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
export const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

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

export type FileUrlEntry = {
  url: string;
  expiresAt: number;
};

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

function toBrowserAttachment(item: FolderContentItem): BrowserFileAttachment {
  return {
    id: item.fullPath,
    name: item.name,
    mimeType: null,
    size: item.size ?? null,
  };
}

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
  if (item.size === undefined) {
    return null;
  }
  return formatBytes(item.size);
}
