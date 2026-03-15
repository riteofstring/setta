import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import { route_set_section_sizes } from "utils/generatedEndpoints";
import { type SectionSize } from "utils/generatedTypes";

import { setSelfParentSiblingChildrenWidths } from "./sectionSizeState";

export function sendSectionSizes({
  sectionSizes,
  frontendOpId,
  projectConfigId = getCurrProjectConfigId(),
}: {
  sectionSizes: Record<string, SectionSize>;
  frontendOpId?: string;
  projectConfigId?: string;
}) {
  return route_set_section_sizes({
    projectConfigId,
    sectionSizes,
    frontendOpId,
  });
}

export function persistSectionSizeUpdate(
  sectionId: string,
  nextSize: Partial<SectionSize>,
): void {
  let updatedSectionSizes: Record<string, SectionSize> = {};
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      updatedSectionSizes = setSelfParentSiblingChildrenWidths(
        sectionId,
        nextSize,
        state,
      );
    },
    send: (frontendOpId) =>
      sendSectionSizes({
        sectionSizes: updatedSectionSizes,
        frontendOpId,
      }),
  });
}
