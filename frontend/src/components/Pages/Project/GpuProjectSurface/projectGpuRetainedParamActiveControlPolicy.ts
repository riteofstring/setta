import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import { getCurrEffectiveCodeObjImplWithTypeGuardIfPresent } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  isBaseParamCodeObjImpl,
  TimeControlModeEnum,
  type TimeParamCodeObjImpl,
} from "utils/generatedTypes";

type ProjectGpuRetainedParamControlRow = Pick<
  GpuRetainedContentRow,
  "controlKind" | "state"
>;

export function isProjectGpuRetainedParamControlDomIslandActive({
  paramInfoId,
  projectState,
  row,
  sectionId,
}: {
  readonly paramInfoId: string;
  readonly projectState: ZustandProjectState;
  readonly row: ProjectGpuRetainedParamControlRow;
  readonly sectionId: string;
}): boolean {
  if (row.state.disabled || !row.controlKind || row.controlKind === "nested") {
    return false;
  }
  if (row.controlKind !== "date-time") {
    return true;
  }
  const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    projectState,
    sectionId,
    paramInfoId,
    isBaseParamCodeObjImpl,
  );
  if (!codeObjImpl) {
    throw new Error(
      `Missing GPU retained date-time param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  if (codeObjImpl.type === CodeObjTypeEnum.DateParam) {
    return true;
  }
  if (codeObjImpl.type === CodeObjTypeEnum.TimeParam) {
    return (
      (codeObjImpl as TimeParamCodeObjImpl).timeControlMode !==
      TimeControlModeEnum.display
    );
  }
  throw new Error(
    `GPU retained date-time control ${paramInfoId} in section ${sectionId} resolved to unsupported param type ${codeObjImpl.type}.`,
  );
}
