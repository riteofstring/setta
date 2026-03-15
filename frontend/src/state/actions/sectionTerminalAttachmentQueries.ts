import { type ZustandProjectState } from "state/definitions";
import { isBaseParentSectionImpl, SectionTypeEnum } from "utils/generatedTypes";
import { getEffectiveSectionImplIfPresent } from "./sectionEffectiveImplCore";
import { isBaseCodeSectionType } from "./sectionStructureQueries";

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
