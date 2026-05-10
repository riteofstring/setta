import { resolveTextLikeParamEditorPolicy } from "components/Params/ParamUIs/textLikeEditorPolicy";
import type { GpuRetainedContentTextLikeEditorPolicy } from "gpuFlow/retainedContentScene";
import { PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX } from "./projectGpuParamContentLayout";

const PROJECT_GPU_TEXT_LIKE_LINE_HEIGHT_PX = 16;
const PROJECT_GPU_TEXT_LIKE_VERTICAL_PADDING_PX = 8;

export function getProjectGpuParamRowHeightForCodeObjType({
  codeObjType,
  configLanguage,
}: {
  readonly codeObjType: string;
  readonly configLanguage: string;
}): number {
  const policy = resolveTextLikeParamEditorPolicy({
    codeObjType,
    configLanguage,
  });
  return policy
    ? getProjectGpuParamTextLikePolicyRowHeight(policy)
    : PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX;
}

export function getProjectGpuParamTextLikePolicyRowHeight(
  policy: GpuRetainedContentTextLikeEditorPolicy,
): number {
  if (policy.linePolicy === "single-line") {
    return PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX;
  }
  return Math.max(
    PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX,
    policy.minVisibleLines * PROJECT_GPU_TEXT_LIKE_LINE_HEIGHT_PX +
      PROJECT_GPU_TEXT_LIKE_VERTICAL_PADDING_PX,
  );
}
