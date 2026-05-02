import {
  clearEffectiveImplCache,
  getCurrentEffectiveCodeObjImplIfPresent,
  getCurrentEffectiveSectionImpl,
  getCurrentEffectiveSectionImplIfPresent,
  getCurrentSectionVariantId,
  getEffectiveImpl,
  getSectionCodeObjVariantId,
  getParamDisplayNameIfPresent as getSharedParamDisplayNameIfPresent,
} from "@setta/app-subsystem-frontend-sdk";

import _ from "lodash";

import { isSectionStreamActive } from "state/aiStreamingTracker";

import { ZustandProjectState } from "state/definitions";

import {
  BaseCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjType,
  Core,
  IFrameSectionImpl,
  SectionType,
  SectionTypeEnum,
  SingleConfig,
  Variant,
  isBaseParentSectionImpl,
} from "utils/generatedTypes";

import { resolveHydratedToolCallArguments } from "../chatHydrationOverlays";

import {
  getActiveViewModeTopLevelSections,
  getCodeObjVariant,
} from "./codeObjectsAndLayout";

// Keep this in sync with internal/projectstate/unshared_defaults.go so optimistic
// frontend writes follow the same ownership routing as the Go owner.
export const DEFAULT_UNSHARED_PROJECT_FIELDS = new Set([
  "callable",
  "codeObjVariantMap",
  "edgeInputParams",
  "edgeOutputPorts",
  "layers",
  "topLevelParamId",
  "value",
]);

export type GeneratedImplUpdateValue<T> = T | ((prev: T) => T);

export type ImplUpdateArgs<T extends object> = {
  [K in keyof T]?: GeneratedImplUpdateValue<T[K]>;
};

export type MutableGeneratedImpl = BaseSectionImplUnion | BaseCodeObjImplUnion;

export function getEffectiveSectionImplIfPresent(
  projectState: SingleConfig,
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

export type ChatSectionImpl = Extract<
  BaseSectionImplUnion,
  {
    type: SectionTypeEnum.Chat;
  }
>;

export type ManagedChatSectionAuthorityState = Pick<
  ZustandProjectState,
  "sections" | "sectionVariants" | "sectionImpls"
> & {
  projectConfig: Pick<
    ZustandProjectState["projectConfig"],
    "sectionVariantMap"
  >;
};

export type SectionAuthoritySnapshot = {
  variant: Variant;
  impl: BaseSectionImplUnion;
  core: Core;
};

export type ResolvedChatSection = {
  variant: Variant;
  impl: ChatSectionImpl;
  core: Core;
  effective: ChatSectionImpl;
};

export function getSectionAuthoritySnapshotIfPresent(
  state: ManagedChatSectionAuthorityState,
  sectionId: string,
): SectionAuthoritySnapshot | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = state.sections[sectionId];
  if (!core) {
    return null;
  }
  return { variant, impl, core };
}

