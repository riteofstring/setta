import { updateDndChildren } from "forks/dnd-kit/dndChildren";
import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { Node } from "forks/xyflow/core/types";
import _ from "lodash";
import { unstable_batchedUpdates } from "react-dom";
import {
  getMessageCompletenessScore,
  mergeChatMessages,
} from "state/actions/chatMergeUtils";
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
  useSettings,
  useShareSession,
  useToolArgumentPreview,
  ZustandNodeInternalsState,
  ZustandProjectState,
} from "state/definitions";
import type { ResponseDataAndStatus } from "utils/endpointUtils";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_sections,
  route_group_sections,
  route_set_top_level_section_layout,
  route_set_viewport,
  route_toggle_param_selected,
  route_ungroup_groups,
  route_unselect_all_params,
} from "utils/generatedEndpoints";
import {
  AllProjectMetadata,
  BaseChatMessageUnion,
  BaseCodeObjImplUnion,
  BaseSectionImplUnion,
  CodeObjType,
  Core,
  createSettingsState,
  ImplArgsBundleMap,
  isBaseChildlessCodeObjImpl,
  isBaseParamCodeObjImpl,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  ListRootViewModeEnum,
  ProjectStateSingleConfig,
  ProjectStateSingleConfigWithCompletedOpIds,
  SectionType,
  SectionTypeEnum,
  Variant,
  Viewport,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { applyActiveSectionChange } from "./activeSectionController";
import { recordAuthoritativeProjectChatWindowingState } from "./projectChatWindowingAuthoritative";
import { reconcileProjectChatWindowingEphemeralState } from "./projectChatWindowingEphemeral";
import { resolveTopLevelSectionNodeSize } from "./topLevelSectionSizeAuthority";

const effectiveImplCacheByImpl = new WeakMap<
  object,
  WeakMap<object, WeakMap<object, unknown>>
>();

function getEffectiveImpl<T extends object>(
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

function getEffectiveSectionImplIfPresent(
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

type ChatSectionImpl = Extract<
  BaseSectionImplUnion,
  { type: SectionTypeEnum.Chat }
>;

function mergeStreamingChatSections(
  projectState: ProjectStateSingleConfig,
  currentState: ZustandProjectState,
): string[] {
  const mergedSectionIds: string[] = [];
  const incomingVariantMap = projectState.projectConfig.sectionVariantMap;
  const currentVariantMap = currentState.projectConfig.sectionVariantMap;

  for (const [sectionId, variantId] of Object.entries(incomingVariantMap)) {
    const variant = projectState.sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const incomingCore = projectState.sections[sectionId];
    if (!incomingCore) {
      continue;
    }
    const incomingImpl = projectState.sectionImpls[variant.impl];
    if (!incomingImpl || incomingImpl.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const currentVariantId = currentVariantMap[sectionId];
    if (!currentVariantId) {
      continue;
    }
    const currentVariant = currentState.sectionVariants[currentVariantId];
    if (!currentVariant) {
      continue;
    }
    const currentImpl = currentState.sectionImpls[currentVariant.impl];
    if (!currentImpl || currentImpl.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const currentCore = currentState.sections[sectionId];
    if (!currentCore) {
      continue;
    }
    const incomingChat = getEffectiveImpl(
      incomingImpl,
      incomingCore,
      variant,
    ) as ChatSectionImpl;
    const currentChat = getEffectiveImpl(
      currentImpl,
      currentCore,
      currentVariant,
    ) as ChatSectionImpl;

    const incomingMessages = Array.isArray(incomingChat.messages)
      ? incomingChat.messages
      : [];
    const currentMessages = Array.isArray(currentChat.messages)
      ? currentChat.messages
      : [];
    const incomingToolArgs = incomingChat.toolCallArguments ?? {};
    const currentToolArgs = currentChat.toolCallArguments ?? {};
    const incomingInputText = incomingChat.inputText ?? "";
    const currentInputText = currentChat.inputText ?? "";
    const shouldPreserveStreaming = isSectionStreamActive(sectionId);
    const shouldMergeFast =
      shouldPreserveStreaming ||
      currentMessages.length > incomingMessages.length ||
      Object.keys(currentToolArgs).length >
        Object.keys(incomingToolArgs).length ||
      currentInputText.length > incomingInputText.length;
    const shouldMerge = shouldMergeFast
      ? true
      : hasMoreCompleteChatMessages(currentMessages, incomingMessages);
    if (!shouldMerge) {
      continue;
    }

    const mergedMessages = mergeChatMessages(incomingMessages, currentMessages);
    const mergedToolArgs = {
      ...incomingToolArgs,
      ...currentToolArgs,
    };
    const mergedInputText =
      currentInputText.length > incomingInputText.length
        ? currentInputText
        : incomingInputText;
    const mergedWaitingForResponse = shouldPreserveStreaming
      ? incomingChat.waitingForResponse || currentChat.waitingForResponse
      : incomingChat.waitingForResponse;
    setEffectiveImplValue<"ChatSection">(incomingImpl, incomingCore, variant, {
      messages: mergedMessages,
      toolCallArguments: mergedToolArgs,
      inputText: mergedInputText,
      waitingForResponse: mergedWaitingForResponse,
    });
    mergedSectionIds.push(sectionId);
  }

  return mergedSectionIds;
}

function hasMoreCompleteChatMessages(
  currentMessages: Array<BaseChatMessageUnion>,
  incomingMessages: Array<BaseChatMessageUnion>,
): boolean {
  if (currentMessages.length === 0) {
    return false;
  }
  if (incomingMessages.length === 0) {
    return currentMessages.length > 0;
  }
  const incomingById = new Map<string, BaseChatMessageUnion>();
  for (const message of incomingMessages) {
    incomingById.set(message.id, message);
  }
  for (const message of currentMessages) {
    const incoming = incomingById.get(message.id);
    if (!incoming) {
      return true;
    }
    if (
      getMessageCompletenessScore(message) >
      getMessageCompletenessScore(incoming)
    ) {
      return true;
    }
  }
  return false;
}

export function isBaseCodeSectionType(sectionType: SectionType): boolean {
  return (
    sectionType === SectionTypeEnum.Code ||
    sectionType === SectionTypeEnum.GenPythonCode ||
    sectionType === SectionTypeEnum.GenPythonMetadata
  );
}

type EmbeddedAttachedTerminalInfo = {
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
  typeGuard: (impl) => impl is T,
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
  typeGuard: (impl) => impl is T,
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

function getEffectiveImplFromVariantMap(
  id: string,
  impls: ZustandProjectState["codeObjImpls"],
  cores: ZustandProjectState["codeObjs"],
  variants: ZustandProjectState["codeObjVariants"],
  variantMap: Record<string, string>,
) {
  const variantId = variantMap[id];
  const variant = variants[variantId];
  if (!variant) {
    throw new Error();
  }
  const baseImpl = impls[variant.impl];
  const core = cores[id];
  if (!baseImpl || !core) {
    throw new Error();
  }
  return getEffectiveImpl(baseImpl, core, variant);
}

function setEffectiveImplValue<K extends keyof ImplArgsBundleMap>(
  impl: ImplArgsBundleMap[K]["impl"],
  core: Core,
  variant: Variant,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const curr = getEffectiveImpl(impl, core, variant);
  for (const [k, v] of Object.entries(args)) {
    const currV = curr[k];
    if (!core.unsharedKeys.includes(k)) {
      core.sharedModifier[k] = typeof v === "function" ? v(currV) : v;
    } else if (!impl.isPreset) {
      impl[k] = typeof v === "function" ? v(currV) : v;
    } else {
      variant.modifier[k] = typeof v === "function" ? v(currV) : v;
    }
  }
  effectiveImplCacheByImpl.delete(impl);
  return getEffectiveImpl(impl, core, variant);
}

export function setCurrEffectiveSectionImplValue<
  K extends keyof ImplArgsBundleMap,
>(
  state: ZustandProjectState,
  sectionId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getCurrSectionVariant(state, sectionId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}

export function setSectionVariantImplValue<K extends keyof ImplArgsBundleMap>(
  state: ZustandProjectState,
  sectionId: string,
  variantId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getSectionVariant(state, variantId);
  const impl = getSectionImpl(state, variant.impl);
  const core = getSectionCore(state, sectionId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
}

export function setCurrEffectiveCodeObjImplValue<
  K extends keyof ImplArgsBundleMap,
>(
  state: ZustandProjectState,
  sectionId: string,
  codeObjId: string,
  args: ImplArgsBundleMap[K]["args"],
): ImplArgsBundleMap[K]["impl"] {
  const variant = getCurrCodeObjVariant(state, sectionId, codeObjId);
  const impl = getCodeObjImpl(state, variant.impl);
  const core = getCodeObjCore(state, codeObjId);
  return setEffectiveImplValue<K>(impl, core, variant, args);
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
  const nextPinnedTopLevel: Array<string> = [];
  const nextUnpinnedTopLevel: Array<string> = [];
  for (const paramId of shown.pinned.topLevelParamIds) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedTopLevel.push(paramId);
    } else {
      nextUnpinnedTopLevel.push(paramId);
    }
  }
  for (const paramId of shown.unpinned.topLevelParamIds) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedTopLevel.push(paramId);
    } else {
      nextUnpinnedTopLevel.push(paramId);
    }
  }
  const nextPinnedRequired: Record<string, Array<string>> = {};
  const nextUnpinnedRequired: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(
    shown.pinned.requiredParamIdsToPaths,
  )) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedRequired[paramId] = path;
    } else {
      nextUnpinnedRequired[paramId] = path;
    }
  }
  for (const [paramId, path] of Object.entries(
    shown.unpinned.requiredParamIdsToPaths,
  )) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedRequired[paramId] = path;
    } else {
      nextUnpinnedRequired[paramId] = path;
    }
  }

  state.shownParamIds[variantId] = {
    pinned: {
      ...shown.pinned,
      topLevelParamIds: nextPinnedTopLevel,
      requiredParamIdsToPaths: nextPinnedRequired,
    },
    unpinned: {
      ...shown.unpinned,
      topLevelParamIds: nextUnpinnedTopLevel,
      requiredParamIdsToPaths: nextUnpinnedRequired,
    },
  };
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

