import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentHitRecord = {
  readonly id: string;
  readonly attachmentId?: string | undefined;
  readonly attachmentIndex?: number | undefined;
  readonly kind:
    | "control"
    | "control-subpart"
    | "label"
    | "popup-date-cell"
    | "popup-option"
    | "port"
    | "row";
  readonly cellIndex?: number | undefined;
  readonly cellIsoDate?: string | undefined;
  readonly optionIndex?: number | undefined;
  readonly optionValue?: string | undefined;
  readonly ownerRowId: string;
  readonly rect: GpuRect;
  readonly subpartKind?: "dropzone-attachment-delete" | undefined;
};
