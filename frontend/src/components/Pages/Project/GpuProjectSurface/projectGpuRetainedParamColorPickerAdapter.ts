import {
  commitParamInputValueChange,
  getParamInputPreviewState,
} from "components/Params/ParamItems/paramValueUpdates";
import type {
  GpuRetainedContentInteractionEvent,
  GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import { useProjectState } from "state/definitions";
import type { ProjectGpuActiveParamCanvasPopup } from "./projectGpuLayoutAdapter";

export function getProjectGpuRetainedColorPickerPopupTarget(
  event: GpuRetainedContentInteractionEvent,
): ProjectGpuActiveParamCanvasPopup | null {
  if (event.hit.kind !== "control") {
    return null;
  }
  const row = getProjectGpuRetainedColorPickerHitRow(event);
  if (!row?.control || row.control.kind !== "color-picker") {
    return null;
  }
  return {
    hitRecordId: event.hit.id,
    kind: "color-picker",
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
  };
}

export function commitProjectGpuRetainedColorPickerPopupOption(
  event: GpuRetainedContentInteractionEvent,
): boolean {
  if (!isProjectGpuRetainedColorPickerPopupOptionHit(event)) {
    return false;
  }
  const row = getProjectGpuRetainedColorPickerHitRow(event);
  if (!row?.control || row.control.kind !== "color-picker") {
    return false;
  }
  const choice = getProjectGpuRetainedColorPickerChoice(event, row);
  commitProjectGpuRetainedColorChoiceValue({
    nextColor: choice.color,
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
  });
  return true;
}

export function isProjectGpuRetainedColorPickerPopupOptionHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (event.hit.kind !== "popup-option") {
    return false;
  }
  const row = getProjectGpuRetainedColorPickerHitRow(event);
  return row?.control?.kind === "color-picker";
}

function getProjectGpuRetainedColorPickerChoice(
  event: GpuRetainedContentInteractionEvent,
  row: GpuRetainedContentRow,
) {
  const optionIndex = event.hit.optionIndex;
  const choice =
    typeof optionIndex === "number" && row.control?.kind === "color-picker"
      ? row.control.choices[optionIndex]
      : undefined;
  if (!choice) {
    throw new Error(
      `Missing GPU retained color choice ${String(optionIndex)} for ${event.hit.ownerRowId} in section ${event.ownerSectionId}.`,
    );
  }
  return choice;
}

export function commitProjectGpuRetainedColorChoiceValue({
  nextColor,
  paramInfoId,
  sectionId,
}: {
  readonly nextColor: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
}) {
  const projectState = useProjectState.getState();
  const previewState = getParamInputPreviewState(
    projectState,
    sectionId,
    paramInfoId,
  );
  if (!previewState) {
    throw new Error(
      `Missing GPU retained color-picker param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  commitParamInputValueChange({
    nextValue: nextColor,
    paramInfoId,
    previousValue: previewState.baseValue,
    previewState,
    sectionId,
  });
}

function getProjectGpuRetainedColorPickerHitRow(
  event: GpuRetainedContentInteractionHit,
): GpuRetainedContentRow | undefined {
  return event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
}
