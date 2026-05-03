import { PARAM_NAME_EMPTY_DEFAULT_VALUE } from "components/Params/ParamItems/paramNameDefaults";
import type { GpuRetainedContentLabelAppearance } from "gpuFlow/retainedContentScene";
import { getParamDisplayNameIfPresent } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";

export type ProjectGpuParamRowLabel = {
  readonly label: string;
  readonly labelAppearance: GpuRetainedContentLabelAppearance;
};

const PROJECT_GPU_PARAM_DISPLAY_LABEL_APPEARANCE: GpuRetainedContentLabelAppearance =
  {
    fontFamily: "sans",
    fontWeight: "normal",
    tone: "default",
  };

const PROJECT_GPU_PARAM_EDITABLE_LABEL_APPEARANCE: GpuRetainedContentLabelAppearance =
  {
    fontFamily: "mono",
    fontWeight: "normal",
    tone: "accent",
  };

const PROJECT_GPU_PARAM_PLACEHOLDER_LABEL_APPEARANCE: GpuRetainedContentLabelAppearance =
  {
    fontFamily: "mono",
    fontWeight: "normal",
    tone: "muted",
  };

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
}): ProjectGpuParamRowLabel {
  const core = projectState.codeObjs[rowId];
  if (!core) {
    return {
      label: rowId,
      labelAppearance: PROJECT_GPU_PARAM_DISPLAY_LABEL_APPEARANCE,
    };
  }
  if (isBaseParamCodeObjImpl(codeObjImpl) && codeObjImpl.coreNameEditable) {
    const name = core.name.trim();
    if (name.length > 0) {
      return {
        label: name,
        labelAppearance: PROJECT_GPU_PARAM_EDITABLE_LABEL_APPEARANCE,
      };
    }
    return {
      label: PARAM_NAME_EMPTY_DEFAULT_VALUE,
      labelAppearance: PROJECT_GPU_PARAM_PLACEHOLDER_LABEL_APPEARANCE,
    };
  }
  const displayName = getParamDisplayNameIfPresent(
    projectState,
    sectionId,
    rowId,
  );
  if (displayName && displayName.trim().length > 0) {
    return {
      label: displayName,
      labelAppearance: PROJECT_GPU_PARAM_DISPLAY_LABEL_APPEARANCE,
    };
  }
  return {
    label: core.name.trim().length > 0 ? core.name : rowId,
    labelAppearance: PROJECT_GPU_PARAM_DISPLAY_LABEL_APPEARANCE,
  };
}
