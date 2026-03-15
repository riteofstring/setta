import {
  type CreateTopLevelSectionRequestInput,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
} from "utils/generatedTypes";

export function resolveTextBlockImplOverrides(
  implType: CreateTopLevelSectionRequestInput["implType"],
  implOverrides: CreateTopLevelSectionRequestInput["implOverrides"],
): CreateTopLevelSectionRequestInput["implOverrides"] {
  if (implType !== SectionTypeEnum.TextBlock) {
    return implOverrides;
  }

  if (!implOverrides) {
    return {
      type: SectionTypeEnum.TextBlock,
      textDisplayMode: TextBlockDisplayModeEnum.Edit,
    };
  }

  const resolvedBase =
    "type" in implOverrides && implOverrides.type
      ? implOverrides
      : { ...implOverrides, type: SectionTypeEnum.TextBlock };
  if ("textDisplayMode" in resolvedBase && resolvedBase.textDisplayMode) {
    return resolvedBase;
  }

  return {
    ...resolvedBase,
    textDisplayMode: TextBlockDisplayModeEnum.Edit,
  };
}
