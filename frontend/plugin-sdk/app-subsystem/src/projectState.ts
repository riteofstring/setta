import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type Core,
  type Variant,
} from "./generatedTypes";

type ProjectStateSelectorSnapshot = {
  projectConfig: {
    sectionVariantMap: Record<string, string | undefined>;
    showParamDisplayNames?: boolean;
  };
  previewSectionVariantMap: Record<string, string | undefined>;
  sections: Record<string, Core | undefined>;
  sectionVariants: Record<string, Variant | undefined>;
  sectionImpls: Record<string, BaseSectionImplUnion | undefined>;
  codeObjs: Record<string, Core | undefined>;
  codeObjVariants: Record<string, Variant | undefined>;
  codeObjImpls: Record<string, BaseCodeObjImplUnion | undefined>;
};

type ProjectStateMutableValue =
  | null
  | boolean
  | number
  | string
  | Array<ProjectStateMutableValue>
  | { [key: string]: ProjectStateMutableValue | undefined };

type MetaControlSectionLike = BaseSectionImplUnion & {
  codeObjVariantMap?: Record<string, string>;
  metaControlParamId: string | null;
};

type EditableBaseParamCodeObjLike = BaseCodeObjImplUnion & {
  coreNameEditable: boolean;
};

function isMetaControlSectionLike(
  value: BaseSectionImplUnion,
): value is MetaControlSectionLike {
  return value.type === SectionTypeEnum.MetaControl;
}

function hasEditableCoreName(
  value: BaseCodeObjImplUnion,
): value is EditableBaseParamCodeObjLike {
  return isBaseParamCodeObjImpl(value) && "coreNameEditable" in value;
}

function cloneProjectStateValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneProjectStateValue(entry)) as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(
    value as Record<string, ProjectStateMutableValue | undefined>,
  )) {
    cloned[key] = cloneProjectStateValue(entry);
  }
  return cloned as T;
}

function getEffectiveImpl<T extends object>(
  impl: T,
  core: Core,
  variant: Variant,
): T {
  const effective = cloneProjectStateValue(impl);
  Object.assign(
    effective as Record<string, unknown>,
    cloneProjectStateValue(core.sharedModifier),
    cloneProjectStateValue(variant.modifier),
  );
  return effective;
}

export function getCurrentSectionVariantIdIfPresent(
  projectState: ProjectStateSelectorSnapshot,
  sectionId: string,
  preview = false,
): string | null {
  const variantId = preview
    ? projectState.previewSectionVariantMap[sectionId] ??
      projectState.projectConfig.sectionVariantMap[sectionId]
    : projectState.projectConfig.sectionVariantMap[sectionId];
  return variantId ?? null;
}

export function getCurrentSectionVariantId(
  projectState: ProjectStateSelectorSnapshot,
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
  projectState: ProjectStateSelectorSnapshot,
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
  projectState: ProjectStateSelectorSnapshot,
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
  if (!isMetaControlSectionLike(sectionImpl)) {
    return null;
  }
  if (sectionImpl.metaControlParamId !== codeObjId) {
    return null;
  }
  return sectionImpl.codeObjVariantMap?.[codeObjId] ?? null;
}

function getCurrentEffectiveCodeObjImplIfPresent(
  projectState: ProjectStateSelectorSnapshot,
  sectionId: string,
  codeObjId: string,
  preview = false,
): BaseCodeObjImplUnion | null {
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
  return getEffectiveImpl(baseImpl, core, variant);
}

export function getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent<
  T extends BaseCodeObjImplUnion,
>(
  projectState: ProjectStateSelectorSnapshot,
  sectionId: string,
  codeObjId: string,
  typeGuard: (impl: BaseCodeObjImplUnion) => impl is T,
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
  projectState: ProjectStateSelectorSnapshot,
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
  if (impl && hasEditableCoreName(impl) && impl.coreNameEditable) {
    return codeObj.name;
  }
  const trimmedDisplayName = codeObj.displayName.trim();
  if (trimmedDisplayName.length > 0) {
    return codeObj.displayName;
  }
  return codeObj.name;
}
