import {
  commitParamInputValueChange,
  getParamInputPreviewState,
} from "components/Params/ParamItems/paramValueUpdates";
import { useProjectState } from "state/definitions";

const locallyCommittedSwitchValues = new Map<string, boolean>();

export function commitProjectGpuRetainedSwitchParamClick({
  checked: renderedChecked,
  paramInfoId,
  sectionId,
}: {
  readonly checked?: boolean | undefined;
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
      `Missing GPU retained switch param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  const previewChecked = parseProjectGpuRetainedSwitchValue({
    paramInfoId,
    sectionId,
    value: previewState.baseValue,
  });
  const key = getProjectGpuRetainedSwitchParamKey({ paramInfoId, sectionId });
  const localChecked = resolveProjectGpuRetainedSwitchLocalValue({
    key,
    previewChecked,
  });
  const checked = localChecked ?? previewChecked ?? renderedChecked;
  const nextValue = checked ? "false" : "true";
  locallyCommittedSwitchValues.set(key, !checked);
  commitParamInputValueChange({
    nextValue,
    paramInfoId,
    previousValue: checked ? "true" : "false",
    previewState,
    sectionId,
  });
  const updatedPreviewState = getParamInputPreviewState(
    useProjectState.getState(),
    sectionId,
    paramInfoId,
  );
  if (updatedPreviewState?.baseValue === nextValue) {
    locallyCommittedSwitchValues.delete(key);
  }
}

function resolveProjectGpuRetainedSwitchLocalValue({
  key,
  previewChecked,
}: {
  readonly key: string;
  readonly previewChecked: boolean;
}): boolean | undefined {
  const localChecked = locallyCommittedSwitchValues.get(key);
  if (localChecked === undefined) {
    return undefined;
  }
  if (localChecked !== previewChecked) {
    return localChecked;
  }
  locallyCommittedSwitchValues.delete(key);
  return undefined;
}

function parseProjectGpuRetainedSwitchValue({
  paramInfoId,
  sectionId,
  value,
}: {
  readonly paramInfoId: string;
  readonly sectionId: string;
  readonly value: string;
}): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(
    `GPU retained switch param ${paramInfoId} in section ${sectionId} has non-boolean value ${JSON.stringify(value)}.`,
  );
}

function getProjectGpuRetainedSwitchParamKey({
  paramInfoId,
  sectionId,
}: {
  readonly paramInfoId: string;
  readonly sectionId: string;
}): string {
  return `${sectionId}\0${paramInfoId}`;
}
