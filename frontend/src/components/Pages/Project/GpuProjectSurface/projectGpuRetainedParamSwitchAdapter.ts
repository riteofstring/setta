import {
  commitParamInputValueChange,
  getParamInputPreviewState,
} from "components/Params/ParamItems/paramValueUpdates";
import { useProjectState } from "state/definitions";

export function commitProjectGpuRetainedSwitchParamClick({
  checked,
  paramInfoId,
  sectionId,
}: {
  readonly checked: boolean;
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
  commitParamInputValueChange({
    nextValue: checked ? "false" : "true",
    paramInfoId,
    previousValue: previewState.baseValue,
    previewState,
    sectionId,
  });
}
