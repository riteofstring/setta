import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type CodeObjType,
  type Core,
  isBaseSectionWithParamsImpl,
  type SectionType,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getCodeObjCore,
  getCodeObjImpl,
  getCodeObjVariant,
  getEffectiveImpl,
  getSectionCore,
  getSectionImpl,
  getSectionVariant,
} from "./sectionEffectiveImplCore";

export function getCurrSectionVariantId(
  state: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variantId = preview
    ? state.previewSectionVariantMap[sectionId] ??
      state.projectConfig.sectionVariantMap[sectionId]
    : state.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    throw new Error();
  }
  return variantId;
}

export function getCurrSectionVariant(
  state: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variantId = getCurrSectionVariantId(state, sectionId, preview);
  return getSectionVariant(state, variantId);
}

export function getCurrEffectiveSectionImpl(
  state: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variant = getCurrSectionVariant(state, sectionId, preview);
  const baseImpl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveSectionImplIfPresent(
  state: ZustandProjectState,
  sectionId: string,
  preview = false,
): BaseSectionImplUnion | null {
  const variantId = preview
    ? state.previewSectionVariantMap[sectionId] ??
      state.projectConfig.sectionVariantMap[sectionId]
    : state.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const baseImpl = state.sectionImpls[variant.impl];
  if (!baseImpl) {
    return null;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveSectionImplWithTypeGuard<T>(
  state: ZustandProjectState,
  sectionId: string,
  typeGuard: (impl: BaseSectionImplUnion) => impl is T,
  preview = false,
): T {
  const effective = getCurrEffectiveSectionImpl(state, sectionId, preview);
  if (!typeGuard(effective)) {
    throw new Error(
      `Section implementation failed type guard for section ${sectionId}`,
    );
  }
  return effective;
}

export function getCurrEffectiveSectionImplOfType<T extends SectionType>(
  state: ZustandProjectState,
  sectionId: string,
  expectedType: T,
  preview = false,
): Extract<BaseSectionImplUnion, { type: T }> {
  const impl = getCurrEffectiveSectionImpl(state, sectionId, preview);
  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }
  return impl as Extract<BaseSectionImplUnion, { type: T }>;
}

export function getVariantBaseAndEffectiveSectionImpl(
  state: ZustandProjectState,
  core: Core,
  variantId: string,
) {
  const variant = getSectionVariant(state, variantId);
  const baseImpl = getSectionImpl(state, variant.impl);
  const impl = getEffectiveImpl(baseImpl, core, variant);
  return { variant, baseImpl, impl };
}

export function getCurrCodeObjVariant(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const sectionImpl = getCurrEffectiveSectionImpl(state, sectionId, preview);
  if (isBaseSectionWithParamsImpl(sectionImpl)) {
    const variantId = sectionImpl.codeObjVariantMap[codeObjId];
    if (variantId === undefined) {
      throw new Error();
    }
    return getCodeObjVariant(state, variantId);
  }
  if (sectionImpl.type === SectionTypeEnum.MetaControl) {
    const controlParamId = sectionImpl.metaControlParamId;
    if (!controlParamId) {
      throw new Error();
    }
    if (controlParamId !== codeObjId) {
      throw new Error();
    }
    const variantId = sectionImpl.codeObjVariantMap[codeObjId];
    if (variantId === undefined) {
      throw new Error();
    }
    return getCodeObjVariant(state, variantId);
  }
  throw new Error();
}

export function getCurrEffectiveCodeObjImpl(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const variant = getCurrCodeObjVariant(state, sectionId, codeObjId, preview);
  const baseImpl = getCodeObjImpl(state, variant.impl);
  const core = getCodeObjCore(state, codeObjId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveCodeObjImplWithTypeGuard<T>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  typeGuard: (impl: BaseCodeObjImplUnion) => impl is T,
  preview = false,
): T {
  const effective = getCurrEffectiveCodeObjImpl(
    state,
    sectionId,
    codeObjId,
    preview,
  );
  if (!typeGuard(effective)) {
    throw new Error(
      `Code obj implementation failed type guard for section ${sectionId}, codeObj ${codeObjId}`,
    );
  }
  return effective;
}

export function getCurrEffectiveCodeObjImplOfType<T extends CodeObjType>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  expectedType: T,
): Extract<BaseCodeObjImplUnion, { type: T }> {
  const impl = getCurrEffectiveCodeObjImpl(state, sectionId, codeObjId);
  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }
  return impl as Extract<BaseCodeObjImplUnion, { type: T }>;
}

export function getCurrProjectConfigId() {
  return useProjectState.getState().projectConfig.id;
}
