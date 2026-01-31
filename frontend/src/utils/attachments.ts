import { C } from "utils/c";

export const CHAT_ATTACHMENT_MAX_FILES = Number.isFinite(
  C.CHAT_ATTACHMENTS_MAX_FILES,
)
  ? C.CHAT_ATTACHMENTS_MAX_FILES
  : 0;

export const CHAT_ATTACHMENT_ALLOWED_MIME_PREFIXES = Array.isArray(
  C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES,
)
  ? C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES.filter(
      (prefix) => typeof prefix === "string" && prefix.trim().length > 0,
    )
  : [];

export const CHAT_ATTACHMENT_MAX_FILE_BYTES = Number.isFinite(
  C.CHAT_ATTACHMENTS_MAX_FILE_BYTES,
)
  ? C.CHAT_ATTACHMENTS_MAX_FILE_BYTES
  : 0;

export const CHAT_ATTACHMENT_MAX_FILE_LABEL = formatBytes(
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
);

type ChatAttachmentLimit = {
  maxFiles: number | null;
  disabled: boolean;
};

export function resolveChatAttachmentLimit(value: number): ChatAttachmentLimit {
  if (!Number.isFinite(value)) {
    return { maxFiles: 0, disabled: true };
  }
  if (value === 0) {
    return { maxFiles: 0, disabled: true };
  }
  if (value < 0) {
    return { maxFiles: null, disabled: false };
  }
  return { maxFiles: value, disabled: false };
}

export function isChatAttachmentMimeAllowed(mimeType: string): boolean {
  if (CHAT_ATTACHMENT_ALLOWED_MIME_PREFIXES.length === 0) {
    return true;
  }
  return CHAT_ATTACHMENT_ALLOWED_MIME_PREFIXES.some((prefix) =>
    mimeType.startsWith(prefix),
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[index]}`;
}