export function manualDndChildrenReset() {
  updateDndChildren(
    getDisplayedSectionIdToChildren(useProjectState.getState()),
  );
}

function getComparableProjectState(
  state: ProjectStateSingleConfig | ZustandProjectState,
): ProjectStateSingleConfig {
  return sanitizeProjectStateActiveIds({
    sections: state.sections,
    sectionImpls: state.sectionImpls,
    sectionVariants: state.sectionVariants,
    codeObjs: state.codeObjs,
    codeObjImpls: state.codeObjImpls,
    codeObjVariants: state.codeObjVariants,
    artifactGroups: state.artifactGroups,
    projectConfig: state.projectConfig,
    singletonSections: state.singletonSections,
    parentSectionMap: state.parentSectionMap,
    shownParamIds: state.shownParamIds,
    requiredDecodedImages: state.requiredDecodedImages,
    genCodeBinding: state.genCodeBinding ?? null,
    projectChatWindowing: state.projectChatWindowing,
  });
}

export function processProjectStateUpdateFromBackend(
  x: ProjectStateSingleConfigWithCompletedOpIds,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (x.projectState.projectConfig.id !== projectConfigId) {
    return;
  }
  const currentState = useProjectState.getState();
  mergeStreamingChatSections(x.projectState, currentState);
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
  reconcilePendingTopLevelLayout(nextPending, backendPendingIds, completedIds);
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

function applyViewportFromProjectState(
  projectState: ProjectStateSingleConfig,
): boolean {
  const { viewport, viewportInitialized } = projectState.projectConfig;
  const currentConfig = useProjectState.getState().projectConfig;
  const viewModeChanged =
    currentConfig.activeViewModeId !==
    projectState.projectConfig.activeViewModeId;
  const viewportChanged =
    !_.isEqual(currentConfig.viewport, viewport) ||
    currentConfig.viewportInitialized !== viewportInitialized;
  if (!viewportChanged && !viewModeChanged) {
    return false;
  }
  debouncedDispatchViewportUpdate.cancel();
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

function getFitViewOptionsForVisibleSections(
  projectState: ProjectStateSingleConfig,
) {
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

function clearToolArgumentPreviewForProjectState(
  projectConfigId: string,
  projectState: ZustandProjectState,
) {
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCodeBySectionId,
    )) {
      const sectionImpl = getEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      if (!sectionImpl || sectionImpl.type !== SectionTypeEnum.Code) {
        delete previewState.previewCodeBySectionId[sectionId];
        continue;
      }
      if (sectionImpl.code === entry.value) {
        delete previewState.previewCodeBySectionId[sectionId];
      }
    }
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
      const { callable } = sectionImpl;
      let canonicalName = "";
      if (callable) {
        const codeObj = projectState.codeObjs[callable];
        if (!codeObj) {
          delete previewState.previewCallableNameBySectionId[sectionId];
          continue;
        }
        canonicalName = codeObj.name;
      }
      if (canonicalName === entry.value) {
        delete previewState.previewCallableNameBySectionId[sectionId];
      }
    }
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
        if (!impl || !isBaseChildlessCodeObjImpl(impl)) {
          delete paramEntries[paramInfoId];
          continue;
        }
        if (impl.value === entry.value) {
          delete paramEntries[paramInfoId];
        }
      }
      if (Object.keys(paramEntries).length === 0) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
      }
    }
    if (
      Object.keys(previewState.previewCodeBySectionId).length === 0 &&
      Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
      Object.keys(previewState.previewParamValueBySectionAndParamId).length ===
        0
    ) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}

