import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  isBaseParentSectionImpl,
  ListRootViewModeEnum,
  SectionType,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { getSectionCore, getSectionImpl } from "./sectionEffectiveImplCore";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrSectionVariant,
} from "./sectionEffectiveImplSelectors";

export function isBaseCodeSectionType(sectionType: SectionType): boolean {
  return (
    sectionType === SectionTypeEnum.Code ||
    sectionType === SectionTypeEnum.GenPythonCode ||
    sectionType === SectionTypeEnum.GenPythonMetadata
  );
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
