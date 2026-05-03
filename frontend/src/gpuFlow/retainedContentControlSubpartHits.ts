import { getGpuRetainedContentDropzoneAttachmentLayouts } from "./retainedContentDropzoneLayout";
import { getGpuRetainedContentPasswordLayout } from "./retainedContentPasswordLayout";
import type {
  GpuRetainedContentHitRecord,
  GpuRetainedContentRow,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

export function createGpuRetainedContentControlSubpartHitRecords({
  controlRect,
  row,
}: {
  readonly controlRect: GpuRect;
  readonly row: GpuRetainedContentRow;
}): GpuRetainedContentHitRecord[] {
  if (!row.control) {
    return [];
  }
  if (row.control.kind === "password") {
    return createGpuRetainedContentPasswordRevealHitRecords({
      controlRect,
      row,
    });
  }
  if (row.control.kind !== "dropzone") {
    return [];
  }
  return createGpuRetainedContentDropzoneAttachmentDeleteHitRecords({
    controlRect,
    row,
  });
}

function createGpuRetainedContentDropzoneAttachmentDeleteHitRecords({
  controlRect,
  row,
}: {
  readonly controlRect: GpuRect;
  readonly row: GpuRetainedContentRow;
}): GpuRetainedContentHitRecord[] {
  if (!row.control || row.control.kind !== "dropzone") {
    return [];
  }
  const attachmentLayouts = getGpuRetainedContentDropzoneAttachmentLayouts({
    control: row.control,
    rect: controlRect,
  });
  const records: GpuRetainedContentHitRecord[] = [];
  for (const layout of attachmentLayouts) {
    if (!layout.attachment.id || !layout.deleteRect) {
      continue;
    }
    records.push({
      attachmentId: layout.attachment.id,
      attachmentIndex: layout.attachmentIndex,
      id: `control-subpart:${row.id}:dropzone-attachment-delete:${layout.attachment.id}`,
      kind: "control-subpart",
      ownerRowId: row.id,
      rect: layout.deleteRect,
      subpartKind: "dropzone-attachment-delete",
    });
  }
  return records;
}

function createGpuRetainedContentPasswordRevealHitRecords({
  controlRect,
  row,
}: {
  readonly controlRect: GpuRect;
  readonly row: GpuRetainedContentRow;
}): GpuRetainedContentHitRecord[] {
  if (!row.control || row.control.kind !== "password") {
    return [];
  }
  const layout = getGpuRetainedContentPasswordLayout({
    control: row.control,
    rect: controlRect,
  });
  if (!layout.revealRect) {
    return [];
  }
  return [
    {
      id: `control-subpart:${row.id}:password-reveal`,
      kind: "control-subpart",
      ownerRowId: row.id,
      rect: layout.revealRect,
      subpartKind: "password-reveal",
    },
  ];
}
