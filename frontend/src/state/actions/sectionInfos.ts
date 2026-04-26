import type { ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";
import {
  callOpenAPI,
  clearEffectiveImplCache,
  createNewId,
  getCurrentEffectiveCodeObjImplIfPresent,
  getCurrentEffectiveSectionImpl,
  getCurrentEffectiveSectionImplIfPresent,
  getCurrentSectionVariantId,
  getEffectiveImpl,
  getSectionCodeObjVariantId,
  getParamDisplayNameIfPresent as getSharedParamDisplayNameIfPresent,
  res200,
} from "@setta/app-subsystem-frontend-sdk";
import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Node } from "gpuFlow/flowTypes";
import _ from "lodash";
import {
  deleteSections,
  groupSections,
  setTopLevelSectionLayout,
  setViewport,
  toggleParamSelected as toggleParamSelectedRequest,
  ungroupGroups,
  unselectAllParams as unselectAllParamsRequest,
  type GetLatestProjectStateResponse,
} from "openapi/http";
import { unstable_batchedUpdates } from "react-dom";
import {
  markRenameBroadcastsReady,
  maybeOpenNextRenamePrompt,
} from "state/actions/renameRefactors";
import {
  getActiveSectionUIIds,
  getReconciledActiveSectionUIStateFromBackend,
  sanitizeProjectStateActiveIds,
  useActiveSectionUI,
} from "state/activeSectionUI";
import { isSectionStreamActive } from "state/aiStreamingTracker";
import {
  NULL_PROJECT_CONFIG_ID,
  PendingOperation,
  runWithAtomicallyPublishedProjectStores,
  useAllProjectMetadata,
  useLocalStorage,
  useMisc,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  useShareSession,
  useToolArgumentPreview,
  ZustandNodeInternalsState,
  ZustandProjectState,
  type ToolArgumentPreviewProjectState,
} from "state/definitions";
import {
  AllProjectMetadata,
  BaseCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjType,
  Core,
  IFrameSectionImpl,
  isBaseChildlessCodeObjImpl,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ListRootViewModeEnum,
  SectionType,
  SectionTypeEnum,
  SingleConfig,
  Variant,
  Viewport,
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { applyActiveSectionChange } from "./activeSectionController";
import { resolveHydratedToolCallArguments } from "./chatHydrationOverlays";
import { recordAuthoritativeProjectChatWindowingState } from "./projectChatWindowingAuthoritative";
import { reconcileProjectChatWindowingEphemeralState } from "./projectChatWindowingEphemeral";
// Keep this in sync with internal/projectstate/unshared_defaults.go so optimistic
// frontend writes follow the same ownership routing as the Go owner.
const DEFAULT_UNSHARED_PROJECT_FIELDS = new Set([
  "callable",
  "codeObjVariantMap",
  "edgeInputParams",
  "edgeOutputPorts",
  "layers",
  "topLevelParamId",
  "value",
]);
type GeneratedImplUpdateValue<T> = T | ((prev: T) => T);
type ImplUpdateArgs<T extends object> = {
  [K in keyof T]?: GeneratedImplUpdateValue<T[K]>;
};
type MutableGeneratedImpl = BaseSectionImplUnion | BaseCodeObjImplUnion;
function getEffectiveSectionImplIfPresent(
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
type ChatSectionImpl = Extract<
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
type SectionAuthoritySnapshot = {
  variant: Variant;
  impl: BaseSectionImplUnion;
  core: Core;
};
type ResolvedChatSection = {
  variant: Variant;
  impl: ChatSectionImpl;
  core: Core;
  effective: ChatSectionImpl;
};
function getSectionAuthoritySnapshotIfPresent(
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
function getEffectiveSectionOverrideValue(
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
function resolveChatSectionForMerge(
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
function getStreamingChatMergePatch(
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
function getStreamingChatInputText(
  incomingInputText: string,
  currentInputText: string,
  isManagedSection: boolean,
): string {
  if (isManagedSection || currentInputText.length > incomingInputText.length) {
    return currentInputText;
  }
  return incomingInputText;
}
function getStreamingChatWaitingForResponse(
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
function getStreamingChatToolCallArguments(
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
function shouldSkipStreamingChatMerge(
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
function mergeStreamingChatSections(
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
type BaseCodeSectionImpl = Extract<
  BaseSectionImplUnion,
  {
    attachedTerminalSectionId?: string | null;
  }
>;
type TerminalSectionImpl = Extract<
  BaseSectionImplUnion,
  {
    type: SectionTypeEnum.Terminal;
  }
>;
type EmbeddedAttachedTerminalInfo = {
  attachedTerminalId: string;
  isTerminalMinimized: boolean;
};
type CodeSectionAttachment = {
  attachedTerminalId: string;
  codeImpl: BaseCodeSectionImpl;
};
function isBaseCodeSectionImpl(
  impl: BaseSectionImplUnion,
): impl is BaseCodeSectionImpl {
  return isBaseCodeSectionType(impl.type);
}
function getTerminalSectionImplIfPresent(
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
function getCodeSectionAttachmentIfPresent(
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
function isEmbeddedAttachedTerminalChild(
  childIds: string[],
  attachedTerminalId: string,
): boolean {
  const firstChildId = childIds[0] ?? attachedTerminalId;
  return firstChildId === attachedTerminalId && childIds.length < 2;
}
function getAttachedTerminalChildIds(
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
function getEffectiveCodeObjImplIfPresent(
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
function getEffectiveCodeObjImplForVariantId(
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
function isIFrameSectionImpl(
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
function getCurrCodeObjVariant(
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
function resolveGeneratedImplUpdateValue<T>(
  value: GeneratedImplUpdateValue<T>,
  prev: T,
): T {
  if (typeof value === "function") {
    return (value as (prev: T) => T)(prev);
  }
  return value;
}
function generatedImplFieldUsesDefaultUnsharedOwnership(
  fieldName: string,
): boolean {
  return DEFAULT_UNSHARED_PROJECT_FIELDS.has(fieldName);
}
function setEffectiveImplValue<T extends MutableGeneratedImpl>(
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
function getSectionImpl(p: ZustandProjectState, implId: string) {
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
function getCodeObjVariant(p: ZustandProjectState, variantId: string) {
  const variant = p.codeObjVariants[variantId];
  if (!variant) {
    throw new Error();
  }
  return variant;
}
export function getCurrShownParamIds(
  p: ZustandProjectState,
  sectionId: string,
  isPinned: boolean,
  preview = false,
) {
  const variantId = getCurrSectionVariantId(p, sectionId, preview);
  const shown = p.shownParamIds[variantId];
  if (!shown) {
    throw new Error();
  }
  return isPinned ? shown.pinned : shown.unpinned;
}
export function updateShownParamIdsForPinnedParams(
  state: ZustandProjectState,
  sectionId: string,
  nextPinnedParams: Array<string>,
  preview = true,
) {
  const variantId = getCurrSectionVariantId(state, sectionId, preview);
  const shown = state.shownParamIds[variantId];
  if (!shown) {
    return;
  }
  const nextPinnedSet = new Set(nextPinnedParams);
  const nextPinnedTopLevel = partitionParamIdsByPinnedState(
    shown.pinned.topLevelParamIds,
    nextPinnedSet,
  );
  const nextUnpinnedTopLevel = partitionParamIdsByPinnedState(
    shown.unpinned.topLevelParamIds,
    nextPinnedSet,
  );
  const nextPinnedRequired = partitionParamPathsByPinnedState(
    shown.pinned.requiredParamIdsToPaths,
    nextPinnedSet,
  );
  const nextUnpinnedRequired = partitionParamPathsByPinnedState(
    shown.unpinned.requiredParamIdsToPaths,
    nextPinnedSet,
  );
  state.shownParamIds[variantId] = {
    pinned: {
      ...shown.pinned,
      topLevelParamIds: [
        ...nextPinnedTopLevel.pinned,
        ...nextUnpinnedTopLevel.pinned,
      ],
      requiredParamIdsToPaths: {
        ...nextPinnedRequired.pinned,
        ...nextUnpinnedRequired.pinned,
      },
    },
    unpinned: {
      ...shown.unpinned,
      topLevelParamIds: [
        ...nextPinnedTopLevel.unpinned,
        ...nextUnpinnedTopLevel.unpinned,
      ],
      requiredParamIdsToPaths: {
        ...nextPinnedRequired.unpinned,
        ...nextUnpinnedRequired.unpinned,
      },
    },
  };
}
function partitionParamIdsByPinnedState(
  paramIds: string[],
  nextPinnedSet: Set<string>,
): {
  pinned: string[];
  unpinned: string[];
} {
  const partitioned = {
    pinned: [] as string[],
    unpinned: [] as string[],
  };
  for (const paramId of paramIds) {
    const key = nextPinnedSet.has(paramId) ? "pinned" : "unpinned";
    partitioned[key].push(paramId);
  }
  return partitioned;
}
function partitionParamPathsByPinnedState(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  nextPinnedSet: Set<string>,
): {
  pinned: Record<string, Array<string>>;
  unpinned: Record<string, Array<string>>;
} {
  const partitioned = {
    pinned: {} as Record<string, Array<string>>,
    unpinned: {} as Record<string, Array<string>>,
  };
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    const key = nextPinnedSet.has(paramId) ? "pinned" : "unpinned";
    partitioned[key][paramId] = path;
  }
  return partitioned;
}
export function getSectionInfo(sectionId) {
  return useProjectState.getState().sections[sectionId];
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
export function getHighestAncestor(
  sectionId: string,
  parentIdGetter: (id: string) => string | null = (id) =>
    useProjectState.getState().parentSectionMap[id] ?? null,
) {
  let parentId = parentIdGetter(sectionId);
  let highestAncestor = sectionId;
  while (parentId) {
    highestAncestor = parentId;
    parentId = parentIdGetter(parentId);
  }
  return highestAncestor;
}
export function getSectionDescendants(
  sectionId: string,
  state: ZustandProjectState,
) {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    if (currId) {
      const impl = getCurrEffectiveSectionImpl(state, currId);
      if (isBaseParentSectionImpl(impl)) {
        ids.push(...impl.children);
      }
    }
    idx += 1;
  }
  return ids;
}
export function getSectionImplChildren(
  sectionImpl: BaseSectionImplUnion,
): Array<string> {
  if (!isBaseParentSectionImpl(sectionImpl)) {
    return [];
  }
  return [...sectionImpl.children];
}
export function manualDndChildrenReset() {
  updateDndChildren(
    getDisplayedSectionIdToChildren(useProjectState.getState()),
  );
}
function getComparableProjectState(
  state: SingleConfig | ZustandProjectState,
): SingleConfig {
  return sanitizeProjectStateActiveIds({
    sections: state.sections,
    sectionImpls: state.sectionImpls,
    sectionVariants: state.sectionVariants,
    codeObjs: state.codeObjs,
    codeObjImpls: state.codeObjImpls,
    codeObjVariants: state.codeObjVariants,
    artifactGroups: state.artifactGroups,
    pluginData: state.pluginData,
    projectConfig: state.projectConfig,
    singletonSections: state.singletonSections,
    parentSectionMap: state.parentSectionMap,
    shownParamIds: state.shownParamIds,
    requiredDecodedImages: state.requiredDecodedImages,
    genCodeBinding: state.genCodeBinding ?? null,
    projectChatWindowing: state.projectChatWindowing,
  });
}
function pruneProjectChatWindowingForExistingSections(
  projectState: SingleConfig,
): SingleConfig {
  const existingSectionIds = new Set(Object.keys(projectState.sections));
  let changed = false;
  const nextInstancesById = Object.fromEntries(
    Object.entries(projectState.projectChatWindowing.instancesById).filter(
      ([, instance]) => {
        const sectionId = instance.sectionIdOrNull;
        if (!sectionId || existingSectionIds.has(sectionId)) {
          return true;
        }
        changed = true;
        return false;
      },
    ),
  );
  if (!changed) {
    return projectState;
  }
  const nextOrder = projectState.projectChatWindowing.order.filter(
    (instanceId) => instanceId in nextInstancesById,
  );
  return {
    ...projectState,
    projectChatWindowing: {
      ...projectState.projectChatWindowing,
      instancesById: nextInstancesById,
      order: nextOrder,
    },
  };
}
export function processProjectStateUpdateFromBackend(
  x: GetLatestProjectStateResponse,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (x.projectState.projectConfig.id !== projectConfigId) {
    return;
  }
  const currentState = useProjectState.getState();
  mergeStreamingChatSections(x.projectState, currentState);
  x.projectState = pruneProjectChatWindowingForExistingSections(x.projectState);
  recordAuthoritativeProjectChatWindowingState(
    x.projectState.projectConfig.id,
    x.projectState.projectChatWindowing,
  );
  const backendPendingIds = new Set(x.pendingOpIds);
  const completedIds = new Set(x.completedOpIds);
  const currentPending = usePendingOperations.getState().pending;
  const nextPending = currentPending.reduce<PendingOperation[]>(
    (acc, opInfo) => {
      if (completedIds.has(opInfo.opId)) {
        return acc;
      }
      const isBackendPending = backendPendingIds.has(opInfo.opId);
      const acknowledged = opInfo.acknowledged || isBackendPending;
      acc.push({
        ...opInfo,
        acknowledged,
      });
      return acc;
    },
    [],
  );
  reconcilePendingViewport(nextPending);
  reconcilePendingTopLevelLayout(nextPending);
  for (const opInfo of nextPending) {
    opInfo.apply(x.projectState);
  }
  const nextActiveSectionUIState = getReconciledActiveSectionUIStateFromBackend(
    x.projectState.projectConfig.activeIds,
    x.completedOpIds,
    x.projectState.projectConfig.id,
    Object.keys(x.projectState.sections),
  );
  const sanitizedProjectState = getComparableProjectState(x.projectState);
  const projectStateChanged = !_.isEqual(
    getComparableProjectState(currentState),
    sanitizedProjectState,
  );
  if (!projectStateChanged) {
    unstable_batchedUpdates(() => {
      usePendingOperations.setState({ pending: nextPending });
      if (nextActiveSectionUIState !== null) {
        useActiveSectionUI.setState(nextActiveSectionUIState);
      }
    });
    markRenameBroadcastsReady(completedIds);
    maybeOpenNextRenamePrompt();
    clearToolArgumentPreviewForProjectState(projectConfigId, currentState);
    return;
  }
  const shouldRequestFitView = applyViewportFromProjectState(x.projectState);
  const nextNodesMap = createNodesMapFromProjectConfigChildren(
    x.projectState,
    useNodeInternals.getState().x,
  );
  reconcileProjectChatWindowingEphemeralState(
    sanitizedProjectState.projectChatWindowing,
    sanitizedProjectState.projectConfig.id,
  );
  runWithAtomicallyPublishedProjectStores(
    {
      projectState: sanitizedProjectState,
      nodeInternals: { x: nextNodesMap },
      activeSectionUI: nextActiveSectionUIState,
    },
    () => {
      unstable_batchedUpdates(() => {
        usePendingOperations.setState({ pending: nextPending });
        useNodeInternals.setState({ x: nextNodesMap });
        useProjectState.setState(() => sanitizedProjectState);
        if (nextActiveSectionUIState !== null) {
          useActiveSectionUI.setState(nextActiveSectionUIState);
        }
      });
    },
  );
  if (shouldRequestFitView) {
    useMisc.setState({ requestUpdateNodeDimensions: true });
  }
  markRenameBroadcastsReady(completedIds);
  maybeOpenNextRenamePrompt();
  clearToolArgumentPreviewForProjectState(
    projectConfigId,
    useProjectState.getState(),
  );
}
function applyViewportFromProjectState(projectState: SingleConfig): boolean {
  const { viewport, viewportInitialized } = projectState.projectConfig;
  const currentState = useProjectState.getState();
  const currentConfig = currentState.projectConfig;
  const viewModeChanged =
    currentConfig.activeViewModeId !==
    projectState.projectConfig.activeViewModeId;
  const viewportChanged =
    !_.isEqual(currentConfig.viewport, viewport) ||
    currentConfig.viewportInitialized !== viewportInitialized;
  const visibleTopLevelSectionIdsChanged = !_.isEqual(
    getVisibleTopLevelSectionIdsForAutoFit(currentState),
    getVisibleTopLevelSectionIdsForAutoFit(projectState),
  );
  if (
    !viewportChanged &&
    !viewModeChanged &&
    (!(!viewport || !viewportInitialized) || !visibleTopLevelSectionIdsChanged)
  ) {
    return false;
  }
  if (!viewport || !viewportInitialized) {
    useReactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: getFitViewOptionsForVisibleSections(projectState),
    });
    return true;
  }
  useReactFlow.setState({
    fitViewOnInit: false,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
    transform: [viewport.x, viewport.y, viewport.zoom],
  });
  return false;
}
function getVisibleTopLevelSectionIdsForAutoFit(
  projectState: SingleConfig,
): string[] {
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const orderedSectionIds = Object.keys(topLevelSections);
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (isEditingViewMode || !activeViewModeId) {
    return orderedSectionIds;
  }
  const activeViewMode = viewModes[activeViewModeId];
  if (!activeViewMode) {
    return orderedSectionIds;
  }
  return orderedSectionIds.filter(
    (sectionId) => activeViewMode.visibilityBySectionId[sectionId],
  );
}
function getFitViewOptionsForVisibleSections(projectState: SingleConfig) {
  const { activeViewModeId, isEditingViewMode, viewModes } =
    projectState.projectConfig;
  if (isEditingViewMode) {
    return undefined;
  }
  if (!activeViewModeId) {
    return undefined;
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    return undefined;
  }
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const visibleNodeIds = Object.keys(topLevelSections).filter(
    (sectionId) => viewMode.visibilityBySectionId[sectionId],
  );
  if (visibleNodeIds.length === 0) {
    return undefined;
  }
  return {
    nodes: visibleNodeIds.map((id) => ({ id }) as Node),
  };
}
function prunePreviewCodeEntries(
  previewState: ToolArgumentPreviewProjectState,
  projectState: ZustandProjectState,
) {
  for (const [sectionId, entry] of Object.entries(
    previewState.previewCodeBySectionId,
  )) {
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    if (
      !sectionImpl ||
      sectionImpl.type !== SectionTypeEnum.Code ||
      sectionImpl.code === entry.value
    ) {
      delete previewState.previewCodeBySectionId[sectionId];
    }
  }
}
function getCanonicalCallableName(
  projectState: ZustandProjectState,
  sectionImpl: Extract<BaseSectionImplUnion, { callable?: string | null }>,
): string | null {
  if (!sectionImpl.callable) {
    return "";
  }
  const codeObj = projectState.codeObjs[sectionImpl.callable];
  return codeObj ? codeObj.name : null;
}
function prunePreviewCallableNameEntries(
  previewState: ToolArgumentPreviewProjectState,
  projectState: ZustandProjectState,
) {
  for (const [sectionId, entry] of Object.entries(
    previewState.previewCallableNameBySectionId,
  )) {
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    if (!sectionImpl || !isBaseSectionWithParamsImpl(sectionImpl)) {
      delete previewState.previewCallableNameBySectionId[sectionId];
      continue;
    }
    const canonicalName = getCanonicalCallableName(projectState, sectionImpl);
    if (canonicalName === null || canonicalName === entry.value) {
      delete previewState.previewCallableNameBySectionId[sectionId];
    }
  }
}
function prunePreviewParamValueEntries(
  previewState: ToolArgumentPreviewProjectState,
  projectState: ZustandProjectState,
) {
  for (const [sectionId, paramEntries] of Object.entries(
    previewState.previewParamValueBySectionAndParamId,
  )) {
    const sectionImpl = getEffectiveSectionImplIfPresent(
      projectState,
      sectionId,
    );
    if (!sectionImpl || !isBaseSectionWithParamsImpl(sectionImpl)) {
      delete previewState.previewParamValueBySectionAndParamId[sectionId];
      continue;
    }
    for (const [paramInfoId, entry] of Object.entries(paramEntries)) {
      const impl = getEffectiveCodeObjImplIfPresent(
        projectState,
        sectionImpl,
        paramInfoId,
      );
      if (
        !impl ||
        !isBaseChildlessCodeObjImpl(impl) ||
        impl.value === entry.value
      ) {
        delete paramEntries[paramInfoId];
      }
    }
    if (Object.keys(paramEntries).length === 0) {
      delete previewState.previewParamValueBySectionAndParamId[sectionId];
    }
  }
}
function isToolArgumentPreviewEmpty(
  previewState: ToolArgumentPreviewProjectState,
): boolean {
  return (
    Object.keys(previewState.previewCodeBySectionId).length === 0 &&
    Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
    Object.keys(previewState.previewParamValueBySectionAndParamId).length === 0
  );
}
function clearToolArgumentPreviewForProjectState(
  projectConfigId: string,
  projectState: ZustandProjectState,
) {
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    prunePreviewCodeEntries(previewState, projectState);
    prunePreviewCallableNameEntries(previewState, projectState);
    prunePreviewParamValueEntries(previewState, projectState);
    if (isToolArgumentPreviewEmpty(previewState)) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}
type TopLevelSectionLayout =
  SingleConfig["projectConfig"]["topLevelSections"][string];
function shouldRenderTopLevelSectionNode(
  state: ZustandProjectState,
  sectionId: string,
  canFilterByView: boolean,
): boolean {
  if (!canFilterByView) {
    return true;
  }
  const visibilityInfo = getSectionViewModeVisibilityIfPresent(
    sectionId,
    state,
  );
  return visibilityInfo
    ? getSectionShouldRender(
        visibilityInfo.visibility,
        visibilityInfo.isEditingViewMode,
      )
    : false;
}
function getSectionNodeStyle(
  sectionImpl: BaseSectionImplUnion | null,
  darkMode: boolean,
) {
  const styleColor = sectionImpl?.styleColor;
  if (
    styleColor === null ||
    styleColor === undefined ||
    styleColor.trim() === ""
  ) {
    return undefined;
  }
  return { background: deriveSectionStyleTheme(styleColor, darkMode).bg };
}
function buildTopLevelSectionNode(
  sectionId: string,
  layout: TopLevelSectionLayout,
  existingNode: Node | undefined,
  sectionImpl: BaseSectionImplUnion | null,
  darkMode: boolean,
): Node {
  return {
    id: sectionId,
    position: { x: layout.x, y: layout.y },
    width: existingNode?.width ?? layout.w,
    height: existingNode?.height ?? layout.h,
    zIndex: layout.zIndex,
    tempZIndex: layout.zIndex,
    type: sectionImpl?.type,
    style: getSectionNodeStyle(sectionImpl, darkMode),
  };
}
export function createNodesMapFromProjectConfigChildren(
  p: ZustandProjectState,
  nodes: ZustandNodeInternalsState["x"],
) {
  const nodesMap: Map<string, Node> = new Map();
  const darkMode = useLocalStorage.getState().darkMode;
  const { activeViewModeId, viewModes } = p.projectConfig;
  const topLevelSections = getActiveViewModeTopLevelSections(p);
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(p);
  const canFilterByView = Boolean(
    activeViewModeId && viewModes[activeViewModeId],
  );
  for (const sectionId of topLevelSectionIds) {
    const layout = topLevelSections[sectionId];
    if (
      !layout ||
      !shouldRenderTopLevelSectionNode(p, sectionId, canFilterByView)
    ) {
      continue;
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(p, sectionId);
    nodesMap.set(
      sectionId,
      buildTopLevelSectionNode(
        sectionId,
        layout,
        nodes.get(sectionId),
        sectionImpl,
        darkMode,
      ),
    );
  }
  return nodesMap;
}
export function setSectionChildren(
  state: ZustandProjectState,
  sectionId: string,
  newStateFn: (currChildren: Array<string>) => Array<string>,
) {
  setCurrEffectiveSectionImplValue<"BaseParentSection">(state, sectionId, {
    children: newStateFn,
  });
}
function getDisplayedSectionIdToChildrenHelper(
  sectionId: string,
  sectionImpl: BaseSectionImplUnion | null,
  state: ZustandProjectState,
  output: Record<string, Array<string>>,
) {
  if (!sectionImpl) {
    return;
  }
  if (isBaseParentSectionImpl(sectionImpl)) {
    const displayedChildren: string[] = [];
    for (const childId of sectionImpl.children) {
      const childImpl = getEffectiveSectionImplIfPresent(state, childId);
      if (!childImpl) {
        continue;
      }
      displayedChildren.push(childId);
      getDisplayedSectionIdToChildrenHelper(childId, childImpl, state, output);
    }
    output[sectionId] = displayedChildren;
  } else {
    output[sectionId] = [];
  }
}
export function getDisplayedSectionIdToChildren(state: ZustandProjectState) {
  const output: Record<string, Array<string>> = {};
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(state);
  for (const sectionId of topLevelSectionIds) {
    const impl = getEffectiveSectionImplIfPresent(state, sectionId);
    getDisplayedSectionIdToChildrenHelper(sectionId, impl, state, output);
  }
  return output;
}
export function resetSectionsToDefaultVersions(sectionIds) {
  useProjectState.setState((x) => {
    for (const id of sectionIds) {
      const s = x.sections[id];
      s.variantId = s.defaultVariantId;
    }
  });
}
export function resetAllSectionsToDefaultVersions() {
  resetSectionsToDefaultVersions(
    Object.keys(useProjectState.getState().sections),
  );
}
export function getSectionShouldRender(
  visibility: boolean,
  isEditingViewMode: boolean,
) {
  return isEditingViewMode || visibility;
}
export function getActiveViewModeConfig(state: SingleConfig) {
  const { activeViewModeId, viewModes } = state.projectConfig;
  if (!activeViewModeId) {
    throw new Error("Active view mode is not set");
  }
  const viewMode = viewModes[activeViewModeId];
  if (!viewMode) {
    throw new Error(`Active view mode ${activeViewModeId} not found`);
  }
  return viewMode;
}
function getActiveViewModeTopLevelSections(projectState: SingleConfig) {
  const { activeViewModeId, topLevelSections, viewModes } =
    projectState.projectConfig;
  if (!activeViewModeId || !(activeViewModeId in viewModes)) {
    return topLevelSections;
  }
  const viewMode = viewModes[activeViewModeId];
  const viewModeLayout = viewMode.topLevelSections;
  if (!viewModeLayout || Object.keys(viewModeLayout).length === 0) {
    return topLevelSections;
  }
  if (!topLevelSections || Object.keys(topLevelSections).length === 0) {
    return viewModeLayout;
  }
  return { ...topLevelSections, ...viewModeLayout };
}
function getSectionVisibilityForActiveViewMode(
  sectionId: string,
  state: ZustandProjectState,
) {
  const viewMode = getActiveViewModeConfig(state);
  const visibility = viewMode.visibilityBySectionId[sectionId];
  if (visibility === undefined) {
    throw new Error(
      `Missing visibility for section ${sectionId} in view mode ${viewMode.id}`,
    );
  }
  return {
    visibility,
    viewMode,
  };
}
function getSectionViewModeVisibilityIfPresent(
  sectionId: string,
  state: ZustandProjectState,
): {
  visibility: boolean;
  isEditingViewMode: boolean;
} | null {
  const { isEditingViewMode } = state.projectConfig;
  const viewMode = getActiveViewModeConfig(state);
  const visibility = viewMode.visibilityBySectionId[sectionId];
  if (visibility === undefined) {
    return null;
  }
  return {
    visibility,
    isEditingViewMode,
  };
}
export function getSectionViewModeVisibility(
  sectionId: string,
  state: ZustandProjectState,
) {
  const { isEditingViewMode } = state.projectConfig;
  const { visibility } = getSectionVisibilityForActiveViewMode(
    sectionId,
    state,
  );
  return {
    visibility,
    isEditingViewMode,
  };
}
export function getAncestorSameVisibility(
  sectionId: string,
  state: ZustandProjectState,
) {
  const { visibilityBySectionId, id: viewModeId } =
    getActiveViewModeConfig(state);
  let impl = getCurrEffectiveSectionImpl(state, sectionId);
  let { parentId } = impl;
  const targetVisibility = visibilityBySectionId[sectionId];
  if (targetVisibility === undefined) {
    throw new Error(
      `Missing visibility for section ${sectionId} in view mode ${viewModeId}`,
    );
  }
  while (parentId) {
    impl = getCurrEffectiveSectionImpl(state, parentId);
    const parentVisibility = visibilityBySectionId[parentId];
    if (parentVisibility === undefined) {
      throw new Error(
        `Missing visibility for section ${parentId} in view mode ${viewModeId}`,
      );
    }
    if (parentVisibility === targetVisibility) {
      return true;
    }
    ({ parentId } = impl);
  }
  return false;
}
export function deleteAllActiveSections() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  callOpenAPI(
    deleteSections({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: getActiveSectionUIIds(),
      },
    } as Parameters<typeof deleteSections>[0]),
  );
}
export function createTopLevelSectionLayoutDict(
  sections: SingleConfig["sections"],
  nodeInternals: ZustandNodeInternalsState["x"],
  existingLayouts:
    | SingleConfig["projectConfig"]["topLevelSections"]
    | null = null,
) {
  const topLevelSections = copyExistingTopLevelSectionLayouts(
    sections,
    existingLayouts,
  );
  for (const c of nodeInternals.values()) {
    if (c.id in sections) {
      topLevelSections[c.id] = buildTopLevelSectionLayout(
        c,
        topLevelSections[c.id],
      );
    }
  }
  return topLevelSections;
}
type TopLevelSectionLayoutMap =
  SingleConfig["projectConfig"]["topLevelSections"];
function copyExistingTopLevelSectionLayouts(
  sections: SingleConfig["sections"],
  existingLayouts: TopLevelSectionLayoutMap | null,
): TopLevelSectionLayoutMap {
  const nextLayouts: TopLevelSectionLayoutMap = {};
  if (!existingLayouts) {
    return nextLayouts;
  }
  for (const [sectionId, layout] of Object.entries(existingLayouts)) {
    if (sectionId in sections) {
      nextLayouts[sectionId] = { ...layout };
    }
  }
  return nextLayouts;
}
function createDefaultTopLevelSectionLayout(node: Node): TopLevelSectionLayout {
  return {
    x: node.position.x,
    y: node.position.y,
    zIndex: 0,
    w: null,
    h: null,
  };
}
function buildTopLevelSectionLayout(
  node: Node,
  existingLayout?: TopLevelSectionLayout,
): TopLevelSectionLayout {
  const nextLayout = existingLayout
    ? { ...existingLayout }
    : createDefaultTopLevelSectionLayout(node);
  nextLayout.x = node.position.x;
  nextLayout.y = node.position.y;
  if (node.zIndex !== undefined) {
    nextLayout.zIndex = node.zIndex;
  }
  if (node.width !== undefined) {
    nextLayout.w = node.width;
  }
  if (node.height !== undefined) {
    nextLayout.h = node.height;
  }
  return nextLayout;
}
type PendingViewportState = Viewport | null;
const pendingViewportRef: {
  opId: string | null;
  snapshot: PendingViewportState;
  hasQueuedSend: boolean;
} = {
  opId: null,
  snapshot: null,
  hasQueuedSend: false,
};
function applyViewportSnapshotToProjectState(
  state: ZustandProjectState,
  viewport: PendingViewportState,
) {
  state.projectConfig.viewport = viewport;
  state.projectConfig.viewportInitialized = viewport !== null;
  const { activeViewModeId, viewModes } = state.projectConfig;
  if (!activeViewModeId) {
    return;
  }
  const activeViewMode = viewModes[activeViewModeId];
  if (!activeViewMode) {
    return;
  }
  activeViewMode.viewport = viewport;
  activeViewMode.viewportInitialized = viewport !== null;
}
function applyPendingViewport(state: ZustandProjectState) {
  applyViewportSnapshotToProjectState(state, pendingViewportRef.snapshot);
}
const pendingTopLevelLayoutRef: {
  opId: string | null;
  snapshot: TopLevelSectionLayoutMap | null;
  hasQueuedSend: boolean;
} = {
  opId: null,
  snapshot: null,
  hasQueuedSend: false,
};
function applyPendingTopLevelLayout(state: ZustandProjectState) {
  if (!pendingTopLevelLayoutRef.snapshot) {
    return;
  }
  const currentLayouts = state.projectConfig.topLevelSections;
  const { activeViewModeId, viewModes } = state.projectConfig;
  const viewModeLayouts =
    activeViewModeId && viewModes[activeViewModeId]
      ? viewModes[activeViewModeId].topLevelSections
      : null;
  for (const [sectionId, layout] of Object.entries(
    pendingTopLevelLayoutRef.snapshot,
  )) {
    if (!(sectionId in currentLayouts)) {
      continue;
    }
    currentLayouts[sectionId] = layout;
    if (viewModeLayouts) {
      viewModeLayouts[sectionId] = layout;
    }
  }
}
const sendTopLevelLayoutToBackend = _.debounce(() => {
  if (!pendingTopLevelLayoutRef.opId || !pendingTopLevelLayoutRef.snapshot) {
    return;
  }
  const opId = pendingTopLevelLayoutRef.opId;
  const snapshot = pendingTopLevelLayoutRef.snapshot;
  pendingTopLevelLayoutRef.hasQueuedSend = false;
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    removePendingOp(opId);
    if (pendingTopLevelLayoutRef.opId === opId) {
      pendingTopLevelLayoutRef.opId = null;
    }
    pendingTopLevelLayoutRef.snapshot = null;
    return;
  }
  const result = callOpenAPI(
    setTopLevelSectionLayout({
      body: {
        projectConfigId,
        topLevelSections: snapshot,
        frontendOpId: opId,
      },
    } as Parameters<typeof setTopLevelSectionLayout>[0]),
  );
  if (result instanceof Promise) {
    void result.then((res) => {
      if (isResponseDataAndStatus(res) && res200(res)) {
        acknowledgePendingOp(opId);
      } else if (isResponseDataAndStatus(res) && res.hasResponse) {
        removePendingOp(opId);
        if (pendingTopLevelLayoutRef.opId === opId) {
          pendingTopLevelLayoutRef.opId = null;
        }
      }
    });
  }
}, 500);
const sendViewportToBackend = _.debounce(() => {
  if (!pendingViewportRef.opId) {
    return;
  }
  const opId = pendingViewportRef.opId;
  const snapshot = pendingViewportRef.snapshot;
  pendingViewportRef.hasQueuedSend = false;
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    removePendingOp(opId);
    if (pendingViewportRef.opId === opId) {
      pendingViewportRef.opId = null;
    }
    pendingViewportRef.snapshot = null;
    return;
  }
  const result = callOpenAPI(
    setViewport({
      body: {
        projectConfigId,
        viewport: snapshot,
        frontendOpId: opId,
      },
    } as Parameters<typeof setViewport>[0]),
  );
  if (result instanceof Promise) {
    void result.then((res) => {
      if (isResponseDataAndStatus(res) && res200(res)) {
        acknowledgePendingOp(opId);
      } else if (isResponseDataAndStatus(res) && res.hasResponse) {
        removePendingOp(opId);
        if (pendingViewportRef.opId === opId) {
          pendingViewportRef.opId = null;
        }
      }
    });
  }
}, 1000);
function reconcilePendingTopLevelLayout(nextPending: PendingOperation[]) {
  const currentOpId = pendingTopLevelLayoutRef.opId;
  if (!currentOpId) {
    return;
  }
  const stillPending = nextPending.some((op) => op.opId === currentOpId);
  if (stillPending) {
    return;
  }
  if (
    pendingTopLevelLayoutRef.hasQueuedSend &&
    pendingTopLevelLayoutRef.snapshot
  ) {
    const opId = createNewId();
    pendingTopLevelLayoutRef.opId = opId;
    nextPending.push({
      opId,
      apply: applyPendingTopLevelLayout,
      acknowledged: false,
    });
    return;
  }
  pendingTopLevelLayoutRef.opId = null;
  pendingTopLevelLayoutRef.snapshot = null;
  pendingTopLevelLayoutRef.hasQueuedSend = false;
}
function reconcilePendingViewport(nextPending: PendingOperation[]) {
  const currentOpId = pendingViewportRef.opId;
  if (!currentOpId) {
    return;
  }
  const stillPending = nextPending.some((op) => op.opId === currentOpId);
  if (stillPending) {
    return;
  }
  if (pendingViewportRef.hasQueuedSend) {
    const opId = createNewId();
    pendingViewportRef.opId = opId;
    nextPending.push({
      opId,
      apply: applyPendingViewport,
      acknowledged: false,
    });
    return;
  }
  pendingViewportRef.opId = null;
  pendingViewportRef.snapshot = null;
  pendingViewportRef.hasQueuedSend = false;
}
export function debounced_route_set_top_level_section_layout() {
  const shareSession = useShareSession.getState();
  if (
    shareSession.isDeploymentMode &&
    shareSession.sharePolicy?.allowLayoutChanges === false
  ) {
    return;
  }
  if (getCurrProjectConfigId() === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const projectState = useProjectState.getState();
  const parentSectionMap = projectState.parentSectionMap;
  const existingLayoutsRaw = getActiveViewModeTopLevelSections(projectState);
  const existingLayouts = Object.fromEntries(
    Object.entries(existingLayoutsRaw).filter(([sectionId]) => {
      const parentId = parentSectionMap[sectionId] ?? null;
      return parentId === null;
    }),
  );
  const nodeInternalsRaw = useNodeInternals.getState().x;
  const nodeInternals: typeof nodeInternalsRaw = new Map(
    Array.from(nodeInternalsRaw.entries()).filter(([sectionId]) => {
      const parentId = parentSectionMap[sectionId] ?? null;
      return parentId === null;
    }),
  );
  const topLevelSections = createTopLevelSectionLayoutDict(
    projectState.sections,
    nodeInternals,
    existingLayouts,
  );
  clearCompletedPendingOpId(pendingTopLevelLayoutRef);
  pendingTopLevelLayoutRef.snapshot = topLevelSections;
  pendingTopLevelLayoutRef.hasQueuedSend = true;
  useProjectState.setState((state) => {
    state.projectConfig.topLevelSections = topLevelSections;
    const { activeViewModeId, viewModes } = state.projectConfig;
    if (activeViewModeId && viewModes[activeViewModeId]) {
      viewModes[activeViewModeId].topLevelSections = topLevelSections;
    }
  });
  if (!pendingTopLevelLayoutRef.opId) {
    pendingTopLevelLayoutRef.opId = addPendingOp(applyPendingTopLevelLayout);
  }
  sendTopLevelLayoutToBackend();
}
export function getCurrProjectConfigId() {
  return useProjectState.getState().projectConfig.id;
}
function getCurrProjectConfigViewport() {
  return useReactFlow.getState().fitViewOnInit ? null : getViewport();
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
export async function groupActiveSections() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  const sectionIds = getActiveSectionUIIds();
  callOpenAPI(
    groupSections({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionIds,
      },
    } as Parameters<typeof groupSections>[0]),
  );
  useReactFlow.setState({ nodesSelectionDims: null });
}
export async function ungroupActiveGroups() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  const groupIds = getActiveSectionUIIds();
  callOpenAPI(
    ungroupGroups({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        groupIds,
      },
    } as Parameters<typeof ungroupGroups>[0]),
  );
}
function addPendingOp(apply: (x: ZustandProjectState) => void) {
  const opId = createNewId();
  usePendingOperations.setState((state) => ({
    pending: [...state.pending, { apply, opId, acknowledged: false }],
  }));
  return opId;
}
function acknowledgePendingOp(opId: string) {
  // Mark as acknowledged so stale optimistic ops don't override later backend syncs.
  usePendingOperations.setState((state) => {
    const index = state.pending.findIndex((opInfo) => opInfo.opId === opId);
    if (index < 0 || state.pending[index].acknowledged) {
      return state;
    }
    const nextPending = [...state.pending];
    nextPending[index] = {
      ...nextPending[index],
      acknowledged: true,
    };
    return { pending: nextPending };
  });
}
function removePendingOp(opId: string) {
  usePendingOperations.setState((state) => ({
    pending: state.pending.filter((opInfo) => opInfo.opId !== opId),
  }));
}
function isPendingOpQueued(opId: string | null): boolean {
  return (
    opId !== null &&
    usePendingOperations
      .getState()
      .pending.some((opInfo) => opInfo.opId === opId)
  );
}
function clearCompletedPendingOpId(ref: { opId: string | null }) {
  if (ref.opId && !isPendingOpQueued(ref.opId)) {
    ref.opId = null;
  }
}
function removePendingOpAndGetReplayOps(opId: string): Array<PendingOperation> {
  const pendingBeforeRemoval = usePendingOperations.getState().pending;
  const failedOpIndex = pendingBeforeRemoval.findIndex(
    (opInfo) => opInfo.opId === opId,
  );
  removePendingOp(opId);
  if (failedOpIndex < 0) {
    return [];
  }
  const remainingOpIds = new Set(
    usePendingOperations.getState().pending.map((opInfo) => opInfo.opId),
  );
  return pendingBeforeRemoval
    .slice(failedOpIndex + 1)
    .filter((opInfo) => remainingOpIds.has(opInfo.opId));
}
function rollbackOptimisticProjectStateUpdate(
  opId: string,
  rollback?: (state: ZustandProjectState) => void,
) {
  const replayOps = removePendingOpAndGetReplayOps(opId);
  if (!rollback) {
    return;
  }
  useProjectState.setState((state) => {
    rollback(state);
    for (const opInfo of replayOps) {
      opInfo.apply(state);
    }
  });
}
function applyOptimisticProjectStateUpdateIfProjectMatches(
  state: ZustandProjectState,
  projectConfigId: string | undefined,
  update: (state: ZustandProjectState) => void,
) {
  if (
    projectConfigId !== undefined &&
    state.projectConfig.id !== projectConfigId
  ) {
    return;
  }
  update(state);
}
function isResponseDataAndStatus(
  value: unknown,
): value is ResponseDataAndStatus<unknown> {
  // Narrow unknown send results without relying on try/catch for control flow.
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "hasResponse" in value
  );
}
export function dispatchOptimisticProjectStateUpdate({
  apply,
  send,
  rollback,
  reapply,
  projectConfigId,
}: {
  apply: (state: ZustandProjectState) => void;
  send: (frontendOpId: string) => void | Promise<unknown>;
  rollback?: (state: ZustandProjectState) => void;
  reapply?: (state: ZustandProjectState) => void;
  projectConfigId?: string;
}) {
  const { opId, result } = dispatchOptimisticProjectStateUpdateWithResult({
    apply,
    send,
    rollback,
    reapply,
    projectConfigId,
  });
  void result.catch(() => {});
  return opId;
}
export function dispatchOptimisticProjectStateUpdateWithResult<T>({
  apply,
  send,
  rollback,
  reapply,
  projectConfigId,
}: {
  apply: (state: ZustandProjectState) => void;
  send: (frontendOpId: string) => T | Promise<T>;
  rollback?: (state: ZustandProjectState) => void;
  reapply?: (state: ZustandProjectState) => void;
  projectConfigId?: string;
}) {
  const applyWithProjectGuard = (state: ZustandProjectState) =>
    applyOptimisticProjectStateUpdateIfProjectMatches(
      state,
      projectConfigId,
      apply,
    );
  const reapplyWithProjectGuard = (state: ZustandProjectState) =>
    applyOptimisticProjectStateUpdateIfProjectMatches(
      state,
      projectConfigId,
      reapply ?? apply,
    );
  const rollbackWithProjectGuard =
    rollback === undefined
      ? undefined
      : (state: ZustandProjectState) =>
          applyOptimisticProjectStateUpdateIfProjectMatches(
            state,
            projectConfigId,
            rollback,
          );
  useProjectState.setState(applyWithProjectGuard);
  const opId = addPendingOp(reapplyWithProjectGuard);
  const result = Promise.resolve(send(opId))
    .then((res) => {
      // A 200 response means the backend accepted the op; don't keep reapplying it.
      if (isResponseDataAndStatus(res) && res200(res)) {
        if (
          projectConfigId !== undefined &&
          useProjectState.getState().projectConfig.id !== projectConfigId
        ) {
          removePendingOp(opId);
          return res;
        }
        acknowledgePendingOp(opId);
      } else if (isResponseDataAndStatus(res)) {
        rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
      }
      return res;
    })
    .catch((error) => {
      rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
      throw error;
    });
  return { opId, result };
}
export function toggleParamSelected(sectionId: string, paramInfoId: string) {
  const currentState = useProjectState.getState();
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    currentState,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const wasSelected = impl.selectedParams.includes(paramInfoId);
  const nextSelectedCount = wasSelected
    ? impl.selectedParams.length - 1
    : impl.selectedParams.length + 1;
  const hasSelectedParams = nextSelectedCount > 0;
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          selectedParams: (curr) => {
            if (curr?.includes(paramInfoId)) {
              return curr.filter((id) => id !== paramInfoId);
            }
            return [...(curr ?? []), paramInfoId];
          },
        },
      );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        toggleParamSelectedRequest({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            paramInfoId,
            frontendOpId,
          },
        } as Parameters<typeof toggleParamSelectedRequest>[0]),
      ),
  });
  applyActiveSectionChange({
    interaction: wasSelected ? "param-unselect" : "param-select",
    sectionId,
    hasSelectedParams,
  });
}
export function unselectAllParams() {
  const currentState = useProjectState.getState();
  const sectionIds = Object.keys(currentState.sections);
  const hasSelectedParams = sectionIds.some((sectionId) => {
    const impl = getCurrEffectiveSectionImpl(currentState, sectionId);
    return (
      isBaseSectionWithParamsImpl(impl) &&
      (impl.selectedParams?.length ?? 0) > 0
    );
  });
  if (!hasSelectedParams) {
    return false;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const sectionId of Object.keys(state.sections)) {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (
          isBaseSectionWithParamsImpl(impl) &&
          impl.selectedParams.length > 0
        ) {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            { selectedParams: [] },
          );
        }
      }
    },
    send: (frontendOpId) =>
      callOpenAPI(
        unselectAllParamsRequest({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            frontendOpId,
          },
        } as Parameters<typeof unselectAllParamsRequest>[0]),
      ),
  });
  return true;
}
export function updateAllProjectMetadata(x: AllProjectMetadata) {
  useAllProjectMetadata.setState({
    ...x,
    projectMetadata: x.projectMetadata ?? [],
  });
}
function shouldSkipViewportDispatch(
  viewport: PendingViewportState,
  currentProjectState: ZustandProjectState,
): boolean {
  const snapshotUnchanged = _.isEqual(pendingViewportRef.snapshot, viewport);
  const currentMatches =
    _.isEqual(currentProjectState.projectConfig.viewport, viewport) &&
    currentProjectState.projectConfig.viewportInitialized ===
      (viewport !== null);
  return (
    !pendingViewportRef.hasQueuedSend &&
    !pendingViewportRef.opId &&
    snapshotUnchanged &&
    currentMatches
  );
}
function dispatchViewportUpdate(viewport: Viewport | null, immediate = false) {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  clearCompletedPendingOpId(pendingViewportRef);
  const currentProjectState = useProjectState.getState();
  if (shouldSkipViewportDispatch(viewport, currentProjectState)) {
    return;
  }
  pendingViewportRef.snapshot = viewport;
  pendingViewportRef.hasQueuedSend = true;
  useProjectState.setState((state) => {
    applyViewportSnapshotToProjectState(state, viewport);
  });
  if (!pendingViewportRef.opId) {
    pendingViewportRef.opId = addPendingOp(applyPendingViewport);
  }
  sendViewportToBackend();
  if (immediate) {
    sendViewportToBackend.flush();
  }
}
export const debouncedDispatchViewportUpdate = Object.assign(
  () => dispatchViewportUpdate(getCurrProjectConfigViewport()),
  {
    cancel: () => {
      sendViewportToBackend.cancel();
    },
    flush: () => {
      sendViewportToBackend.flush();
    },
  },
);
export function dispatchViewportUpdateImmediately() {
  debouncedDispatchViewportUpdate.cancel();
  dispatchViewportUpdate(getCurrProjectConfigViewport(), true);
}
