import {
  ARCHIVE_COMPOUND_EXTENSIONS,
  ARCHIVE_EXTENSIONS,
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "utils/attachmentExtensions";
import { ChatFileAttachment } from "utils/generatedTypes";

type AttachmentPreviewKind =
  | "image"
  | "text"
  | "pdf"
  | "audio"
  | "video"
  | "archive"
  | "other";

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/x-javascript",
  "application/x-python",
  "application/toml",
  "application/x-yaml",
  "application/yaml",
  "application/xml",
  "text/markdown",
  "text/x-markdown",
  "text/x-python",
  "text/x-toml",
]);
const ARCHIVE_MIME_TYPES = new Set([
  "application/zip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-bzip2",
]);

function extractSimpleExtension(value: string): string | null {
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

function hasExtension(
  attachment: ChatFileAttachment,
  extensions: Set<string>,
  compoundExtensions?: Set<string>,
): boolean {
  const sources = [attachment.name, attachment.id];
  for (const source of sources) {
    if (!source) {
      continue;
    }
    const lower = source.toLowerCase();
    if (compoundExtensions) {
      for (const compound of compoundExtensions) {
        if (lower.endsWith(compound)) {
          return true;
        }
      }
    }
    const simple = extractSimpleExtension(lower);
    if (simple && extensions.has(simple)) {
      return true;
    }
  }
  return false;
}

function normalizeAttachmentMime(attachment: ChatFileAttachment): string {
  const mimeType = attachment.mimeType?.trim().toLowerCase();
  if (mimeType) {
    return mimeType;
  }
  return "application/octet-stream";
}

export function isImageAttachment(attachment: ChatFileAttachment): boolean {
  const mimeType = normalizeAttachmentMime(attachment);
  if (mimeType !== "application/octet-stream") {
    return mimeType.startsWith("image/");
  }
  return hasExtension(attachment, IMAGE_EXTENSIONS);
}

export function isTextAttachment(attachment: ChatFileAttachment): boolean {
  const mimeType = normalizeAttachmentMime(attachment);
  if (mimeType.startsWith("text/")) {
    return true;
  }
  if (TEXT_MIME_TYPES.has(mimeType)) {
    return true;
  }
  if (mimeType !== "application/octet-stream") {
    return false;
  }
  return hasExtension(attachment, TEXT_EXTENSIONS);
}

export function isPdfAttachment(attachment: ChatFileAttachment): boolean {
  const mimeType = normalizeAttachmentMime(attachment);
  if (mimeType === "application/pdf") {
    return true;
  }
  if (mimeType !== "application/octet-stream") {
    return false;
  }
  return hasExtension(attachment, PDF_EXTENSIONS);
}

export function isAudioAttachment(attachment: ChatFileAttachment): boolean {
  const mimeType = normalizeAttachmentMime(attachment);
  if (mimeType.startsWith("audio/")) {
    return true;
  }
  if (mimeType !== "application/octet-stream") {
    return false;
  }
  return hasExtension(attachment, AUDIO_EXTENSIONS);
}

export function isVideoAttachment(attachment: ChatFileAttachment): boolean {
  const mimeType = normalizeAttachmentMime(attachment);
  if (mimeType.startsWith("video/")) {
    return true;
  }
  if (mimeType !== "application/octet-stream") {
    return false;
  }
  return hasExtension(attachment, VIDEO_EXTENSIONS);
}

export function isArchiveAttachment(attachment: ChatFileAttachment): boolean {
  const mimeType = normalizeAttachmentMime(attachment);
  if (ARCHIVE_MIME_TYPES.has(mimeType)) {
    return true;
  }
  if (mimeType !== "application/octet-stream") {
    return false;
  }
  return hasExtension(
    attachment,
    ARCHIVE_EXTENSIONS,
    ARCHIVE_COMPOUND_EXTENSIONS,
  );
}

export function getAttachmentPreviewKind(
  attachment: ChatFileAttachment,
): AttachmentPreviewKind {
  if (isImageAttachment(attachment)) {
    return "image";
  }
  if (isPdfAttachment(attachment)) {
    return "pdf";
  }
  if (isAudioAttachment(attachment)) {
    return "audio";
  }
  if (isVideoAttachment(attachment)) {
    return "video";
  }
  if (isTextAttachment(attachment)) {
    return "text";
  }
  if (isArchiveAttachment(attachment)) {
    return "archive";
  }
  return "other";
}
