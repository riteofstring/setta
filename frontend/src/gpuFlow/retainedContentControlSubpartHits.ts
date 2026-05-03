import { getGpuRetainedContentDropzoneAttachmentDeleteLayout } from "./retainedContentDropzoneLayout";
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
  if (!row.control || row.control.kind !== "dropzone") {
    return [];
  }
  const deleteLayout = getGpuRetainedContentDropzoneAttachmentDeleteLayout({
    control: row.control,
    rect: controlRect,
  });
  if (!deleteLayout) {
    return [];
  }
  return [
    {
      attachmentId: deleteLayout.attachmentId,
      attachmentIndex: deleteLayout.attachmentIndex,
      id: `control-subpart:${row.id}:dropzone-attachment-delete:${deleteLayout.attachmentId}`,
      kind: "control-subpart",
      ownerRowId: row.id,
      rect: deleteLayout.rect,
      subpartKind: "dropzone-attachment-delete",
    },
  ];
}
