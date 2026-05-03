import { PARAM_NAME_EMPTY_DEFAULT_VALUE } from "components/Params/ParamItems/paramNameDefaults";
import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";

export function resolveProjectGpuParamRowLabel({
  codeObjImpl,
  projectState,
  rowId,
  sectionId,
}: {
  readonly codeObjImpl: unknown;
  readonly projectState: ZustandProjectState;
  readonly rowId: string;
  readonly sectionId: string;
}): string {
  const core = projectState.codeObjs[rowId];
  if (!core) {
    return rowId;
  }
  if (isBaseParamCodeObjImpl(codeObjImpl) && codeObjImpl.coreNameEditable) {
    return core.name.trim().length > 0
      ? core.name
      : PARAM_NAME_EMPTY_DEFAULT_VALUE;
  }
  const displayName = getParamDisplayNameIfPresent(
    projectState,
    sectionId,
    rowId,
  );
  if (displayName && displayName.trim().length > 0) {
    return displayName;
  }
  return core.name.trim().length > 0 ? core.name : rowId;
}
