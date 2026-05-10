import {
  buildButtonRequestConfig,
  triggerButtonParamAction,
} from "components/Section/Layouts/buttonParamAction";
import { getCurrEffectiveCodeObjImplWithTypeGuardIfPresent } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  type BaseCodeObjImplUnion,
  type ButtonParamCodeObjImpl,
} from "utils/generatedTypes";

export function commitProjectGpuRetainedButtonParamClick({
  paramInfoId,
  sectionId,
}: {
  readonly paramInfoId: string;
  readonly sectionId: string;
}) {
  const buttonImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    useProjectState.getState(),
    sectionId,
    paramInfoId,
    isButtonParamCodeObjImpl,
  );
  if (!buttonImpl) {
    throw new Error(
      `Missing GPU retained button param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  triggerButtonParamAction({
    buttonConfig: buildButtonRequestConfig(buttonImpl),
    controlParamId: paramInfoId,
    sectionId,
  });
}

function isButtonParamCodeObjImpl(
  impl: BaseCodeObjImplUnion,
): impl is ButtonParamCodeObjImpl {
  return impl.type === CodeObjTypeEnum.ButtonParam;
}
