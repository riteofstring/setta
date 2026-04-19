import _ from "lodash";
import type { AppSubsystemProjectStateSnapshot } from "./contract";
import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type BaseChildlessCodeObjImplUnion,
  type BaseSectionImplUnion,
  type Core,
  type Variant,
} from "./openapi";

function getEffectiveImpl<T extends object>(
  impl: T,
  core: Core,
  variant: Variant,
): T {
  const effective = _.cloneDeep(impl);
  Object.assign(effective, {
    ...core.sharedModifier,
    ...variant.modifier,
  });
  return effective;
}

export function getCurrentSectionVariantIdIfPresent(
  projectState: AppSubsystemProjectStateSnapshot,
  sectionId: string,
  preview = false,
): string | null {
  const variantId = preview
    ? (projectState.previewSectionVariantMap[sectionId] ??
      projectState.projectConfig.sectionVariantMap[sectionId])
    : projectState.projectConfig.sectionVariantMap[sectionId];
  return variantId ?? null;
}

export function getCurrentSectionVariantId(
  projectState: AppSubsystemProjectStateSnapshot,
  sectionId: string,
  preview = false,
): string {
  const variantId = getCurrentSectionVariantIdIfPresent(
    projectState,
    sectionId,
    preview,
  );
  if (!variantId) {
    throw new Error(`Missing section variant for section ${sectionId}.`);
  }
  return variantId;
}

export function getCurrentEffectiveSectionImplIfPresent(
  projectState: AppSubsystemProjectStateSnapshot,
  sectionId: string,
  preview = false,
): BaseSectionImplUnion | null {
  const variantId = getCurrentSectionVariantIdIfPresent(
    projectState,
    sectionId,
    preview,
  );
  if (!variantId) {
    return null;
  }
  const variant = projectState.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const baseImpl = projectState.sectionImpls[variant.impl];
  if (!baseImpl) {
    return null;
  }
  const core = projectState.sections[sectionId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrentEffectiveSectionImpl(
  projectState: AppSubsystemProjectStateSnapshot,
  sectionId: string,
  preview = false,
): BaseSectionImplUnion {
  const impl = getCurrentEffectiveSectionImplIfPresent(
    projectState,
    sectionId,
    preview,
  );
  if (!impl) {
    throw new Error(`Missing section implementation for section ${sectionId}.`);
  }
  return impl;
}

function getSectionCodeObjVariantId(
  sectionImpl: BaseSectionImplUnion,
  codeObjId: string,
): string | null {
  if (isBaseSectionWithParamsImpl(sectionImpl)) {
    return sectionImpl.codeObjVariantMap[codeObjId] ?? null;
  }
  if (
    sectionImpl.type !== SectionTypeEnum.MetaControl ||
    !sectionImpl.metaControlParamId ||
    sectionImpl.metaControlParamId !== codeObjId
  ) {
    return null;
  }
  return sectionImpl.codeObjVariantMap[codeObjId] ?? null;
}

function getCurrentEffectiveCodeObjImplIfPresent(
  projectState: AppSubsystemProjectStateSnapshot,
  sectionId: string,
  codeObjId: string,
  preview = false,
): BaseChildlessCodeObjImplUnion | null {
  const sectionImpl = getCurrentEffectiveSectionImplIfPresent(
    projectState,
    sectionId,
    preview,
  );
  if (!sectionImpl) {
    return null;
  }
  const variantId = getSectionCodeObjVariantId(sectionImpl, codeObjId);
  if (!variantId) {
    return null;
  }
  const variant = projectState.codeObjVariants[variantId];
  if (!variant) {
    return null;
  }
  const baseImpl = projectState.codeObjImpls[variant.impl];
  if (!baseImpl) {
    return null;
  }
  const core = projectState.codeObjs[codeObjId];
  if (!core) {
    return null;
  }
  return getEffectiveImpl(baseImpl, core, variant) as BaseChildlessCodeObjImplUnion;
}

export function getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent<T>(
  projectState: AppSubsystemProjectStateSnapshot,
  sectionId: string,
  codeObjId: string,
  typeGuard: (impl: BaseChildlessCodeObjImplUnion) => impl is T,
  preview = false,
): T | null {
  const impl = getCurrentEffectiveCodeObjImplIfPresent(
    projectState,
    sectionId,
    codeObjId,
    preview,
  );
  if (!impl || !typeGuard(impl)) {
    return null;
  }
  return impl;
}

export function getParamDisplayNameIfPresent(
  projectState: AppSubsystemProjectStateSnapshot,
  sectionId: string,
  codeObjId: string,
): string | null {
  const codeObj = projectState.codeObjs[codeObjId];
  if (!codeObj) {
    return null;
  }
  if (!projectState.projectConfig.showParamDisplayNames) {
    return codeObj.name;
  }
  const impl = getCurrentEffectiveCodeObjImplIfPresent(
    projectState,
    sectionId,
    codeObjId,
  );
  if (impl && isBaseParamCodeObjImpl(impl) && impl.coreNameEditable) {
    return codeObj.name;
  }
  const trimmedDisplayName = codeObj.displayName.trim();
  if (trimmedDisplayName.length > 0) {
    return codeObj.displayName;
  }
  return codeObj.name;
}
