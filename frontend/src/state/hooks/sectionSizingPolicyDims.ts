import { SIZE_MODE } from "components/Utils/Resizable/utils";
import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionInfos";
import { type ZustandProjectState } from "state/definitions";
import {
  type MetaControlSizingPolicyTypeEntry,
  type SectionSizingPolicy,
  type SectionType,
  SectionTypeEnum,
} from "utils/generatedTypes";

export type SizeMode = {
  height: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
  width: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
};

export function getMetaControlSizingPolicyEntry({
  projectState,
  sectionId,
  controlParamId,
  sizingPolicy,
}: {
  projectState: ZustandProjectState;
  sectionId: string;
  controlParamId: string | null | undefined;
  sizingPolicy: SectionSizingPolicy;
}): MetaControlSizingPolicyTypeEntry | null {
  if (!controlParamId) {
    return null;
  }

  const controlImpl = getCurrEffectiveCodeObjImpl(
    projectState,
    sectionId,
    controlParamId,
  );
  const policyByType = sizingPolicy.metaControlByType;
  const entry = policyByType[controlImpl.type as keyof typeof policyByType];
  return entry ?? null;
}

export function resolveMetaControlSizeMode(
  entry: MetaControlSizingPolicyTypeEntry | null,
): SizeMode | null {
  if (!entry) {
    return null;
  }

  const heightMode = entry.sizeModeHeight;
  const widthMode = entry.sizeModeWidth;
  if (!heightMode && !widthMode) {
    return null;
  }

  return {
    height: heightMode ?? SIZE_MODE.any,
    width: widthMode ?? SIZE_MODE.any,
  };
}

export function getMinSectionHeight({
  sectionType,
  hideSearch,
  hideParams,
  isMinimized,
  sizingPolicy,
}: {
  sectionType: SectionType;
  hideSearch?: boolean;
  hideParams?: boolean;
  isMinimized?: boolean;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  if (isMinimized) {
    return sizingPolicy.globals.minimizedHeight;
  }

  if (sectionType === SectionTypeEnum.Callable) {
    const callablePolicy = sizingPolicy.byType.Callable;
    if (hideSearch) {
      return callablePolicy.hideSearchMinHeight;
    }
    if (hideParams) {
      return callablePolicy.hideParamsMinHeight;
    }
  }

  return policyByType.minHeight;
}

export function getMaxSectionHeight({
  sectionType,
  isMinimized,
  sizingPolicy,
}: {
  sectionType: SectionType;
  isMinimized?: boolean;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  if (isMinimized) {
    return sizingPolicy.globals.minimizedHeight;
  }

  return policyByType.maxHeight;
}

export function getMinSectionWidth({
  sectionType,
  sizingPolicy,
}: {
  sectionType: SectionType;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  return policyByType.minWidth;
}

export function getMaxSectionWidth({
  sectionType,
  sizingPolicy,
}: {
  sectionType: SectionType;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  return policyByType.maxWidth;
}

export function getSectionSizeMode({
  sectionType,
  hideParams,
  isTwitter,
  metaControlSizeMode,
}: {
  sectionType: SectionType;
  hideParams?: boolean;
  isTwitter: boolean;
  metaControlSizeMode: SizeMode | null;
}): SizeMode {
  if (sectionType === SectionTypeEnum.MetaControl && metaControlSizeMode) {
    return metaControlSizeMode;
  }

  if (sectionType === SectionTypeEnum.Callable) {
    if (hideParams) {
      return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
    }
  } else if (
    sectionType === SectionTypeEnum.Terminal ||
    sectionType === SectionTypeEnum.Chart
  ) {
    return { height: SIZE_MODE.manual_only, width: SIZE_MODE.manual_only };
  }

  if (isTwitter) {
    return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
  }

  return { height: SIZE_MODE.any, width: SIZE_MODE.any };
}
