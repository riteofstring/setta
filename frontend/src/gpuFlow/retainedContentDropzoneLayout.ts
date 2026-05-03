import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDropzoneAttachment,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentDropzoneControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "dropzone" }
>;

type GpuRetainedContentDropzoneAttachmentDeleteLayout = {
  readonly attachment: GpuRetainedContentDropzoneAttachment;
  readonly attachmentId: string;
  readonly attachmentIndex: number;
  readonly rect: GpuRect;
};

const DROPZONE_DELETE_BUTTON_SIZE = 16;

export function getGpuRetainedContentDropzoneAttachmentDeleteLayout({
  control,
  rect,
}: {
  readonly control: GpuRetainedContentDropzoneControl;
  readonly rect: GpuRect;
}): GpuRetainedContentDropzoneAttachmentDeleteLayout | null {
  const attachment = control.attachments[0];
  if (!attachment?.id) {
    return null;
  }
  const outer = getGpuRetainedContentDropzoneOuterRect(rect);
  const size = Math.min(
    DROPZONE_DELETE_BUTTON_SIZE,
    Math.max(0, outer.height - 4),
  );
  if (size <= 0) {
    return null;
  }
  return {
    attachment,
    attachmentId: attachment.id,
    attachmentIndex: 0,
    rect: {
      height: size,
      width: size,
      x: outer.x + outer.width - size - 4,
      y: outer.y + (outer.height - size) / 2,
    },
  };
}

export function getGpuRetainedContentDropzoneOuterRect(rect: GpuRect): GpuRect {
  return {
    height: Math.max(0, rect.height - 8),
    width: Math.max(0, rect.width - 12),
    x: rect.x + 6,
    y: rect.y + 4,
  };
}
