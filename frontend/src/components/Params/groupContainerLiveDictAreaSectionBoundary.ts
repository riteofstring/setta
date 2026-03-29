import type { ZustandProjectState } from "state/definitions";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import {
  buildLiveDictAreaSectionInput,
  type LiveDictAreaSectionInput,
} from "./groupContainerLiveDictAreaSectionInput";
import {
  buildLiveDictAreaSectionState,
  type LiveDictAreaSectionState,
} from "./groupContainerLiveDictAreaSectionState";

export type LiveDictAreaSectionBoundaryInput = Pick<
  LiveDictAreaSectionInput,
  | "bgColor"
  | "canEditLayout"
  | "canEditStructure"
  | "handleColumnResizeStart"
  | "isSelectingParams"
  | "sectionId"
  | "sectionTypeName"
  | "unpinnedParamsAreaMinHeight"
> & {
  state: ZustandProjectState;
};

export type LiveDictAreaSectionBoundaryFromStateInput = Pick<
  LiveDictAreaSectionInput,
  | "bgColor"
  | "canEditLayout"
  | "canEditStructure"
  | "handleColumnResizeStart"
  | "isSelectingParams"
  | "sectionId"
  | "sectionTypeName"
  | "unpinnedParamsAreaMinHeight"
> & {
  sectionState: LiveDictAreaSectionState;
};

export function buildLiveDictAreaSectionBoundaryFromState({
  sectionState,
  ...input
}: LiveDictAreaSectionBoundaryFromStateInput): LiveDictAreaRenderBoundaryInput {
  return buildLiveDictAreaSectionInput({
    ...sectionState,
    ...input,
  });
}

export function buildLiveDictAreaSectionBoundary({
  sectionId,
  state,
  ...input
}: LiveDictAreaSectionBoundaryInput): LiveDictAreaRenderBoundaryInput {
  return buildLiveDictAreaSectionBoundaryFromState({
    ...input,
    sectionId,
    sectionState: buildLiveDictAreaSectionState({ sectionId, state }),
  });
}