export function getEffectiveSectionOverrideValue(
  snapshot: SectionAuthoritySnapshot,
  key: string,
): unknown {
  const sources = [
    snapshot.variant.modifier as Record<string, unknown> | undefined,
    snapshot.core.sharedModifier as Record<string, unknown> | undefined,
    snapshot.impl as Record<string, unknown>,
  ];
  for (const source of sources) {
    const value = source?.[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

export function resolveChatSectionForMerge(
  state: ManagedChatSectionAuthorityState,
  sectionId: string,
): ResolvedChatSection | null {
  const snapshot = getSectionAuthoritySnapshotIfPresent(state, sectionId);
  if (!snapshot || snapshot.impl.type !== SectionTypeEnum.Chat) {
    return null;
  }
  const impl = snapshot.impl as ChatSectionImpl;
  return {
    variant: snapshot.variant,
    impl,
    core: snapshot.core,
    effective: getEffectiveImpl(impl, snapshot.core, snapshot.variant),
  };
}

export function getStreamingChatMergePatch(
  incomingChat: ChatSectionImpl,
  currentChat: ChatSectionImpl,
  isManagedSection: boolean,
  shouldPreserveStreaming: boolean,
): Pick<
  ChatSectionImpl,
  "inputText" | "toolCallArguments" | "waitingForResponse"
> | null {
  const incomingToolArgs = incomingChat.toolCallArguments ?? {};
  const currentToolArgs = currentChat.toolCallArguments ?? {};
  const incomingInputText = incomingChat.inputText ?? "";
  const currentInputText = currentChat.inputText ?? "";
  const nextInputText = getStreamingChatInputText(
    incomingInputText,
    currentInputText,
    isManagedSection,
  );
  const nextWaitingForResponse = getStreamingChatWaitingForResponse(
    incomingChat.waitingForResponse,
    currentChat.waitingForResponse,
    isManagedSection,
    shouldPreserveStreaming,
  );
  const nextToolCallArguments = getStreamingChatToolCallArguments(
    incomingToolArgs,
    currentToolArgs,
    isManagedSection,
    shouldPreserveStreaming,
  );
  if (
    shouldSkipStreamingChatMerge(
      {
        incomingInputText,
        incomingToolArgs,
        incomingWaitingForResponse: incomingChat.waitingForResponse,
      },
      {
        nextInputText,
        nextToolCallArguments,
        nextWaitingForResponse,
      },
    )
  ) {
    return null;
  }
  return {
    toolCallArguments: nextToolCallArguments,
    inputText: nextInputText,
    waitingForResponse: nextWaitingForResponse,
  };
}

export function getStreamingChatInputText(
  incomingInputText: string,
  currentInputText: string,
  isManagedSection: boolean,
): string {
  if (isManagedSection || currentInputText.length > incomingInputText.length) {
    return currentInputText;
  }
  return incomingInputText;
}

export function getStreamingChatWaitingForResponse(
  incomingWaitingForResponse: boolean,
  currentWaitingForResponse: boolean,
  isManagedSection: boolean,
  shouldPreserveStreaming: boolean,
): boolean {
  if (isManagedSection && shouldPreserveStreaming) {
    return incomingWaitingForResponse || currentWaitingForResponse;
  }
  return incomingWaitingForResponse;
}

export function getStreamingChatToolCallArguments(
  incomingToolArgs: Record<string, string>,
  currentToolArgs: Record<string, string>,
  isManagedSection: boolean,
  shouldPreserveStreaming: boolean,
): Record<string, string> {
  if (!isManagedSection || !shouldPreserveStreaming) {
    return incomingToolArgs;
  }
  return resolveHydratedToolCallArguments({
    backendToolCallArguments: incomingToolArgs,
    localToolCallArguments: currentToolArgs,
    preserveLocalOverlay: true,
  });
}

export function shouldSkipStreamingChatMerge(
  incomingState: {
    incomingInputText: string;
    incomingToolArgs: Record<string, string>;
    incomingWaitingForResponse: boolean;
  },
  nextState: {
    nextInputText: string;
    nextToolCallArguments: Record<string, string>;
    nextWaitingForResponse: boolean;
  },
): boolean {
  return (
    nextState.nextInputText === incomingState.incomingInputText &&
    nextState.nextWaitingForResponse ===
      incomingState.incomingWaitingForResponse &&
    _.isEqual(nextState.nextToolCallArguments, incomingState.incomingToolArgs)
  );
}

export function mergeStreamingChatSections(
  projectState: SingleConfig,
  currentState: ZustandProjectState,
): string[] {
  const mergedSectionIds: string[] = [];
  for (const sectionId of Object.keys(
    projectState.projectConfig.sectionVariantMap,
  )) {
    const incomingSection = resolveChatSectionForMerge(projectState, sectionId);
    const currentSection = resolveChatSectionForMerge(currentState, sectionId);
    if (!incomingSection || !currentSection) {
      continue;
    }
    const isManagedSection =
      isManagedChatSection(projectState, sectionId) ||
      isManagedChatSection(currentState, sectionId);
    const shouldPreserveStreaming = isSectionStreamActive(sectionId);
    const nextPatch = getStreamingChatMergePatch(
      incomingSection.effective,
      currentSection.effective,
      isManagedSection,
      shouldPreserveStreaming,
    );
    if (!nextPatch) {
      continue;
    }
    setEffectiveImplValue<"ChatSection">(
      incomingSection.impl,
      incomingSection.core,
      incomingSection.variant,
      nextPatch,
    );
    mergedSectionIds.push(sectionId);
  }
  return mergedSectionIds;
}

export function isBaseCodeSectionType(sectionType: SectionType): boolean {
  return (
    sectionType === SectionTypeEnum.Code ||
    sectionType === SectionTypeEnum.GenPythonCode ||
    sectionType === SectionTypeEnum.GenPythonMetadata
  );
}

export type BaseCodeSectionImpl = Extract<
  BaseSectionImplUnion,
  {
    attachedTerminalSectionId?: string | null;
  }
>;

export type TerminalSectionImpl = Extract<
  BaseSectionImplUnion,
  {
    type: SectionTypeEnum.Terminal;
  }
>;

export type EmbeddedAttachedTerminalInfo = {
  attachedTerminalId: string;
  isTerminalMinimized: boolean;
};

export type CodeSectionAttachment = {
  attachedTerminalId: string;
  codeImpl: BaseCodeSectionImpl;
};

export function isBaseCodeSectionImpl(
  impl: BaseSectionImplUnion,
): impl is BaseCodeSectionImpl {
  return isBaseCodeSectionType(impl.type);
}

export function getTerminalSectionImplIfPresent(
  state: SingleConfig,
  terminalSectionId: string,
): TerminalSectionImpl | null {
  const terminalImpl = getEffectiveSectionImplIfPresent(
    state,
    terminalSectionId,
  );
  if (!terminalImpl || terminalImpl.type !== SectionTypeEnum.Terminal) {
    return null;
  }
  return terminalImpl;
}

export function getCodeSectionAttachmentIfPresent(
  state: ZustandProjectState,
  sectionId: string,
): CodeSectionAttachment | null {
  const impl = getEffectiveSectionImplIfPresent(state, sectionId);
  if (!impl || !isBaseCodeSectionImpl(impl)) {
    return null;
  }
  const attachedTerminalId = impl.attachedTerminalSectionId ?? null;
  if (!attachedTerminalId || !(attachedTerminalId in state.sections)) {
    return null;
  }
  return {
    attachedTerminalId,
    codeImpl: impl,
  };
}

export function isEmbeddedAttachedTerminalChild(
  childIds: string[],
  attachedTerminalId: string,
): boolean {
  const firstChildId = childIds[0] ?? attachedTerminalId;
  return firstChildId === attachedTerminalId && childIds.length < 2;
}

export function getAttachedTerminalChildIds(
  impl: BaseSectionImplUnion,
  attachedTerminalId: string,
  childIdsOverride?: string[],
): string[] {
  if (childIdsOverride) {
    return childIdsOverride;
  }
  return isBaseParentSectionImpl(impl) ? impl.children : [attachedTerminalId];
}

export function getAttachedTerminalParentIdForTerminalSection(
  state: ZustandProjectState,
  terminalSectionId: string,
): string | null {
  if (!getTerminalSectionImplIfPresent(state, terminalSectionId)) {
    return null;
  }
  const parentId = state.parentSectionMap[terminalSectionId] ?? null;
  if (!parentId) {
    return null;
  }
  const parentAttachment = getCodeSectionAttachmentIfPresent(state, parentId);
  if (
    !parentAttachment ||
    parentAttachment.attachedTerminalId !== terminalSectionId
  ) {
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
  if (
    !isEmbeddedAttachedTerminalChild(parentImpl.children, terminalSectionId)
  ) {
    return null;
  }
  return parentId;
}

export function getEmbeddedAttachedTerminalForCodeSection(
  state: ZustandProjectState,
  sectionId: string,
  childIdsOverride?: string[],
): EmbeddedAttachedTerminalInfo | null {
  const attachment = getCodeSectionAttachmentIfPresent(state, sectionId);
  if (!attachment) {
    return null;
  }
  const parentId = getAttachedTerminalParentIdForTerminalSection(
    state,
    attachment.attachedTerminalId,
  );
  if (parentId !== sectionId) {
    return null;
  }
  const childIds = getAttachedTerminalChildIds(
    attachment.codeImpl,
    attachment.attachedTerminalId,
    childIdsOverride,
  );
  if (
    !isEmbeddedAttachedTerminalChild(childIds, attachment.attachedTerminalId)
  ) {
    return null;
  }
  const terminalImpl = getTerminalSectionImplIfPresent(
    state,
    attachment.attachedTerminalId,
  );
  if (!terminalImpl) {
    return null;
  }
  return {
    attachedTerminalId: attachment.attachedTerminalId,
    isTerminalMinimized: terminalImpl.isMinimized,
  };
}

export function getTopLevelSectionIdsForDisplay(
  projectState: ZustandProjectState,
): string[] {
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  return Object.keys(topLevelSections).filter((sectionId) => {
    // Only true top-level sections should be rendered as React Flow nodes. If a
    // section has a parent, it will be rendered via the nested section tree.
    const parentId = projectState.parentSectionMap[sectionId] ?? null;
    if (parentId !== null) {
      return false;
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    return sectionImpl !== null;
  });
}

export function getEffectiveCodeObjImplIfPresent(
  projectState: ZustandProjectState,
  sectionImpl: BaseSectionImplUnion,
  codeObjId: string,
): BaseCodeObjImplUnion | null {
  const variantId = getSectionCodeObjVariantId(sectionImpl, codeObjId);
  if (!variantId) {
    return null;
  }
  return getEffectiveCodeObjImplForVariantId(
    projectState,
    variantId,
    codeObjId,
  );
}

export function getEffectiveCodeObjImplForVariantId(
  projectState: Pick<
    ZustandProjectState,
    "codeObjImpls" | "codeObjVariants" | "codeObjs"
  >,
  variantId: string,
  codeObjId: string,
): BaseCodeObjImplUnion | null {
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
  return getCurrentSectionVariantId(p, sectionId, preview);
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
  return getCurrentEffectiveSectionImpl(p, sectionId, preview);
}

export function getCurrEffectiveSectionImplIfPresent(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
): BaseSectionImplUnion | null {
  return getCurrentEffectiveSectionImplIfPresent(p, sectionId, preview);
}

export function getCurrEffectiveSectionImplWithTypeGuard<T>(
  p: ZustandProjectState,
  sectionId: string,
  typeGuard: (impl) => impl is T,
  preview = false,
): T {
  const effective = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    p,
    sectionId,
    typeGuard,
    preview,
  );
  if (!effective) {
    throw new Error(`Missing section implementation for section ${sectionId}`);
  }
  return effective;
}

export function getCurrEffectiveSectionImplWithTypeGuardIfPresent<T>(
  p: ZustandProjectState,
  sectionId: string,
  typeGuard: (impl) => impl is T,
  preview = false,
): T | null {
  const effective = getCurrEffectiveSectionImplIfPresent(p, sectionId, preview);
  if (!effective) {
    return null;
  }
  if (!typeGuard(effective)) {
    return null;
  }
  return effective;
}

export function isIFrameSectionImpl(
  impl: BaseSectionImplUnion,
): impl is IFrameSectionImpl {
  return impl.type === SectionTypeEnum.IFrame && "code" in impl;
}

export function getCurrIFrameSectionImpl(
  p: ZustandProjectState,
  sectionId: string,
  preview = false,
): IFrameSectionImpl {
  return getCurrEffectiveSectionImplWithTypeGuard(
    p,
    sectionId,
    isIFrameSectionImpl,
    preview,
  );
}

export function getCurrEffectiveSectionImplOfType<T extends SectionType>(
  p: ZustandProjectState,
  sectionId: string,
  expectedType: T,
  preview = false,
): Extract<
  BaseSectionImplUnion,
  {
    type: T;
  }
> {
  const impl = getCurrEffectiveSectionImpl(p, sectionId, preview);
  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }
  return impl as Extract<
    BaseSectionImplUnion,
    {
      type: T;
    }
  >;
}

export function isManagedChatSection(
  state: ManagedChatSectionAuthorityState,
  sectionId: string,
): boolean {
  const snapshot = getSectionAuthoritySnapshotIfPresent(state, sectionId);
  if (!snapshot) {
    return false;
  }
  if (
    getEffectiveSectionOverrideValue(snapshot, "type") !== SectionTypeEnum.Chat
  ) {
    return false;
  }
  return Boolean(getEffectiveSectionOverrideValue(snapshot, "managed"));
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
  const variant = getCurrCodeObjVariantIfPresent(
    p,
    sectionId,
    codeObjId,
    preview,
  );
  if (!variant) {
    throw new Error();
  }
  return variant;
}

export function getCurrCodeObjVariantIfPresent(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const sectionImpl = getCurrEffectiveSectionImpl(p, sectionId, preview);
  const variantId = getSectionCodeObjVariantId(sectionImpl, codeObjId);
  return variantId ? p.codeObjVariants[variantId] ?? null : null;
}

export function getCurrEffectiveCodeObjImpl(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  const impl = getCurrEffectiveCodeObjImplIfPresent(
    p,
    sectionId,
    codeObjId,
    preview,
  );
  if (!impl) {
    throw new Error();
  }
  return impl;
}

export function getCurrEffectiveCodeObjImplIfPresent(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  preview = false,
) {
  return getCurrentEffectiveCodeObjImplIfPresent(
    p,
    sectionId,
    codeObjId,
    preview,
  );
}

export function getCurrEffectiveCodeObjImplWithTypeGuardIfPresent<T>(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  typeGuard: (impl) => impl is T,
  preview = false,
): T | null {
  const effective = getCurrEffectiveCodeObjImplIfPresent(
    p,
    sectionId,
    codeObjId,
    preview,
  );
  if (!effective) {
    return null;
  }
  if (!typeGuard(effective)) {
    return null;
  }
  return effective;
}

export function getCurrEffectiveCodeObjImplOfType<T extends CodeObjType>(
  p: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  expectedType: T,
): Extract<
  BaseCodeObjImplUnion,
  {
    type: T;
  }
> {
  const impl = getCurrEffectiveCodeObjImpl(p, sectionId, codeObjId);
  if (impl.type !== expectedType) {
    throw new Error(
      `Expected section type ${expectedType}, got ${impl.type} for section ${sectionId}`,
    );
  }
  return impl as Extract<
    BaseCodeObjImplUnion,
    {
      type: T;
    }
  >;
}

export function resolveGeneratedImplUpdateValue<T>(
  value: GeneratedImplUpdateValue<T>,
  prev: T,
): T {
  if (typeof value === "function") {
    return (value as (prev: T) => T)(prev);
  }
  return value;
}

export function generatedImplFieldUsesDefaultUnsharedOwnership(
  fieldName: string,
): boolean {
  return DEFAULT_UNSHARED_PROJECT_FIELDS.has(fieldName);
}

export function setEffectiveImplValue<T extends MutableGeneratedImpl>(
  impl: T,
  core: Core,
  variant: Variant,
  args: ImplUpdateArgs<T>,
): T {
  const curr = getEffectiveImpl(impl, core, variant);
  for (const [k, v] of Object.entries(args) as Array<
    [keyof T, GeneratedImplUpdateValue<T[keyof T]>]
  >) {
    const currV = curr[k];
    const nextValue = resolveGeneratedImplUpdateValue(v, currV);
    const key = k as string;
    const isUnsharedField =
      core.unsharedKeys.includes(key) ||
      generatedImplFieldUsesDefaultUnsharedOwnership(key);
    if (!isUnsharedField) {
      core.sharedModifier[key] = nextValue;
    } else if (!impl.isPreset) {
      delete core.sharedModifier[key];
      (impl as Record<string, unknown>)[key] = nextValue;
    } else {
      delete core.sharedModifier[key];
      variant.modifier[key] = nextValue;
    }
  }
  clearEffectiveImplCache(impl);
  return getEffectiveImpl(impl, core, variant);
}

export function setCurrEffectiveSectionImplValue<
  T extends BaseSectionImplUnion,
>(state: ZustandProjectState, sectionId: string, args: ImplUpdateArgs<T>): T {
  const variant = getCurrSectionVariant(state, sectionId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue(impl as T, core, variant, args);
}

export function setSectionVariantImplValue<T extends BaseSectionImplUnion>(
  state: ZustandProjectState,
  sectionId: string,
  variantId: string,
  args: ImplUpdateArgs<T>,
): T {
  const variant = getSectionVariant(state, variantId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue(impl as T, core, variant, args);
}

export function setCurrEffectiveCodeObjImplValue<
  T extends BaseCodeObjImplUnion,
>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  args: ImplUpdateArgs<T>,
): T {
  const variant = getCurrCodeObjVariant(state, sectionId, codeObjId);
  const impl = getCodeObjImpl(state, variant.impl);
  const core = getCodeObjCore(state, codeObjId);
  return setEffectiveImplValue(impl as T, core, variant, args);
}

export function setCodeObjVariantImplValue<T extends BaseCodeObjImplUnion>(
  state: ZustandProjectState,
  codeObjId: string,
  codeObjVariantId: string,
  args: ImplUpdateArgs<T>,
): T {
  const variant = getCodeObjVariant(state, codeObjVariantId);
  const impl = getCodeObjImpl(state, variant.impl);
  const core = getCodeObjCore(state, codeObjId);
  return setEffectiveImplValue(impl as T, core, variant, args);
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
  const displayName = getParamDisplayNameIfPresent(state, sectionId, codeObjId);
  if (displayName === null) {
    throw new Error(
      `Missing param display name for section ${sectionId}, codeObj ${codeObjId}`,
    );
  }
  return displayName;
}

export function getParamDisplayNameIfPresent(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
): string | null {
  return getSharedParamDisplayNameIfPresent(state, sectionId, codeObjId);
}

export function getCodeObjImpl(p: ZustandProjectState, implId: string) {
  const impl = p.codeObjImpls[implId];
  if (!impl) {
    throw new Error();
  }
  return impl;
}
