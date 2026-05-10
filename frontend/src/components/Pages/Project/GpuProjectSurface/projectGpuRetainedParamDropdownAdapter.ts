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

export function getProjectGpuRetainedDropdownPopupTarget(
  event: GpuRetainedContentInteractionEvent,
): ProjectGpuActiveParamCanvasPopup | null {
  if (event.hit.kind !== "control") {
    return null;
  }
  const row = getProjectGpuRetainedDropdownHitRow(event);
  if (!row?.control || row.control.kind !== "dropdown") {
    return null;
  }
  if (row.control.choices.length === 0) {
    return null;
  }
  return {
    hitRecordId: event.hit.id,
    kind: "dropdown",
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
  };
}

export function commitProjectGpuRetainedDropdownPopupOption(
  event: GpuRetainedContentInteractionEvent,
): boolean {
  if (!isProjectGpuRetainedDropdownPopupOptionHit(event)) {
    return false;
  }
  const row = getProjectGpuRetainedDropdownHitRow(event);
  if (!row?.control || row.control.kind !== "dropdown") {
    return false;
  }
  const choice = getProjectGpuRetainedDropdownChoice(event, row);
  commitProjectGpuRetainedDropdownChoiceValue({
    nextValue: choice.value,
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
  });
  return true;
}

export function isProjectGpuRetainedDropdownPopupOptionHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (event.hit.kind !== "popup-option") {
    return false;
  }
  const row = getProjectGpuRetainedDropdownHitRow(event);
  return row?.control?.kind === "dropdown";
}

function getProjectGpuRetainedDropdownChoice(
  event: GpuRetainedContentInteractionEvent,
  row: GpuRetainedContentRow,
) {
  const optionIndex = event.hit.optionIndex;
  const choice =
    typeof optionIndex === "number" && row.control?.kind === "dropdown"
      ? row.control.choices[optionIndex]
      : undefined;
  if (!choice) {
    throw new Error(
      `Missing GPU retained dropdown choice ${String(optionIndex)} for ${event.hit.ownerRowId} in section ${event.ownerSectionId}.`,
    );
  }
  return choice;
}

export function commitProjectGpuRetainedDropdownChoiceValue({
  nextValue,
  paramInfoId,
  sectionId,
}: {
  readonly nextValue: string;
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
      `Missing GPU retained dropdown param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  commitParamInputValueChange({
    nextValue,
    paramInfoId,
    previousValue: previewState.baseValue,
    previewState,
    sectionId,
  });
}

function getProjectGpuRetainedDropdownHitRow(
  event: GpuRetainedContentInteractionHit,
): GpuRetainedContentRow | undefined {
  return event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
}
