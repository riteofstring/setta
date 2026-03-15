import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "state/actions/sectionEffectiveImplSelectors";
import {
  route_indent_params,
  route_move_param_groups,
  route_move_params,
  route_unindent_params,
} from "utils/generatedEndpoints";

import { applyParamMove, type ParamMoveGroup } from "./paramMoveMutations";
import {
  getParamMovementContext,
  getParamUnindentContext,
} from "./paramMoveSelectionContext";

export function moveParamsWithBackend({
  sectionId,
  paramIds,
  newParentId,
  newIndex,
}: {
  sectionId: string;
  paramIds: string[];
  newParentId: string;
  newIndex: number;
}): void {
  if (paramIds.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      applyParamMove(state, sectionId, {
        paramIds,
        newParentId,
        newIndex,
      });
    },
    send: (frontendOpId) =>
      route_move_params({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        paramIds,
        newParentId,
        newIndex,
        frontendOpId,
      }),
  });
}

export function moveParamGroupsWithBackend({
  sectionId,
  moves,
}: {
  sectionId: string;
  moves: ParamMoveGroup[];
}): void {
  if (moves.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const move of moves) {
        applyParamMove(state, sectionId, move);
      }
    },
    send: (frontendOpId) =>
      route_move_param_groups({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        moves,
        frontendOpId,
      }),
  });
}

export function indentSelectedParams(): boolean {
  const context = getParamMovementContext();
  if (!context) {
    return false;
  }
  route_indent_params({
    projectConfigId: getCurrProjectConfigId(),
    sectionId: context.sectionId,
    paramIds: context.rootSelected,
  });
  return true;
}

export function unindentSelectedParams(): boolean {
  const context = getParamUnindentContext();
  if (!context) {
    return false;
  }
  route_unindent_params({
    projectConfigId: getCurrProjectConfigId(),
    sectionId: context.sectionId,
    paramIds: context.rootSelected,
  });
  return true;
}
