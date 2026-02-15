import { dispatchOptimisticProjectStateUpdate } from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import { route_set_view_mode_sort_order } from "utils/generatedEndpoints";

export function applyViewModeSortOrder(
  state: ZustandProjectState,
  orderedViewModeIds: Array<string>,
): void {
  const viewModes = state.projectConfig.viewModes;
  if (orderedViewModeIds.length !== Object.keys(viewModes).length) {
    throw new Error(
      "orderedViewModeIds must include every view mode exactly once.",
    );
  }

  const seen = new Set<string>();
  for (const viewModeId of orderedViewModeIds) {
    if (!(viewModeId in viewModes)) {
      throw new Error(`View mode ${viewModeId} not found.`);
    }
    if (seen.has(viewModeId)) {
      throw new Error("orderedViewModeIds contains duplicates.");
    }
    seen.add(viewModeId);
  }

  orderedViewModeIds.forEach((viewModeId, index) => {
    viewModes[viewModeId].sortIndex = index;
  });
}

export function persistViewModeSortOrder(
  projectConfigId: string,
  orderedViewModeIds: Array<string>,
): void {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      applyViewModeSortOrder(state, orderedViewModeIds);
    },
    send: (frontendOpId) =>
      route_set_view_mode_sort_order({
        projectConfigId,
        orderedViewModeIds,
        frontendOpId,
      }),
  });
}
