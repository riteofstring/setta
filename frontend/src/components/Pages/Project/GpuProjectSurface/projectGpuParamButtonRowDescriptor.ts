import type { GpuRetainedContentControlDescriptor } from "gpuFlow/retainedContentScene";
import type { ButtonParamCodeObjImpl } from "utils/generatedTypes";

export function createProjectGpuButtonControlDescriptor({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: ButtonParamCodeObjImpl;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor {
  const label = codeObjImpl.label;
  return {
    defaultDisplayValue: label,
    displayValue: label,
    kind: "button",
    label,
    renderOwner: "canvas-owned",
    rendererFamily: controlKind,
    commitPolicy: "immediate",
  };
}
