import { getParamDisplayName } from "state/actions/sectionFeatureSelectors";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import type {
  BaseChildlessCodeObjImplUnion,
  BaseSectionImplUnion,
  ProjectStateSingleConfig,
} from "utils/generatedTypes";
import {
  CodeObjTypeEnum,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

type AppConfigState = ProjectStateSingleConfig & {
  previewSectionVariantMap: Record<string, string>;
};

export type AppBoundParamState = {
  canRenderParam: boolean;
  displayName: string | null;
  sectionImpl: BaseSectionImplUnion | null;
  codeObjImpl: BaseChildlessCodeObjImplUnion | null;
};

export function resolveAppBoundParamState(
  configState: AppConfigState,
  sectionId: string,
  paramId: string,
): AppBoundParamState {
  const variantId =
    configState.previewSectionVariantMap[sectionId] ??
    configState.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    return {
      canRenderParam: false,
      displayName: null,
      sectionImpl: null,
      codeObjImpl: null,
    };
  }

  const variant = configState.sectionVariants[variantId];
  if (!variant) {
    return {
      canRenderParam: false,
      displayName: null,
      sectionImpl: null,
      codeObjImpl: null,
    };
  }

  const sectionImpl = configState.sectionImpls[variant.impl];
  if (!sectionImpl || !configState.sections[sectionId]) {
    return {
      canRenderParam: false,
      displayName: null,
      sectionImpl: null,
      codeObjImpl: null,
    };
  }

  let codeObjVariantId: string | null = null;
  if (sectionImpl.type === SectionTypeEnum.MetaControl) {
    const controlParamId = sectionImpl.metaControlParamId;
    if (!controlParamId || controlParamId !== paramId) {
      return {
        canRenderParam: false,
        displayName: null,
        sectionImpl: null,
        codeObjImpl: null,
      };
    }
    codeObjVariantId = sectionImpl.codeObjVariantMap[paramId] ?? null;
  } else if (isBaseSectionWithParamsImpl(sectionImpl)) {
    codeObjVariantId = sectionImpl.codeObjVariantMap[paramId] ?? null;
  } else {
    return {
      canRenderParam: false,
      displayName: null,
      sectionImpl: null,
      codeObjImpl: null,
    };
  }

  if (!codeObjVariantId) {
    return {
      canRenderParam: false,
      displayName: null,
      sectionImpl: null,
      codeObjImpl: null,
    };
  }

  const codeObjVariant = configState.codeObjVariants[codeObjVariantId];
  if (!codeObjVariant) {
    return {
      canRenderParam: false,
      displayName: null,
      sectionImpl: null,
      codeObjImpl: null,
    };
  }

  if (
    !configState.codeObjImpls[codeObjVariant.impl] ||
    !configState.codeObjs[paramId]
  ) {
    return {
      canRenderParam: false,
      displayName: null,
      sectionImpl: null,
      codeObjImpl: null,
    };
  }

  const previewActive =
    configState.previewSectionVariantMap[sectionId] !== undefined;
  return {
    canRenderParam: true,
    displayName: getParamDisplayName(configState, sectionId, paramId),
    sectionImpl: getCurrEffectiveSectionImpl(
      configState,
      sectionId,
      previewActive,
    ),
    codeObjImpl: getCurrEffectiveCodeObjImplWithTypeGuard(
      configState,
      sectionId,
      paramId,
      isBaseChildlessCodeObjImpl,
      previewActive,
    ),
  };
}

export function resolveAppParamEditState(args: {
  canEditParams: boolean;
  modeResolved: boolean;
  serverMode: string | null | undefined;
  codeObjImpl: BaseChildlessCodeObjImplUnion;
}) {
  const codeParamBlocked =
    args.modeResolved &&
    args.serverMode === "app" &&
    args.codeObjImpl.type === CodeObjTypeEnum.CodeParam;
  return {
    codeParamBlocked,
    effectiveCanEditParams: args.canEditParams && !codeParamBlocked,
  };
}
