import type { GpuRetainedContentScrollbarAxis } from "./retainedContentScrollbar";
import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentHitRecord = {
  readonly id: string;
  readonly attachmentId?: string | undefined;
  readonly attachmentIndex?: number | undefined;
  readonly kind:
    | "control"
    | "control-subpart"
    | "label"
    | "popup-background"
    | "popup-date-cell"
    | "popup-date-navigation"
    | "popup-option"
    | "port"
    | "row"
    | "scrollbar-thumb"
    | "scrollbar-track";
  readonly cellIndex?: number | undefined;
  readonly cellIsoDate?: string | undefined;
  readonly navigationDirection?: -1 | 1 | undefined;
  readonly optionIndex?: number | undefined;
  readonly optionValue?: string | undefined;
  readonly ownerRowId: string;
  readonly rect: GpuRect;
  readonly scrollbarAxis?: GpuRetainedContentScrollbarAxis | undefined;
  readonly subpartKind?:
    | "dropzone-attachment-delete"
    | "password-reveal"
    | undefined;
};