function updateProjectState({
  sections,
  variants,
  uiTypes,
  uiTypeCols,
  codeInfo,
  codeInfoCols,
  state,
}) {
  state.sections = { ...state.sections, ...sections };
  state.variants = { ...state.variants, ...variants };
  state.uiTypes = { ...state.uiTypes, ...uiTypes };
  state.uiTypeCols = { ...state.uiTypeCols, ...uiTypeCols };
  state.codeInfo = { ...state.codeInfo, ...codeInfo };
  state.codeInfoCols = { ...state.codeInfoCols, ...codeInfoCols };
}

export function createNodesMapFromProjectConfigChildren(
  p: ZustandProjectState,
  nodes: ZustandNodeInternalsState["x"],
  sectionSizingPolicy = useSettings.getState().sectionSizingPolicy ??
    createSettingsState().sectionSizingPolicy,
) {
  const nodesMap: Map<string, Node> = new Map();
  const darkMode = useLocalStorage.getState().darkMode;
  const { activeViewModeId, viewModes } = p.projectConfig;
  const topLevelSections = getActiveViewModeTopLevelSections(p);
  const topLevelSectionIds = getTopLevelSectionIdsForDisplay(p);
  const canFilterByView =
    Boolean(activeViewModeId) &&
    Boolean(activeViewModeId && viewModes[activeViewModeId]);

  for (const sectionId of topLevelSectionIds) {
    const layout = topLevelSections[sectionId];
    if (!layout) {
      continue;
    }
    const currentNode = nodes.get(sectionId);
    if (canFilterByView) {
      const visibilityInfo = getSectionViewModeVisibilityIfPresent(
        sectionId,
        p,
      );
      if (!visibilityInfo) {
        continue;
      }
      if (
        !getSectionShouldRender(
          visibilityInfo.visibility,
          visibilityInfo.isEditingViewMode,
        )
      ) {
        continue;
      }
    }
    const sectionImpl = getEffectiveSectionImplIfPresent(p, sectionId);
    const sectionTheme =
      sectionImpl?.styleColor !== null &&
      sectionImpl?.styleColor !== undefined &&
      sectionImpl.styleColor.trim() !== ""
        ? deriveSectionStyleTheme(sectionImpl.styleColor, darkMode)
        : null;
    const authoritativeSize = resolveTopLevelSectionNodeSize({
      configuredSize: sectionImpl?.size ?? null,
      currentNode,
      layout,
      sectionSizingPolicy,
      sectionTypeName: sectionImpl?.type,
    });
    nodesMap.set(sectionId, {
      id: sectionId,
      position: { x: layout.x, y: layout.y },
      width: authoritativeSize.width,
      height: authoritativeSize.height,
      sizeAuthority: authoritativeSize.sizeAuthority,
      zIndex: layout.zIndex,
      tempZIndex: layout.zIndex,
      ...(sectionImpl?.type ? { type: sectionImpl.type } : {}),
      ...(sectionTheme ? { style: { background: sectionTheme.bg } } : {}),
    });
  }

  return nodesMap;
}

