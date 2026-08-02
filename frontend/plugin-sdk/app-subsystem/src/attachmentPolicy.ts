import { formatBytes, resolveAttachmentLimit } from "./attachments";
import { C } from "./c";

type AttachmentPolicyScope =
  | "chat"
  | "dropzone_stateful"
  | "dropzone_stateless";

type AttachmentPolicy = {
  scope: AttachmentPolicyScope;
  maxFiles: number | null;
  maxFilesDisabled: boolean;
  maxFileBytes: number;
  maxFileLabel: string;
  maxTotalBytes: number | null;
  maxTotalLabel: string | null;
  allowedMimePrefixes: string[];
  allowedMimeLabel: string;
};

function resolveNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function resolveLabel(value: unknown, bytes: number): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return formatBytes(bytes);
}

function normalizeMimePrefixes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((prefix): prefix is string => {
    return typeof prefix === "string" && prefix.trim().length > 0;
  });
}

function buildAllowedMimeLabel(prefixes: string[]): string {
  if (prefixes.length === 0) {
    return "";
  }
  return `Allowed types: ${prefixes.join(", ")}.`;
}

export function getAttachmentPolicy(
  scope: AttachmentPolicyScope,
): AttachmentPolicy {
  if (scope === "chat") {
    const maxFileBytes = resolveNumber(C.CHAT_ATTACHMENTS_MAX_FILE_BYTES, 0);
    const { maxFiles, disabled } = resolveAttachmentLimit(
      C.CHAT_ATTACHMENTS_MAX_FILES,
    );
    const allowedMimePrefixes = normalizeMimePrefixes(
      C.CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES,
    );
    return {
      scope,
      maxFiles,
      maxFilesDisabled: disabled,
      maxFileBytes,
      maxFileLabel: resolveLabel(
        C.CHAT_ATTACHMENTS_MAX_FILE_LABEL,
        maxFileBytes,
      ),
      maxTotalBytes: null,
      maxTotalLabel: null,
      allowedMimePrefixes,
      allowedMimeLabel: buildAllowedMimeLabel(allowedMimePrefixes),
    };
  }

  if (scope === "dropzone_stateless") {
    const maxFileBytes = resolveNumber(C.DROPZONE_STATELESS_MAX_FILE_BYTES, 0);
    const maxTotalBytes = resolveNumber(
      C.DROPZONE_STATELESS_MAX_TOTAL_BYTES,
      0,
    );
    const allowedMimePrefixes = normalizeMimePrefixes(
      C.DROPZONE_ALLOWED_MIME_PREFIXES,
    );
    return {
      scope,
      maxFiles: null,
      maxFilesDisabled: false,
      maxFileBytes,
      maxFileLabel: resolveLabel(
        C.DROPZONE_STATELESS_MAX_FILE_LABEL,
        maxFileBytes,
      ),
      maxTotalBytes,
      maxTotalLabel: resolveLabel(
        C.DROPZONE_STATELESS_MAX_TOTAL_LABEL,
        maxTotalBytes,
      ),
      allowedMimePrefixes,
      allowedMimeLabel: buildAllowedMimeLabel(allowedMimePrefixes),
    };
  }

  const maxFileBytes = resolveNumber(C.DROPZONE_STATEFUL_MAX_FILE_BYTES, 0);
  const allowedMimePrefixes = normalizeMimePrefixes(
    C.DROPZONE_ALLOWED_MIME_PREFIXES,
  );
  return {
    scope: "dropzone_stateful",
    maxFiles: null,
    maxFilesDisabled: false,
    maxFileBytes,
    maxFileLabel: resolveLabel(
      C.DROPZONE_STATEFUL_MAX_FILE_LABEL,
      maxFileBytes,
    ),
    maxTotalBytes: null,
    maxTotalLabel: null,
    allowedMimePrefixes,
    allowedMimeLabel: buildAllowedMimeLabel(allowedMimePrefixes),
  };
}

export function isAttachmentMimeAllowed(
  mimeType: string,
  policy: AttachmentPolicy,
): boolean {
  if (policy.allowedMimePrefixes.length === 0) {
    return true;
  }
  return policy.allowedMimePrefixes.some((prefix) =>
    mimeType.startsWith(prefix),
  );
}
