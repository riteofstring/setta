import { resolveTextLikeParamEditorPolicy } from "components/Params/ParamUIs/textLikeEditorPolicy";
import type { GpuRetainedContentControlDescriptor } from "gpuFlow/retainedContentScene";

export function createProjectGpuTextLikeControlDescriptorIfSupported({
  codeObjImpl,
  configLanguage,
  controlKind,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly configLanguage: string;
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor | null {
  const policy = resolveTextLikeParamEditorPolicy({
    codeObjType: codeObjImpl.type,
    configLanguage,
  });
  if (!policy) {
    return null;
  }
  return {
    defaultDisplayValue: toProjectGpuTextLikeDisplayValue(
      codeObjImpl.defaultVal,
    ),
    displayValue: toProjectGpuTextLikeDisplayValue(codeObjImpl.value),
    editorKind: policy.editorKind,
    kind: "text-like",
    policy,
    renderOwner: "dom-owned",
    rendererFamily: controlKind,
    commitPolicy: "native-island",
  };
}

function toProjectGpuTextLikeDisplayValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
