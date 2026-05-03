import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDropzoneAttachment,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentDropzoneControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "dropzone" }
>;

export type GpuRetainedContentDropzoneAttachmentLayout = {
  readonly attachment: GpuRetainedContentDropzoneAttachment;
  readonly attachmentIndex: number;
  readonly deleteRect: GpuRect | null;
  readonly rect: GpuRect;
};

const DROPZONE_ATTACHMENT_CHIP_GAP = 4;
const DROPZONE_ATTACHMENT_CHIP_MIN_WIDTH = 52;
const DROPZONE_ATTACHMENT_CHIP_MAX_WIDTH = 92;
const DROPZONE_ATTACHMENT_LEFT_RESERVED_WIDTH = 96;
const DROPZONE_ATTACHMENT_RIGHT_PADDING = 4;
const DROPZONE_DELETE_BUTTON_SIZE = 14;

export function getGpuRetainedContentDropzoneAttachmentLayouts({
  control,
  rect,
}: {
  readonly control: GpuRetainedContentDropzoneControl;
  readonly rect: GpuRect;
}): readonly GpuRetainedContentDropzoneAttachmentLayout[] {
  if (control.attachments.length === 0) {
    return [];
  }
  const outer = getGpuRetainedContentDropzoneOuterRect(rect);
  const attachmentAreaWidth = Math.max(
    DROPZONE_ATTACHMENT_CHIP_MIN_WIDTH,
    outer.width - DROPZONE_ATTACHMENT_LEFT_RESERVED_WIDTH,
  );
  const visibleCount = Math.min(
    control.attachments.length,
    Math.max(
      1,
      Math.floor(
        (attachmentAreaWidth + DROPZONE_ATTACHMENT_CHIP_GAP) /
          (DROPZONE_ATTACHMENT_CHIP_MIN_WIDTH + DROPZONE_ATTACHMENT_CHIP_GAP),
      ),
    ),
  );
  const availableChipWidth =
    attachmentAreaWidth -
    (visibleCount - 1) * DROPZONE_ATTACHMENT_CHIP_GAP -
    DROPZONE_ATTACHMENT_RIGHT_PADDING;
  const chipWidth = Math.min(
    DROPZONE_ATTACHMENT_CHIP_MAX_WIDTH,
    Math.max(
      0,
      Math.floor(visibleCount > 0 ? availableChipWidth / visibleCount : 0),
    ),
  );
  const chipHeight = Math.min(20, Math.max(0, outer.height - 4));
  if (visibleCount <= 0 || chipWidth <= 0 || chipHeight <= 0) {
    return [];
  }
  const startX =
    outer.x +
    outer.width -
    DROPZONE_ATTACHMENT_RIGHT_PADDING -
    visibleCount * chipWidth -
    (visibleCount - 1) * DROPZONE_ATTACHMENT_CHIP_GAP;
  const chipY = outer.y + (outer.height - chipHeight) / 2;
  const deleteSize = Math.min(
    DROPZONE_DELETE_BUTTON_SIZE,
    Math.max(0, chipHeight - 4),
  );
  return control.attachments.slice(0, visibleCount).map((attachment, index) => {
    const chipRect = {
      height: chipHeight,
      width: chipWidth,
      x: startX + index * (chipWidth + DROPZONE_ATTACHMENT_CHIP_GAP),
      y: chipY,
    };
    return {
      attachment,
      attachmentIndex: index,
      deleteRect:
        attachment.id && control.mode !== "STATELESS" && deleteSize > 0
          ? {
              height: deleteSize,
              width: deleteSize,
              x: chipRect.x + chipRect.width - deleteSize - 3,
              y: chipRect.y + (chipRect.height - deleteSize) / 2,
            }
          : null,
      rect: chipRect,
    };
  });
}

export function getGpuRetainedContentDropzoneOuterRect(rect: GpuRect): GpuRect {
  return {
    height: Math.max(0, rect.height - 8),
    width: Math.max(0, rect.width - 12),
    x: rect.x + 6,
    y: rect.y + 4,
  };
}
