import {
  toggleParamSelected,
  unselectAllParams,
} from "state/actions/projectStateCommands";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
} from "state/actions/sectionEffectiveImpls";
import { useProjectState } from "state/definitions";
import {
  route_indent_params,
  route_move_param_groups,
  route_move_params,
  route_unindent_params,
} from "utils/generatedEndpoints";
import {
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { applyParamMove, type ParamMoveGroup } from "./paramMoveMutations";
import {
  buildVisibleSelectionGroups,
  getParamMovementContext,
  getParamUnindentContext,
} from "./paramMoveQueries";
import { resolveFullIndexForVisibleInsertion } from "./paramTree";

function insertItems<T>(arr: T[], index: number, items: T[]): T[] {
  return [...arr.slice(0, index), ...items, ...arr.slice(index)];
}

export function selectOnlyParam(sectionId: string, paramId: string) {
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (impl.selectedParams.length === 1 && impl.selectedParams[0] === paramId) {
    return;
  }
  unselectAllParams();
  toggleParamSelected(sectionId, paramId);
}

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
}) {
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

function moveParamGroupsWithBackend({
  sectionId,
  moves,
}: {
  sectionId: string;
  moves: ParamMoveGroup[];
}) {
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

export function moveSelectedParamsUp(): boolean {
  return moveSelectedParamsByOffset(-1);
}

export function moveSelectedParamsDown(): boolean {
  return moveSelectedParamsByOffset(1);
}

function moveSelectedParamsByOffset(direction: -1 | 1): boolean {
  const context = getParamMovementContext();
  if (!context) {
    return false;
  }
  const { sectionId, rootSelected, sharedParent, tree } = context;
  let visibleSiblings = tree.visibleChildrenByParent[sharedParent] ?? [];
  if (visibleSiblings.length === 0) {
    return false;
  }
  const selectedSet = new Set(rootSelected);
  const groups = buildVisibleSelectionGroups(visibleSiblings, selectedSet);
  if (groups.length === 0) {
    return false;
  }
  const state = useProjectState.getState();
  const parentImpl = getCurrEffectiveCodeObjImpl(
    state,
    sectionId,
    sharedParent,
  );
  if (!isBaseParentCodeObjImpl(parentImpl)) {
    return false;
  }
  let fullChildren = [...parentImpl.children];
  const groupsToProcess = direction < 0 ? groups : [...groups].reverse();
  const moves: ParamMoveGroup[] = [];

  for (const group of groupsToProcess) {
    const movingIds = new Set(group);
    const firstId = group[0];
    const lastId = group[group.length - 1];
    const firstIndex = visibleSiblings.indexOf(firstId);
    const lastIndex = visibleSiblings.indexOf(lastId);
    if (firstIndex < 0 || lastIndex < 0) {
      continue;
    }

    const remainingVisible = visibleSiblings.filter((id) => !movingIds.has(id));
    let targetVisibleIndex: number | null = null;
    if (direction < 0) {
      let prevId: string | null = null;
      for (let index = firstIndex - 1; index >= 0; index -= 1) {
        const candidate = visibleSiblings[index];
        if (!selectedSet.has(candidate)) {
          prevId = candidate;
          break;
        }
      }
      if (!prevId) {
        continue;
      }
      targetVisibleIndex = remainingVisible.indexOf(prevId);
    } else {
      let nextId: string | null = null;
      for (
        let index = lastIndex + 1;
        index < visibleSiblings.length;
        index += 1
      ) {
        const candidate = visibleSiblings[index];
        if (!selectedSet.has(candidate)) {
          nextId = candidate;
          break;
        }
      }
      if (!nextId) {
        continue;
      }
      targetVisibleIndex = remainingVisible.indexOf(nextId) + 1;
    }
    if (targetVisibleIndex === null) {
      continue;
    }

    const orderedGroupIds = fullChildren.filter((id) => movingIds.has(id));
    const newIndex = resolveFullIndexForVisibleInsertion({
      targetVisibleIndex,
      movingIds,
      visibleSiblings,
      fullChildren,
    });
    if (newIndex === null) {
      continue;
    }

    moves.push({
      paramIds: orderedGroupIds,
      newParentId: sharedParent,
      newIndex,
    });
    visibleSiblings = insertItems(
      remainingVisible,
      targetVisibleIndex,
      orderedGroupIds,
    );
    fullChildren = insertItems(
      fullChildren.filter((id) => !movingIds.has(id)),
      newIndex,
      orderedGroupIds,
    );
  }

  if (moves.length === 0) {
    return false;
  }
  moveParamGroupsWithBackend({ sectionId, moves });
  return true;
}
