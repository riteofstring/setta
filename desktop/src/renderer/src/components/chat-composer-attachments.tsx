import { imageAttachmentMimeTypeValues, type ImageAttachment } from "@generated/backend";
import { X } from "lucide-react";

import { selectImageVariant } from "../lib/chat-image-variants";

export const maxComposerImageAttachments = 10;

const supportedComposerImageTypes = new Set<string>(imageAttachmentMimeTypeValues);

export function AttachmentStrip({
  attachments,
  error,
  onRemove,
}: {
  attachments: ImageAttachment[];
  error: string | null;
  onRemove: (attachmentId: string) => void;
}) {
  if (attachments.length === 0 && error === null) {
    return null;
  }
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      {attachments.map((attachment) => (
        <AttachmentChip attachment={attachment} key={attachment.id} onRemove={onRemove} />
      ))}
      {error ? (
        <div className="max-w-full truncate text-xs text-status-critical" title={error}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ImageAttachment;
  onRemove: (attachmentId: string) => void;
}) {
  const thumbnail = selectImageVariant(attachment, "thumbnail");
  const title = thumbnail.status === "ready" ? attachment.fileName : thumbnail.message;
  return (
    <div
      className="flex h-11 max-w-48 min-w-0 items-center gap-1.5 rounded-sm border border-border bg-background/70 p-1"
      title={title}
    >
      {thumbnail.status === "ready" ? (
        <img
          alt={attachment.fileName}
          className="h-9 w-9 shrink-0 rounded-[2px] object-cover"
          data-attachment-variant-kind="thumbnail"
          decoding="async"
          src={thumbnail.variant.url}
        />
      ) : (
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[2px] border border-status-critical/50 text-[10px] font-medium text-status-critical"
          role="status"
        >
          Image
        </div>
      )}
      <span className="min-w-0 truncate text-xs text-muted-foreground">{attachment.fileName}</span>
      <button
        aria-label={`Remove ${attachment.fileName}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent"
        onClick={() => onRemove(attachment.id)}
        title="Remove image"
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function validateComposerAttachmentFiles(
  fileList: FileList | File[],
  currentAttachmentCount: number,
) {
  const files = Array.from(fileList);
  if (files.length === 0) {
    return { error: null, files };
  }
  const unsupported = files.find((file) => !supportedComposerImageTypes.has(file.type));
  if (unsupported) {
    return { error: `${unsupported.name} is not a supported image type.`, files: [] };
  }
  const remaining = maxComposerImageAttachments - currentAttachmentCount;
  if (files.length > remaining) {
    return {
      error: `A message can include up to ${maxComposerImageAttachments} images.`,
      files: [],
    };
  }
  return { error: null, files };
}

export async function createImageAttachmentsFromFiles(
  files: File[],
  createImageAttachmentFromBytes: (
    fileName: string,
    dataBase64: string,
  ) => Promise<ImageAttachment>,
) {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return {
          attachment: await createImageAttachmentFromBytes(file.name, await fileToBase64(file)),
          error: null,
          fileName: file.name,
        };
      } catch (error) {
        return {
          attachment: null,
          error: error instanceof Error ? error.message : String(error),
          fileName: file.name,
        };
      }
    }),
  );
  const attachments = results
    .map((result) => result.attachment)
    .filter((attachment): attachment is ImageAttachment => attachment !== null);
  const failed = results.filter((result) => result.error !== null);
  return {
    attachments,
    error:
      failed.length === 0
        ? null
        : failed.map((result) => `${result.fileName}: ${result.error}`).join("\n"),
  };
}

export function dragHasImageFile(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.items).some(
    (item) => item.kind === "file" && supportedComposerImageTypes.has(item.type),
  );
}

export function clipboardHasImageFile(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files).some((file) => supportedComposerImageTypes.has(file.type));
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
