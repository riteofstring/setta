import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";
import type {
  ProjectGpuActiveParamCanvasPopup,
  ProjectGpuActiveParamDomIsland,
} from "./projectGpuLayoutAdapter";
import { commitProjectGpuRetainedColorPickerPopupOption } from "./projectGpuRetainedParamColorPickerAdapter";
import {
  commitProjectGpuRetainedDateCalendarPopupCell,
  getProjectGpuRetainedDateCalendarNavigationTarget,
} from "./projectGpuRetainedParamDateCalendarAdapter";
import { commitProjectGpuRetainedDropdownPopupOption } from "./projectGpuRetainedParamDropdownAdapter";
import { commitProjectGpuRetainedDropzoneAttachmentDelete } from "./projectGpuRetainedParamDropzoneAdapter";

export function handleProjectRetainedContentCanvasCommitClick(
  event: GpuRetainedContentInteractionEvent,
  {
    onActiveParamCanvasPopupChange,
    onActiveParamDomIslandChange,
  }: {
    readonly onActiveParamCanvasPopupChange: (
      popup: ProjectGpuActiveParamCanvasPopup | null,
    ) => void;
    readonly onActiveParamDomIslandChange: (
      island: ProjectGpuActiveParamDomIsland | null,
    ) => void;
  },
): boolean {
  if (commitProjectGpuRetainedColorPickerPopupOption(event)) {
    onActiveParamCanvasPopupChange(null);
    onActiveParamDomIslandChange(null);
    return true;
  }
  if (commitProjectGpuRetainedDropdownPopupOption(event)) {
    onActiveParamCanvasPopupChange(null);
    onActiveParamDomIslandChange(null);
    return true;
  }
  const dateCalendarNavigation =
    getProjectGpuRetainedDateCalendarNavigationTarget(event);
  if (dateCalendarNavigation) {
    onActiveParamCanvasPopupChange(dateCalendarNavigation);
    onActiveParamDomIslandChange(null);
    return true;
  }
  if (commitProjectGpuRetainedDateCalendarPopupCell(event)) {
    onActiveParamCanvasPopupChange(null);
    onActiveParamDomIslandChange(null);
    return true;
  }
  if (commitProjectGpuRetainedDropzoneAttachmentDelete(event)) {
    onActiveParamCanvasPopupChange(null);
    onActiveParamDomIslandChange(null);
    return true;
  }
  return false;
}
