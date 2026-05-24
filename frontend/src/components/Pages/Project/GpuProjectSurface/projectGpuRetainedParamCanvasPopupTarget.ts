import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";

import type { ProjectGpuActiveParamCanvasPopup } from "./projectGpuLayoutAdapter";
import { getProjectGpuRetainedColorPickerPopupTarget } from "./projectGpuRetainedParamColorPickerAdapter";
import { getProjectGpuRetainedDateCalendarPopupTarget } from "./projectGpuRetainedParamDateCalendarAdapter";
import { getProjectGpuRetainedDropdownPopupTarget } from "./projectGpuRetainedParamDropdownAdapter";

export function getProjectGpuRetainedCanvasPopupTarget(
  event: GpuRetainedContentInteractionEvent,
): ProjectGpuActiveParamCanvasPopup | null {
  return (
    getProjectGpuRetainedColorPickerPopupTarget(event) ??
    getProjectGpuRetainedDropdownPopupTarget(event) ??
    getProjectGpuRetainedDateCalendarPopupTarget(event)
  );
}
