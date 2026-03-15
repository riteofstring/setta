import _ from "lodash";
import { type ZustandProjectState } from "state/definitions";
import {
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type Core,
  isBaseSectionWithParamsImpl,
  type ProjectStateSingleConfig,
  SectionTypeEnum,
  type Variant,
} from "utils/generatedTypes";

const effectiveImplCacheByImpl = new WeakMap<
  object,
  WeakMap<object, WeakMap<object, unknown>>
>();

export function getEffectiveImpl<T extends object>(
  impl: T,
  core: Core,
  variant: Variant,
): T {
  const sharedModifier = core.sharedModifier;
  const variantModifier = variant.modifier;
  let cacheBySharedModifier = effectiveImplCacheByImpl.get(impl);
  if (!cacheBySharedModifier) {
    cacheBySharedModifier = new WeakMap<object, WeakMap<object, unknown>>();
    effectiveImplCacheByImpl.set(impl, cacheBySharedModifier);
  }
  let cacheByVariantModifier = cacheBySharedModifier.get(sharedModifier);
  if (!cacheByVariantModifier) {
    cacheByVariantModifier = new WeakMap<object, unknown>();
    cacheBySharedModifier.set(sharedModifier, cacheByVariantModifier);
  }
  const cached = cacheByVariantModifier.get(variantModifier);
  if (cached) {
    return cached as T;
  }
  const effective = _.cloneDeep(impl);
  Object.assign(effective, { ...sharedModifier, ...variantModifier });
  cacheByVariantModifier.set(variantModifier, effective);
  return effective;
}

export function invalidateEffectiveImplCache(impl: object): void {
  effectiveImplCacheByImpl.delete(impl);
}

export function getEffectiveSectionImplIfPresent(
  projectState: ProjectStateSingleConfig,
  sectionId: string,
): BaseSectionImplUnion | null {
  const variantId = projectState.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    return null;
  }
  const variant = projectState.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = projectState.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = projectState.sections[sectionId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(impl, core, variant);
}

export function getEffectiveCodeObjImplIfPresent(
  projectState: ZustandProjectState,
  sectionImpl: BaseSectionImplUnion,
  codeObjId: string,
): BaseCodeObjImplUnion | null {
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    if (sectionImpl.type !== SectionTypeEnum.MetaControl) {
      return null;
    }
    if (!sectionImpl.metaControlParamId) {
      return null;
    }
    if (sectionImpl.metaControlParamId !== codeObjId) {
      return null;
    }
    const variantId = sectionImpl.codeObjVariantMap[codeObjId];
    if (variantId === undefined) {
      return null;
    }
    const variant = projectState.codeObjVariants[variantId];
    if (!variant) {
      return null;
    }
    const impl = projectState.codeObjImpls[variant.impl];
    if (!impl) {
      return null;
    }
    const core = projectState.codeObjs[codeObjId];
    if (!core) {
      return null;
    }
    return getEffectiveImpl(impl, core, variant);
  }
  const variantId = sectionImpl.codeObjVariantMap[codeObjId];
  if (variantId === undefined) {
    return null;
  }
  const variant = projectState.codeObjVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = projectState.codeObjImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = projectState.codeObjs[codeObjId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(impl, core, variant);
}

export function getSectionCore(state: ZustandProjectState, sectionId: string) {
  const section = state.sections[sectionId];
  if (!section) {
    throw new Error();
  }
  return section;
}

export function getSectionImpl(state: ZustandProjectState, implId: string) {
  const impl = state.sectionImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getSectionVariant(
  state: ZustandProjectState,
  variantId: string,
) {
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
}

export function getCodeObjCore(state: ZustandProjectState, codeObjId: string) {
  const codeObj = state.codeObjs[codeObjId];
  if (!codeObj) {
    throw new Error();
  }
  return codeObj;
}

export function getCodeObjImpl(state: ZustandProjectState, implId: string) {
  const impl = state.codeObjImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getCodeObjVariant(
  state: ZustandProjectState,
  variantId: string,
) {
  const variant = state.codeObjVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
}
