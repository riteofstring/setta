import type { ZustandProjectState } from "state/definitions";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import {
  buildLiveDictAreaSectionInput,
  type LiveDictAreaSectionInput,
} from "./groupContainerLiveDictAreaSectionInput";
import { buildLiveDictAreaSectionState } from "./groupContainerLiveDictAreaSectionState";

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

export function buildLiveDictAreaSectionBoundary({
  sectionId,
  state,
  ...input
}: LiveDictAreaSectionBoundaryInput): LiveDictAreaRenderBoundaryInput {
  return buildLiveDictAreaSectionInput({
    ...buildLiveDictAreaSectionState({ sectionId, state }),
    ...input,
    sectionId,
  });
}
