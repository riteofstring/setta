import type {
  DropzoneAttachment,
  DropzoneFileRejection,
  DropzonePolicy,
  DropzoneTextRejection,
} from "./dropzoneTypes";

type DropzoneFilePartition = {
  accepted: File[];
  rejected: DropzoneFileRejection[];
};

function assertPositiveByteLimit(field: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `DropzoneValueControl received invalid ${field}: ${String(value)}.`,
    );
  }
}

function assertOptionalPositiveByteLimit(
  field: string,
  value: number | null,
): void {
  if (value !== null) {
    assertPositiveByteLimit(field, value);
  }
}

function assertAttachmentLimit(maxAttachments: number | null): void {
  if (
    maxAttachments !== null &&
    (!Number.isSafeInteger(maxAttachments) || maxAttachments <= 0)
  ) {
    throw new Error(
      `DropzoneValueControl received invalid maxAttachments: ${String(maxAttachments)}.`,
    );
  }
}

function assertMimePrefixes(prefixes: ReadonlyArray<string>): void {
  for (const prefix of prefixes) {
    if (prefix.length === 0 || prefix.trim() !== prefix) {
      throw new Error(
        `DropzoneValueControl received invalid allowedMimePrefix: ${JSON.stringify(prefix)}.`,
      );
    }
  }
}

export function assertDropzonePolicy(policy: DropzonePolicy): void {
  assertAttachmentLimit(policy.maxAttachments);
  assertPositiveByteLimit("maxFileBytes", policy.maxFileBytes);
  assertOptionalPositiveByteLimit("maxTotalBytes", policy.maxTotalBytes);
  assertMimePrefixes(policy.allowedMimePrefixes);
}

function assertAttachment(
  attachment: DropzoneAttachment,
  seenIds: Set<string>,
): void {
  if (attachment.id.length === 0) {
    throw new Error(
      "DropzoneValueControl received an attachment with an empty id.",
    );
  }
  if (seenIds.has(attachment.id)) {
    throw new Error(
      `DropzoneValueControl received duplicate attachment id: ${attachment.id}.`,
    );
  }
  if (attachment.kind !== "file" && attachment.kind !== "text") {
    throw new Error(
      `DropzoneValueControl received invalid attachment kind: ${String(attachment.kind)}.`,
    );
  }
  if (attachment.name.length === 0) {
    throw new Error(
      `DropzoneValueControl attachment ${attachment.id} has an empty name.`,
    );
  }
  if (
    attachment.size !== null &&
    (!Number.isSafeInteger(attachment.size) || attachment.size < 0)
  ) {
    throw new Error(
      `DropzoneValueControl attachment ${attachment.id} has invalid size: ${String(attachment.size)}.`,
    );
  }
  seenIds.add(attachment.id);
}

export function assertDropzoneAttachments(
  attachments: ReadonlyArray<DropzoneAttachment>,
  policy: DropzonePolicy,
): void {
  const seenIds = new Set<string>();
  for (const attachment of attachments) {
    assertAttachment(attachment, seenIds);
  }
  if (
    policy.maxAttachments !== null &&
    attachments.length > policy.maxAttachments
  ) {
    throw new Error(
      `DropzoneValueControl received ${attachments.length} attachments above its ${policy.maxAttachments} attachment limit.`,
    );
  }
}

export function getDropzoneRemainingSlots(
  attachments: ReadonlyArray<DropzoneAttachment>,
  policy: DropzonePolicy,
): number | null {
  if (policy.maxAttachments === null) {
    return null;
  }
  return Math.max(0, policy.maxAttachments - attachments.length);
}

function partitionByFileSize(files: ReadonlyArray<File>, maxFileBytes: number) {
  const accepted: File[] = [];
  const rejected: DropzoneFileRejection[] = [];
  for (const file of files) {
    if (file.size > maxFileBytes) {
      rejected.push({ kind: "file", file, reason: "file-size" });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected } satisfies DropzoneFilePartition;
}

function partitionByAttachmentCount(
  files: ReadonlyArray<File>,
  remainingSlots: number | null,
) {
  if (remainingSlots === null || files.length <= remainingSlots) {
    return {
      accepted: [...files],
      rejected: [],
    } satisfies DropzoneFilePartition;
  }
  return {
    accepted: files.slice(0, remainingSlots),
    rejected: files.slice(remainingSlots).map((file) => ({
      kind: "file" as const,
      file,
      reason: "attachment-count" as const,
    })),
  } satisfies DropzoneFilePartition;
}

function isMimeAllowed(
  file: File,
  allowedMimePrefixes: ReadonlyArray<string>,
): boolean {
  if (allowedMimePrefixes.length === 0) {
    return true;
  }
  const mimeType = file.type || "application/octet-stream";
  return allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix));
}

function partitionByMime(
  files: ReadonlyArray<File>,
  allowedMimePrefixes: ReadonlyArray<string>,
) {
  const accepted: File[] = [];
  const rejected: DropzoneFileRejection[] = [];
  for (const file of files) {
    if (isMimeAllowed(file, allowedMimePrefixes)) {
      accepted.push(file);
    } else {
      rejected.push({ kind: "file", file, reason: "mime-type" });
    }
  }
  return { accepted, rejected } satisfies DropzoneFilePartition;
}

function partitionByTotalSize(
  files: ReadonlyArray<File>,
  maxTotalBytes: number | null,
) {
  if (maxTotalBytes === null) {
    return {
      accepted: [...files],
      rejected: [],
    } satisfies DropzoneFilePartition;
  }
  const accepted: File[] = [];
  const rejected: DropzoneFileRejection[] = [];
  let acceptedBytes = 0;
  for (const file of files) {
    if (acceptedBytes + file.size > maxTotalBytes) {
      rejected.push({ kind: "file", file, reason: "total-size" });
    } else {
      acceptedBytes += file.size;
      accepted.push(file);
    }
  }
  return { accepted, rejected } satisfies DropzoneFilePartition;
}

export function partitionDropzoneFiles(
  files: ReadonlyArray<File>,
  policy: DropzonePolicy,
  remainingSlots: number | null,
): DropzoneFilePartition {
  const sized = partitionByFileSize(files, policy.maxFileBytes);
  const counted = partitionByAttachmentCount(sized.accepted, remainingSlots);
  const typed = partitionByMime(counted.accepted, policy.allowedMimePrefixes);
  const totaled = partitionByTotalSize(typed.accepted, policy.maxTotalBytes);
  return {
    accepted: totaled.accepted,
    rejected: [
      ...sized.rejected,
      ...counted.rejected,
      ...typed.rejected,
      ...totaled.rejected,
    ],
  };
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function getDroppedTextRejection(
  text: string,
  policy: DropzonePolicy,
  remainingSlots: number | null,
): DropzoneTextRejection | null {
  if (remainingSlots === 0) {
    return { kind: "text", text, reason: "attachment-count" };
  }
  if (
    policy.maxTotalBytes !== null &&
    getUtf8ByteLength(text) > policy.maxTotalBytes
  ) {
    return { kind: "text", text, reason: "total-size" };
  }
  return null;
}

export function formatDropzoneBytes(bytes: number): string {
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