export function getAuthoritativeTopLevelSectionNodeSize(
  layout: { h: number | null; w: number | null },
  currentNode: Pick<Node, "height" | "width"> | undefined,
) {
  if (hasPositiveTopLevelSectionNodeSize(layout.w, layout.h)) {
    return { width: layout.w, height: layout.h };
  }

  const currentNodeWidth = currentNode?.width ?? null;
  const currentNodeHeight = currentNode?.height ?? null;
  if (hasPositiveTopLevelSectionNodeSize(currentNodeWidth, currentNodeHeight)) {
    return {
      width: currentNodeWidth,
      height: currentNodeHeight,
    };
  }

  return {
    width: null,
    height: null,
  };
}

export function getPersistedTopLevelSectionLayoutSize(
  currentNode: Pick<Node, "height" | "sizeAuthority" | "width"> | undefined,
) {
  if (
    currentNode?.sizeAuthority === "sectionModel" ||
    currentNode?.sizeAuthority === "none"
  ) {
    return {
      w: null,
      h: null,
    };
  }

  const width = currentNode?.width ?? null;
  const height = currentNode?.height ?? null;
  if (hasPositiveTopLevelSectionNodeSize(width, height)) {
    return {
      w: width,
      h: height,
    };
  }
  return {
    w: null,
    h: null,
  };
}

