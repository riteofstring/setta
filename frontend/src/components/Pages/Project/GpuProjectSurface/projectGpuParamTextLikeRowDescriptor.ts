import type { GpuRetainedContentControlDescriptor } from "gpuFlow/retainedContentScene";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export function createProjectGpuTextLikeControlDescriptorIfSupported({
  codeObjImpl,
  controlKind,
}: {
  readonly codeObjImpl: {
    readonly defaultVal?: unknown;
    readonly type: string;
    readonly value?: unknown;
  };
  readonly controlKind: string;
}): GpuRetainedContentControlDescriptor | null {
  const editorKind = getProjectGpuTextLikeEditorKind(codeObjImpl.type);
  if (!editorKind) {
    return null;
  }
  return {
    defaultDisplayValue: toProjectGpuTextLikeDisplayValue(
      codeObjImpl.defaultVal,
    ),
    displayValue: toProjectGpuTextLikeDisplayValue(codeObjImpl.value),
    editorKind,
    kind: "text-like",
    rendererFamily: controlKind,
    commitPolicy: "native-island",
  };
}

function getProjectGpuTextLikeEditorKind(
  codeObjType: string,
): "code" | "text" | "textarea" | null {
  if (codeObjType === CodeObjTypeEnum.CodeParam) {
    return "code";
  }
  if (codeObjType === CodeObjTypeEnum.TextParam) {
    return "text";
  }
  if (codeObjType === CodeObjTypeEnum.TextAreaParam) {
    return "textarea";
  }
  return null;
}

function toProjectGpuTextLikeDisplayValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
