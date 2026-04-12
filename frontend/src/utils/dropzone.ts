import { ARTIFACTS_ROOT, createNewId } from "utils/idNameCreation";

type DropzoneStoredFileAttachment = {
  kind: "file";
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
};

type DropzoneStoredTextAttachment = {
  kind: "text";
  id: string;
  name: string;
  text: string;
};

export type DropzoneStoredAttachment =
  | DropzoneStoredFileAttachment
  | DropzoneStoredTextAttachment;

type DropzoneStoredValue = {
  attachments: DropzoneStoredAttachment[];
};

type DropzoneStatelessFileAttachment = {
  kind: "file";
  name: string;
  mimeType: string;
  size: number;
  contentId: string;
  byteLength: number;
  binaryPayload: ArrayBuffer;
};

type DropzoneStatelessTextAttachment = {
  kind: "text";
  name: string;
  text: string;
};

export type DropzoneStatelessAttachment =
  | DropzoneStatelessFileAttachment
  | DropzoneStatelessTextAttachment;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStoredFileAttachment(
  value: Record<string, unknown>,
): value is DropzoneStoredFileAttachment {
  if (value.kind !== "file") {
    return false;
  }
  if (typeof value.id !== "string") {
    return false;
  }
  if (typeof value.name !== "string") {
    return false;
  }
  if ("mimeType" in value && value.mimeType !== undefined) {
    if (typeof value.mimeType !== "string") {
      return false;
    }
  }
  if ("size" in value && value.size !== undefined) {
    if (typeof value.size !== "number" || Number.isNaN(value.size)) {
      return false;
    }
  }
  return true;
}

function isStoredTextAttachment(
  value: Record<string, unknown>,
): value is DropzoneStoredTextAttachment {
  if (value.kind !== "text") {
    return false;
  }
  if (typeof value.id !== "string") {
    return false;
  }
  if (typeof value.name !== "string") {
    return false;
  }
  if (typeof value.text !== "string") {
    return false;
  }
  return true;
}

function isStoredAttachment(
  value: Record<string, unknown>,
): value is DropzoneStoredAttachment {
  if (value.kind === "file") {
    return isStoredFileAttachment(value);
  }
  if (value.kind === "text") {
    return isStoredTextAttachment(value);
  }
  return false;
}

export function parseDropzoneValue(value: string): DropzoneStoredValue | null {
  if (value.trim() === "") {
    return null;
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const attachments = parsed.attachments;
  if (!Array.isArray(attachments)) {
    return null;
  }
  const normalized: DropzoneStoredAttachment[] = [];
  for (const item of attachments) {
    if (!isRecord(item)) {
      return null;
    }
    if (!isStoredAttachment(item)) {
      return null;
    }
    normalized.push(item);
  }
  return {
    attachments: normalized,
  };
}

export function serializeDropzoneValue(
  attachments: DropzoneStoredAttachment[],
): string {
  if (attachments.length === 0) {
    return "";
  }
  const payload: DropzoneStoredValue = {
    attachments,
  };
  return JSON.stringify(payload);
}

function extractFileExtension(fileName: string): string | null {
  const baseName = fileName.split(/[/\\]/).pop() ?? fileName;
  if (!baseName) {
    return null;
  }
  let dotIndex = baseName.indexOf(".");
  if (dotIndex <= 0) {
    if (baseName.startsWith(".")) {
      dotIndex = baseName.indexOf(".", 1);
    }
  }
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return null;
  }
  return baseName.slice(dotIndex);
}

export function createDropzoneFileArtifactId(
  fileName: string,
  baseFolder?: string,
): string {
  const extension = extractFileExtension(fileName);
  const suffix = extension ?? ".bin";
  const resolvedFolder = baseFolder ?? ARTIFACTS_ROOT;
  return `${resolvedFolder}/${createNewId()}${suffix}`;
}

export function createDropzoneTextAttachmentId(): string {
  return `text:${createNewId()}`;
}