function hasPositiveTopLevelSectionNodeSize(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  return (
    typeof width === "number" &&
    width > 0 &&
    typeof height === "number" &&
    height > 0
  );
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

function getCodeChildrenAndParentCodeInfoId(
  sectionId,
  state,
  variantId = null,
) {
  const sectionVariant = variantId
    ? state.variants[variantId]
    : getDisplayedSectionVariant(sectionId, state);
  const { codeInfoColId } = sectionVariant;
  const parentCodeInfoId = sectionVariant.selectedItem;

  const codeInfoChildren = codeInfoColId
    ? state.codeInfoCols[codeInfoColId].children
    : createCodeInfoCol().children;

  return { codeInfoChildren, parentCodeInfoId };
}

export function getSectionShouldRender(
  visibility: boolean,
  isEditingViewMode: boolean,
) {
  return isEditingViewMode || visibility;
}

export function getActiveViewModeConfig(state: ProjectStateSingleConfig) {
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

export function getActiveViewModeTopLevelSections(
  projectState: ProjectStateSingleConfig,
) {
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
): { visibility: boolean; isEditingViewMode: boolean } | null {
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
  route_delete_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds: getActiveSectionUIIds(),
  });
}

export function createTopLevelSectionLayoutDict(
  sections: ProjectStateSingleConfig["sections"],
  nodeInternals: ZustandNodeInternalsState["x"],
  existingLayouts:
    | ProjectStateSingleConfig["projectConfig"]["topLevelSections"]
    | null = null,
) {
  const topLevelSections: ProjectStateSingleConfig["projectConfig"]["topLevelSections"] =
    {};
  if (existingLayouts) {
    for (const [sectionId, layout] of Object.entries(existingLayouts)) {
      if (sectionId in sections) {
        topLevelSections[sectionId] = { ...layout };
      }
    }
  }
  for (const c of nodeInternals.values()) {
    if (c.id in sections) {
      // need this filter because some sections might be temporary
      const existing = topLevelSections[c.id];
      const persistedSize = getPersistedTopLevelSectionLayoutSize(c);
      topLevelSections[c.id] = {
        x: c.position.x,
        y: c.position.y,
        zIndex: c.zIndex ?? existing?.zIndex ?? 0,
        // Preserve existing layouts only for sections missing from node internals.
        // Once a live node reports no size, keep that lack of authority explicit.
        w: persistedSize.w,
        h: persistedSize.h,
      };
    }
  }
  return topLevelSections;
}

