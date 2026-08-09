import { IMAGE_EXTENSIONS } from "utils/attachmentExtensions";
import { ChatFileAttachment } from "utils/generatedTypes";

const SUPPORTED_CHAT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const CHAT_IMAGE_MIME_ALIASES = new Map([
  ["image/jpg", "image/jpeg"],
  ["image/pjpeg", "image/jpeg"],
  ["image/jfif", "image/jpeg"],
  ["image/x-png", "image/png"],
]);
const SUPPORTED_CHAT_IMAGE_EXTENSIONS = new Set([
  ".gif",
  ".jpe",
  ".jpeg",
  ".jfif",
  ".jpg",
  ".png",
  ".webp",
]);

export const CHAT_SUPPORTED_IMAGE_LABEL =
  "Supported image types: JPEG, PNG, GIF, WebP.";

function extractSimpleExtension(value?: string | null): string | null {
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

function normalizeChatImageMime(mimeType?: string | null): string {
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized) {
    return "application/octet-stream";
  }
  return CHAT_IMAGE_MIME_ALIASES.get(normalized) ?? normalized;
}

function resolveImageExtension(
  name?: string | null,
  fallback?: string | null,
): string | null {
  const primary = extractSimpleExtension(name);
  if (primary && IMAGE_EXTENSIONS.has(primary)) {
    return primary;
  }
  const secondary = extractSimpleExtension(fallback);
  if (secondary && IMAGE_EXTENSIONS.has(secondary)) {
    return secondary;
  }
  return null;
}

export function isChatImageFileSupported(file: File): boolean {
  const mimeType = normalizeChatImageMime(file.type);
  if (mimeType !== "application/octet-stream") {
    if (!mimeType.startsWith("image/")) {
      return true;
    }
    return SUPPORTED_CHAT_IMAGE_MIME_TYPES.has(mimeType);
  }
  const extension = resolveImageExtension(file.name);
  if (!extension) {
    return true;
  }
  return SUPPORTED_CHAT_IMAGE_EXTENSIONS.has(extension);
}

export function isChatImageAttachmentSupported(
  attachment: ChatFileAttachment,
): boolean {
  const mimeType = normalizeChatImageMime(attachment.mimeType);
  if (mimeType !== "application/octet-stream") {
    if (!mimeType.startsWith("image/")) {
      return true;
    }
    return SUPPORTED_CHAT_IMAGE_MIME_TYPES.has(mimeType);
  }
  const extension = resolveImageExtension(attachment.name, attachment.id);
  if (!extension) {
    return true;
  }
  return SUPPORTED_CHAT_IMAGE_EXTENSIONS.has(extension);
}
