import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  isBaseParentSectionImpl,
  ListRootViewModeEnum,
  SectionType,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrSectionVariant,
  getEffectiveSectionImplIfPresent,
  getSectionCore,
  getSectionImpl,
} from "./sectionEffectiveImpls";

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

type SectionQueryArgs = {
  state: ZustandProjectState;
  sectionId: string;
};

function resolveSectionQueryArgs(
  stateOrSectionId: ZustandProjectState | string,
  sectionIdOrState?: ZustandProjectState | string,
): SectionQueryArgs {
  if (typeof stateOrSectionId === "string") {
    if (sectionIdOrState === undefined) {
      return {
        state: useProjectState.getState(),
        sectionId: stateOrSectionId,
      };
    }
    if (typeof sectionIdOrState === "string") {
      throw new Error("Expected project state for second getSectionType arg");
    }
    return {
      state: sectionIdOrState,
      sectionId: stateOrSectionId,
    };
  }
  if (typeof sectionIdOrState !== "string") {
    throw new Error("Expected section id for getSectionType");
  }
  return {
    state: stateOrSectionId,
    sectionId: sectionIdOrState,
  };
}

export function getSectionType(sectionId: string): SectionType;
export function getSectionType(
  state: ZustandProjectState,
  sectionId: string,
): SectionType;
export function getSectionType(
  sectionId: string,
  state: ZustandProjectState,
): SectionType;
export function getSectionType(
  stateOrSectionId: ZustandProjectState | string,
  sectionIdOrState?: ZustandProjectState | string,
): SectionType {
  const { state, sectionId } = resolveSectionQueryArgs(
    stateOrSectionId,
    sectionIdOrState,
  );
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