type TopLevelSectionLayoutMap =
  ProjectStateSingleConfig["projectConfig"]["topLevelSections"];

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
  const result = route_set_top_level_section_layout({
    projectConfigId,
    topLevelSections: snapshot,
    frontendOpId: opId,
  });
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

function reconcilePendingTopLevelLayout(
  nextPending: PendingOperation[],
  backendPendingIds: Set<string>,
  completedIds: Set<string>,
) {
  const currentOpId = pendingTopLevelLayoutRef.opId;
  if (!currentOpId) {
    return;
  }
  const currentPendingOp = nextPending.find((op) => op.opId === currentOpId);
  const backendStillTracksCurrentOp =
    backendPendingIds.has(currentOpId) || completedIds.has(currentOpId);
  if (
    currentPendingOp?.acknowledged &&
    !pendingTopLevelLayoutRef.hasQueuedSend &&
    !backendStillTracksCurrentOp
  ) {
    pendingTopLevelLayoutRef.opId = null;
    pendingTopLevelLayoutRef.snapshot = null;
    pendingTopLevelLayoutRef.hasQueuedSend = false;
    const nextPendingIndex = nextPending.findIndex(
      (op) => op.opId === currentOpId,
    );
    if (nextPendingIndex >= 0) {
      nextPending.splice(nextPendingIndex, 1);
    }
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
  if (pendingTopLevelLayoutRef.opId) {
    const pendingOps = usePendingOperations.getState().pending;
    const stillPending = pendingOps.some(
      (opInfo) => opInfo.opId === pendingTopLevelLayoutRef.opId,
    );
    if (!stillPending) {
      pendingTopLevelLayoutRef.opId = null;
    }
  }
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
  const reactFlowState = useReactFlow.getState();
  return reactFlowState.fitViewOnInit ||
    !reactFlowState.viewportPersistenceEnabled
    ? null
    : getViewport();
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
  route_group_sections({
    projectConfigId: getCurrProjectConfigId(),
    sectionIds,
  });
  useReactFlow.setState({ nodesSelectionDims: null });
}

export async function ungroupActiveGroups() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  const groupIds = getActiveSectionUIIds();
  route_ungroup_groups({ projectConfigId: getCurrProjectConfigId(), groupIds });
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
  const result = send(opId);
  if (result instanceof Promise) {
    void result
      .then((res) => {
        // A 200 response means the backend accepted the op; don't keep reapplying it.
        if (isResponseDataAndStatus(res) && res200(res)) {
          if (
            projectConfigId !== undefined &&
            useProjectState.getState().projectConfig.id !== projectConfigId
          ) {
            removePendingOp(opId);
            return;
          }
          acknowledgePendingOp(opId);
        } else if (isResponseDataAndStatus(res)) {
          rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
        }
      })
      .catch(() => {
        rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
      });
  }
  return opId;
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
      route_toggle_param_selected({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        paramInfoId,
        frontendOpId,
      }),
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
      route_unselect_all_params({
        projectConfigId: getCurrProjectConfigId(),
        frontendOpId,
      }),
  });

  return true;
}

export function updateAllProjectMetadata(x: AllProjectMetadata) {
  useAllProjectMetadata.setState(x);
}

function dispatchViewportUpdate(viewport: Viewport | null) {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  if (_.isEqual(useProjectState.getState().projectConfig.viewport, viewport)) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      state.projectConfig.viewport = viewport;
      state.projectConfig.viewportInitialized = viewport !== null;
    },
    send: (frontendOpId) =>
      route_set_viewport({
        projectConfigId,
        viewport,
        frontendOpId,
      }),
  });
}

export const debouncedDispatchViewportUpdate = _.debounce(
  () => dispatchViewportUpdate(getCurrProjectConfigViewport()),
  1000,
);

export async function persistCurrentViewportImmediately(): Promise<void> {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  // View-mode switches need the current camera on the backend before the mode changes.
  debouncedDispatchViewportUpdate.cancel();
  await route_set_viewport({
    projectConfigId,
    viewport: getCurrProjectConfigViewport(),
  });
}
