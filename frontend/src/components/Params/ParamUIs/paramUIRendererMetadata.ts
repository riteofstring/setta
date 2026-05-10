import {
  ParamUIRendererConfig,
  type CodeObjType,
  type ParamUIRendererFamily,
} from "utils/generatedTypes";

export type SectionParamUIRendererFamily = ParamUIRendererFamily;

export const TEXT_LIKE_PARAM_TYPES = ParamUIRendererConfig.textLikeParamTypes;

export const SPECIALIZED_PARAM_RENDERER_FAMILIES =
  ParamUIRendererConfig.specializedRendererFamilies;

const PARAM_UI_RENDERER_FAMILIES_BY_TYPE: Partial<
  Record<CodeObjType, SectionParamUIRendererFamily>
> = ParamUIRendererConfig.rendererFamiliesByType;

export function getSectionParamUIRendererTypes(): readonly CodeObjType[] {
  return ParamUIRendererConfig.rendererTypes;
}

export function getSectionParamUIRendererFamily(
  codeObjType: CodeObjType,
): SectionParamUIRendererFamily | null {
  return PARAM_UI_RENDERER_FAMILIES_BY_TYPE[codeObjType] ?? null;
}
