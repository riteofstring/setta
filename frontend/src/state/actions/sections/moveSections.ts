import { useProjectState } from "state/definitions";
import {
  route_move_sections,
  route_set_code_section_attached_terminal,
} from "utils/generatedEndpoints";
import { dispatchOptimisticProjectStateUpdate } from "../projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "../sectionEffectiveImplSelectors";
import { shouldUseAttachedTerminalRoute } from "./moveSectionQueries";
import {
  moveSectionsInState,
  type MoveSectionsInput,
} from "./moveSectionState";

export function moveSectionsWithBackend({
  sectionIds,
  newParentId,
  newIndex,
  positionsById,
}: MoveSectionsInput): void {
  if (sectionIds.length === 0) {
    return;
  }
  const stableSectionIds = [...sectionIds];
  const stablePositionsById = positionsById
    ? Object.fromEntries(
        Object.entries(positionsById).map(([id, position]) => [
          id,
          { x: position.x, y: position.y },
        ]),
      )
    : null;
  const stableNewParentId = newParentId;
  const stableNewIndex = newIndex;
  const state = useProjectState.getState();
  const useAttachedTerminalRoute = shouldUseAttachedTerminalRoute({
    state,
    sectionIds: stableSectionIds,
    newParentId: stableNewParentId,
  });
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      moveSectionsInState({
        sectionIds: stableSectionIds,
        newParentId: stableNewParentId,
        newIndex: stableNewIndex,
        positionsById: stablePositionsById,
        state,
      });
    },
    send: (frontendOpId) => {
      if (useAttachedTerminalRoute && stableNewParentId) {
        return route_set_code_section_attached_terminal({
          projectConfigId: getCurrProjectConfigId(),
          sectionId: stableNewParentId,
          terminalSectionId: stableSectionIds[0] ?? null,
          frontendOpId,
        });
      }
      return route_move_sections({
        projectConfigId: getCurrProjectConfigId(),
        sectionIds: stableSectionIds,
        newParentId: stableNewParentId,
        newIndex: stableNewIndex,
        positionsById: stablePositionsById,
        frontendOpId,
      });
    },
  });
}
