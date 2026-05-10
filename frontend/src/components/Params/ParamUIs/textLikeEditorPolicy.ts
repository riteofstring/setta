import type { GpuRetainedContentTextLikeEditorPolicy } from "gpuFlow/retainedContentScene";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export function resolveTextLikeParamEditorPolicy({
  codeObjType,
  configLanguage,
}: {
  readonly codeObjType: string;
  readonly configLanguage: string;
}): GpuRetainedContentTextLikeEditorPolicy | null {
  if (codeObjType === CodeObjTypeEnum.CodeParam) {
    return {
      editorKind: "code",
      language: configLanguage,
      linePolicy: "multiline-fixed",
      maxVisibleLines: 4,
      minVisibleLines: 4,
      wrapLines: true,
    };
  }
  if (codeObjType === CodeObjTypeEnum.TextParam) {
    return {
      editorKind: "text",
      language: configLanguage,
      linePolicy: "single-line",
      maxVisibleLines: 1,
      minVisibleLines: 1,
      wrapLines: false,
    };
  }
  if (codeObjType === CodeObjTypeEnum.TextAreaParam) {
    return {
      editorKind: "textarea",
      language: configLanguage,
      linePolicy: "multiline-fixed",
      maxVisibleLines: 4,
      minVisibleLines: 4,
      wrapLines: true,
    };
  }
  return null;
}
