import _ from "lodash";
import { useProjectState, ZustandProjectState } from "state/definitions";
import {
  BaseCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjType,
  Core,
  isBaseParamCodeObjImpl,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ListRootViewModeEnum,
  ProjectStateSingleConfig,
  SectionType,
  SectionTypeEnum,
  Variant,
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

export function isBaseCodeSectionType(sectionType: SectionType): boolean {
  return (
    sectionType === SectionTypeEnum.Code ||
    sectionType === SectionTypeEnum.GenPythonCode ||
    sectionType === SectionTypeEnum.GenPythonMetadata
  );
}

export type EmbeddedAttachedTerminalInfo = {
  attachedTerminalId: string;
  isTerminalMinimized: boolean;
};

export function getAttachedTerminalParentIdForTerminalSection(
  state: ZustandProjectState,
  terminalSectionId: string,
): string | null {
  const terminalImpl = getEffectiveSectionImplIfPresent(
    state,
    terminalSectionId,
  );
  if (!terminalImpl) {
    return null;
  }
  if (terminalImpl.type !== SectionTypeEnum.Terminal) {
    return null;
  }
  const parentId = state.parentSectionMap[terminalSectionId] ?? null;
  if (!parentId) {
    return null;
  }
  const parentImpl = getEffectiveSectionImplIfPresent(state, parentId);
  if (!parentImpl) {
    return null;
  }
  if (!isBaseCodeSectionType(parentImpl.type)) {
    return null;
  }
  if (parentImpl.attachedTerminalSectionId !== terminalSectionId) {
    return null;
  }
  return parentId;
}

export function getEmbeddedAttachedTerminalParentIdForTerminalSection(
  state: ZustandProjectState,
  terminalSectionId: string,
): string | null {
  const parentId = getAttachedTerminalParentIdForTerminalSection(
    state,
    terminalSectionId,
  );
  if (!parentId) {
    return null;
  }
  const parentImpl = getEffectiveSectionImplIfPresent(state, parentId);
  if (!parentImpl) {
    return null;
  }
  if (!isBaseParentSectionImpl(parentImpl)) {
    return null;
  }
  const childIds = parentImpl.children;
  const candidateChildId =
    childIds.length > 0 ? childIds[0] : terminalSectionId;
  const isEmbeddedCandidate =
    candidateChildId === terminalSectionId && childIds.length < 2;
  if (!isEmbeddedCandidate) {
    return null;
  }
  return parentId;
}

export function getEmbeddedAttachedTerminalForCodeSection(
  state: ZustandProjectState,
  sectionId: string,
  childIdsOverride?: string[],
): EmbeddedAttachedTerminalInfo | null {
  const impl = getEffectiveSectionImplIfPresent(state, sectionId);
  if (!impl) {
    return null;
  }
  if (!isBaseCodeSectionType(impl.type)) {
    return null;
  }
  const attachedTerminalId = impl.attachedTerminalSectionId ?? null;
  if (!attachedTerminalId || !(attachedTerminalId in state.sections)) {
    return null;
  }
  const parentId = getAttachedTerminalParentIdForTerminalSection(
    state,
    attachedTerminalId,
  );
  if (parentId !== sectionId) {
    return null;
  }
  const childIds =
    childIdsOverride ??
    (isBaseParentSectionImpl(impl) ? impl.children : [attachedTerminalId]);
  const candidateChildId =
    childIds.length > 0 ? childIds[0] : attachedTerminalId;
  const isEmbeddedCandidate =
    candidateChildId === attachedTerminalId && childIds.length < 2;
  if (!isEmbeddedCandidate) {
    return null;
  }
  const terminalImpl = getEffectiveSectionImplIfPresent(
    state,
    attachedTerminalId,
  );
  if (!terminalImpl) {
    return null;
  }
  if (terminalImpl.type !== SectionTypeEnum.Terminal) {
    return null;
  }
  return {
    attachedTerminalId,
    isTerminalMinimized: terminalImpl.isMinimized,
  };
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

export function getCurrSectionVariantId(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variantId = preview
    ? p.previewSectionVariantMap[sectionId] ??
      p.projectConfig.sectionVariantMap[sectionId]
    : p.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    throw new Error();
  }
  return variantId;
}

export function getCurrSectionVariant(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variantId = getCurrSectionVariantId(p, sectionId, preview);
  return getSectionVariant(p, variantId);
}

export function getCurrEffectiveSectionImpl(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
) {
  const variant = getCurrSectionVariant(p, sectionId, preview);
  const baseImpl = getSectionImpl(p, variant.impl);
  const core = getSectionCore(p, sectionId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveSectionImplIfPresent(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
): BaseSectionImplUnion | null {
  const variantId = preview
    ? p.previewSectionVariantMap[sectionId] ??
      p.projectConfig.sectionVariantMap[sectionId]
    : p.projectConfig.sectionVariantMap[sectionId];
  if (variantId === undefined) {
    return null;
  }
  const variant = p.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const baseImpl = p.sectionImpls[variant.impl];
  if (!baseImpl) {
    return null;
  }
  const core = p.sections[sectionId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveSectionImplWithTypeGuard<T>(
  p: ZustandProjectState,
  sectionId: string,
  typeGuard: (impl: BaseSectionImplUnion) => impl is T,
  preview = false,
): T {
  const effective = getCurrEffectiveSectionImpl(p, sectionId, preview);
  if (!typeGuard(effective)) {
    throw new Error(
      `Section implementation failed type guard for section ${sectionId}`,
    );
  }
  return effective;
}

export function getCurrEffectiveSectionImplOfType<T extends SectionType>(
  p: ZustandProjectState,
  sectionId: string,
  expectedType: T,
  preview = false,
): Extract<BaseSectionImplUnion, { type: T }> {
  const impl = getCurrEffectiveSectionImpl(p, sectionId, preview);
  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }
  return impl as Extract<BaseSectionImplUnion, { type: T }>;
}

export type ManagedChatSectionAuthorityState = Pick<
  ZustandProjectState,
  "sections" | "sectionVariants" | "sectionImpls"
> & {
  projectConfig: Pick<
    ZustandProjectState["projectConfig"],
    "sectionVariantMap"
  >;
};

export function isManagedChatSection(
  state: ManagedChatSectionAuthorityState,
  sectionId: string,
): boolean {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return false;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return false;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return false;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return false;
  }
  const effectiveType =
    (variant.modifier as { type?: unknown } | undefined)?.type ??
    (core.sharedModifier as { type?: unknown } | undefined)?.type ??
    (impl as { type?: unknown }).type;
  if (effectiveType !== SectionTypeEnum.Chat) {
    return false;
  }
  const managed =
    (variant.modifier as { managed?: unknown } | undefined)?.managed ??
    (core.sharedModifier as { managed?: unknown } | undefined)?.managed ??
    (impl as { managed?: unknown }).managed;
  return Boolean(managed);
}

export function getVariantBaseAndEffectiveSectionImpl(
  p: ZustandProjectState,
  core: Core,
  variantId: string,
) {
  const variant = getSectionVariant(p, variantId);
  const baseImpl = getSectionImpl(p, variant.impl);
  const impl = getEffectiveImpl(baseImpl, core, variant);
  return { variant, baseImpl, impl };
}

export function getCurrCodeObjVariant(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const sectionImpl = getCurrEffectiveSectionImpl(p, sectionId, preview);
  if (isBaseSectionWithParamsImpl(sectionImpl)) {
    const variantId = sectionImpl.codeObjVariantMap[codeObjId];
    if (variantId === undefined) {
      throw new Error();
    }
    return getCodeObjVariant(p, variantId);
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
    return getCodeObjVariant(p, variantId);
  }
  throw new Error();
}

export function getCurrEffectiveCodeObjImpl(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const variant = getCurrCodeObjVariant(p, sectionId, codeObjId, preview);
  const baseImpl = getCodeObjImpl(p, variant.impl);
  const core = getCodeObjCore(p, codeObjId);
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrEffectiveCodeObjImplWithTypeGuard<T>(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  typeGuard: (impl: BaseCodeObjImplUnion) => impl is T,
  preview = false,
): T {
  const effective = getCurrEffectiveCodeObjImpl(
    p,
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
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  expectedType: T,
): Extract<BaseCodeObjImplUnion, { type: T }> {
  const impl = getCurrEffectiveCodeObjImpl(p, sectionId, codeObjId);
  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }
  return impl as Extract<BaseCodeObjImplUnion, { type: T }>;
}

export function getSectionCore(p: ZustandProjectState, sectionId: string) {
  const section = p.sections[sectionId];
  if (!section) {
    throw new Error();
  }
  return section;
}

export function getSectionImpl(p: ZustandProjectState, implId: string) {
  const impl = p.sectionImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getSectionVariant(p: ZustandProjectState, variantId: string) {
  const variant = p.sectionVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
}

export function getCodeObjCore(p: ZustandProjectState, codeObjId: string) {
  const codeObj = p.codeObjs[codeObjId];
  if (!codeObj) {
    throw new Error();
  }
  return codeObj;
}

export function getParamDisplayName(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
) {
  const codeObj = getCodeObjCore(state, codeObjId);
  if (!state.projectConfig.showParamDisplayNames) {
    return codeObj.name;
  }
  const impl = getCurrEffectiveCodeObjImpl(state, sectionId, codeObjId);
  if (isBaseParamCodeObjImpl(impl) && impl.coreNameEditable) {
    return codeObj.name;
  }
  const trimmedDisplayName = codeObj.displayName.trim();
  if (trimmedDisplayName.length > 0) {
    return codeObj.displayName;
  }
  return codeObj.name;
}

export function getCodeObjImpl(p: ZustandProjectState, implId: string) {
  const impl = p.codeObjImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}

function getCodeObjVariant(p: ZustandProjectState, variantId: string) {
  const variant = p.codeObjVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
}

export function getSectionIsHorizontalOrientation(sectionId: string): boolean {
  const state = useProjectState.getState();
  const variant = getCurrSectionVariant(state, sectionId);
  const impl = getSectionImpl(state, variant.impl);
  if (impl.type === SectionTypeEnum.ListRoot) {
    return impl.viewMode === ListRootViewModeEnum.kanban;
  }
  if (impl.type !== SectionTypeEnum.Group) {
    return false;
  }
  const core = getSectionCore(state, sectionId);
  if (
    Object.prototype.hasOwnProperty.call(
      variant.modifier,
      "isHorizontalOrientation",
    )
  ) {
    return Boolean(variant.modifier.isHorizontalOrientation);
  }
  if (
    Object.prototype.hasOwnProperty.call(
      core.sharedModifier,
      "isHorizontalOrientation",
    )
  ) {
    return Boolean(core.sharedModifier.isHorizontalOrientation);
  }
  return impl.isHorizontalOrientation;
}

export function getSectionType(state: ZustandProjectState, sectionId: string) {
  return getCurrEffectiveSectionImpl(state, sectionId).type;
}

export function getSectionChildren(
  state: ZustandProjectState,
  parentId: string,
) {
  return getCurrEffectiveSectionImplWithTypeGuard(
    state,
    parentId,
    isBaseParentSectionImpl,
  ).children;
}

export function getCurrProjectConfigId() {
  return useProjectState.getState().projectConfig.id;
}
