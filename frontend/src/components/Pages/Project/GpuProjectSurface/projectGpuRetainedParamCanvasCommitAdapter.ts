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
import { commitProjectGpuRetainedPasswordRevealClick } from "./projectGpuRetainedParamPasswordAdapter";
import type {
  ProjectGpuRetainedPasswordRevealStateMap,
  ProjectGpuRetainedPasswordRevealUpdate,
} from "./projectGpuRetainedParamPasswordRevealState";

export function handleProjectRetainedContentCanvasCommitClick(
  event: GpuRetainedContentInteractionEvent,
  {
    onActiveParamCanvasPopupChange,
    onActiveParamDomIslandChange,
    onPasswordRevealStateChange,
    passwordRevealStates,
  }: {
    readonly onActiveParamCanvasPopupChange: (
      popup: ProjectGpuActiveParamCanvasPopup | null,
    ) => void;
    readonly onActiveParamDomIslandChange: (
      island: ProjectGpuActiveParamDomIsland | null,
    ) => void;
    readonly onPasswordRevealStateChange: (
      update: ProjectGpuRetainedPasswordRevealUpdate,
    ) => void;
    readonly passwordRevealStates: ProjectGpuRetainedPasswordRevealStateMap;
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
  if (
    commitProjectGpuRetainedPasswordRevealClick(event, {
      onPasswordRevealStateChange,
      passwordRevealStates,
    })
  ) {
    onActiveParamCanvasPopupChange(null);
    onActiveParamDomIslandChange(null);
    return true;
  }
  return false;
}
